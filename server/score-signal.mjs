/**
 * Deterministic + AI-assisted scoring for Radar signals — replaces the old
 * binary aiIntent (yes/no/unclear) with a 0-100 numeric score and an
 * A/B/C/D category, per the operational strategy.
 *
 * Each criterion below is regex-only where the strategy gave a literal
 * word/pattern list, and AI-only where it's explicitly annotated
 * "(определяет AI, см. ниже)" in the brief (hasNiche, authorType — these
 * have no fixed word list, only an LLM can judge them from context).
 *
 * The three negative "type of post" criteria (vacancy / competitor ad /
 * student project) fire on regex OR the matching classify-intent.mjs
 * boolean — a fixed word list catches literal phrasing ("вакансия"), but
 * classifyIntent's semantic read catches the same intent phrased
 * differently ("ищем человека в штат с окладом", no literal "вакансия").
 * Either signal is sufficient; the penalty is applied once, never twice.
 */

// JS regex \b is ASCII-only (\w = [A-Za-z0-9_]), so it silently never
// matches at a Cyrillic letter boundary — \bбот\b, в штат\b, и т.д. never
// fire at all (confirmed live), while naively dropping \b instead lets
// short stems like "бот" false-positive inside unrelated words ("работа").
// These two lookarounds are the Cyrillic-safe replacement for \b.
const NOT_CYR_BEFORE = '(?<![а-яёА-ЯЁ])';
const NOT_CYR_AFTER = '(?![а-яёА-ЯЁ])';

const DIRECT_REQUEST_RE = /ищу|нужен|нужна|нужно|кто сделает|посоветуйте|требуется/i;
const SOLUTION_TYPE_RE = new RegExp(
  [
    `${NOT_CYR_BEFORE}платформ`,
    '\\bcrm\\b',
    `${NOT_CYR_BEFORE}кабинет`,
    `${NOT_CYR_BEFORE}бот${NOT_CYR_AFTER}`,
    `${NOT_CYR_BEFORE}сайт`,
    `${NOT_CYR_BEFORE}сервис`,
    `${NOT_CYR_BEFORE}каталог`,
    `${NOT_CYR_BEFORE}бронирован`,
  ].join('|'),
  'i',
);
const BUDGET_RE = new RegExp(
  `${NOT_CYR_BEFORE}до\\s*\\d+\\s*(?:к|тыс|млн)?|бюджет\\s*[:\\s]*\\d+|\\d+\\s*(?:₽|руб)`,
  'i',
);
const URGENCY_RE = /срочно|до конца месяца|на этой неделе/i;
const URL_RE = /https?:\/\/\S+|(?:^|\s)(?:www\.)?[a-z0-9-]+\.(?:ru|com|рф|net|org)/i;
const CONTACT_RE = /\+7[\d\s\-()]{9,}|@[a-zA-Z0-9_]{4,}|пишите в личку|пиши в личку/i;

const VACANCY_RE = /вакансия|в штат|резюме|оформление по тк|зарплата|график работы/i;
const COMPETITOR_AD_RE = /делаем сайты|наша студия|портфолио|работаем с 20\d{2} года/i;
const STUDENT_RE = /для диплома|учебн|курсовая|для практики/i;
const CHEAP_FREELANCE_RE = /бюджет\s*5\s?000|недорого|студенту|на первое время/i;

const MS_24H = 24 * 60 * 60 * 1000;
const MS_72H = 72 * 60 * 60 * 1000;

/** @param {{ date?: string | null, foundAt?: string }} signal */
function ageMs(signal) {
  const ts = signal.date ?? signal.foundAt;
  if (!ts) return Infinity;
  const parsed = new Date(ts).getTime();
  return Number.isFinite(parsed) ? Date.now() - parsed : Infinity;
}

/**
 * @param {{ text?: string, date?: string | null, foundAt?: string }} signal
 * @param {{ isRequest?: boolean, solutionType?: string | null, hasNiche?: boolean, authorType?: string, isVacancy?: boolean, isCompetitorAd?: boolean, isStudentProject?: boolean }} [aiAnalysis]
 * @returns {{ score: number, category: 'A' | 'B' | 'C' | 'D', breakdown: { criterion: string, points: number, matched: boolean }[] }}
 */
export function scoreSignal(signal, aiAnalysis = {}) {
  const text = String(signal?.text ?? '');
  const age = ageMs(signal);
  const hasUrl = URL_RE.test(text);
  const hasContact = CONTACT_RE.test(text) || hasUrl;

  const is24h = age <= MS_24H;
  const is72h = age > MS_24H && age <= MS_72H;

  /** @type {{ criterion: string, points: number, matched: boolean }[]} */
  const rows = [
    { criterion: 'Прямой запрос', points: 35, matched: DIRECT_REQUEST_RE.test(text) || aiAnalysis.isRequest === true },
    { criterion: 'Указан тип решения', points: 20, matched: SOLUTION_TYPE_RE.test(text) || Boolean(aiAnalysis.solutionType) },
    { criterion: 'Указана ниша/бизнес-контекст', points: 10, matched: aiAnalysis.hasNiche === true },
    { criterion: 'Указан бюджет', points: 15, matched: BUDGET_RE.test(text) },
    { criterion: 'Есть срок/срочность', points: 15, matched: URGENCY_RE.test(text) },
    {
      criterion: 'Автор — собственник/руководитель',
      points: 10,
      matched: aiAnalysis.authorType === 'owner' || aiAnalysis.authorType === 'manager',
    },
    { criterion: 'Есть ссылка на бизнес/сайт/аккаунт', points: 10, matched: hasUrl },
    { criterion: 'Опубликовано < 24ч назад', points: 10, matched: is24h },
    { criterion: 'Опубликовано < 72ч назад', points: 5, matched: is72h },

    {
      criterion: 'Вакансия в штат',
      points: -35,
      matched: VACANCY_RE.test(text) || aiAnalysis.isVacancy === true,
    },
    {
      criterion: 'Реклама услуг конкурента',
      points: -50,
      matched: COMPETITOR_AD_RE.test(text) || aiAnalysis.isCompetitorAd === true,
    },
    {
      criterion: 'Учебный/курсовой проект',
      points: -40,
      matched: STUDENT_RE.test(text) || aiAnalysis.isStudentProject === true,
    },
    { criterion: 'Фриланс до 30к без потенциала', points: -25, matched: CHEAP_FREELANCE_RE.test(text) },
    { criterion: 'Нет контакта и нет ссылки', points: -10, matched: !hasContact },
  ];

  const raw = rows.reduce((sum, r) => sum + (r.matched ? r.points : 0), 0);
  const score = Math.max(0, Math.min(100, raw));

  return { score, category: categoryForScore(score), breakdown: rows };
}

/** @param {number} score */
export function categoryForScore(score) {
  if (score >= 70) return 'A';
  if (score >= 50) return 'B';
  if (score >= 30) return 'C';
  return 'D';
}

const URGENCY_BY_CATEGORY = { A: 'high', B: 'medium', C: 'low', D: 'low' };

/** @param {'A' | 'B' | 'C' | 'D'} category */
export function urgencyForCategory(category) {
  return URGENCY_BY_CATEGORY[category] ?? 'low';
}

const RECOMMENDED_ACTION_BY_CATEGORY = {
  A: 'Срочно реагировать, уведомить в Telegram',
  B: 'Проверить сегодня, в ежедневную подборку',
  C: 'Наблюдать, не писать без ручной оценки',
  D: 'Архив, не выводить в рабочую очередь',
};

/** @param {'A' | 'B' | 'C' | 'D'} category */
export function recommendedActionForCategory(category) {
  return RECOMMENDED_ACTION_BY_CATEGORY[category] ?? RECOMMENDED_ACTION_BY_CATEGORY.D;
}

/** @param {{ criterion: string, points: number, matched: boolean }[]} breakdown */
export function evidenceFromBreakdown(breakdown) {
  return breakdown
    .filter((r) => r.matched)
    .map((r) => r.criterion)
    .join(', ');
}
