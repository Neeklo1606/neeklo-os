const SOLUTION_TYPES = ['платформа', 'crm', 'бот', 'сайт', 'кабинет', 'каталог', 'бронирование', 'автоматизация'];
const AUTHOR_TYPES = ['owner', 'manager', 'employee', 'unknown'];

const INTENT_PROMPT = (signalText) => `Проанализируй сообщение. Ответь строго JSON:
{
  "isRequest": true|false,
  "solutionType": "платформа"|"crm"|"бот"|"сайт"|"кабинет"|"каталог"|"бронирование"|"автоматизация"|null,
  "hasNiche": true|false,
  "authorType": "owner"|"manager"|"employee"|"unknown",
  "isVacancy": true|false,
  "isCompetitorAd": true|false,
  "isStudentProject": true|false,
  "reason": "до 15 слов"
}

isRequest — это запрос на исполнителя (ищет, кто сделает, разработчика, подрядчика)?
solutionType — какой тип решения упомянут, если есть; null если не указан или неприменимо
hasNiche — указан бизнес-контекст/ниша автора (например «у меня стоматология», «для магазина»)?
authorType — owner (собственник/ИП/фаундер), manager (руководитель/директор направления),
  employee (рядовой сотрудник без права решения), unknown (не определить из текста)
isVacancy — это вакансия в штат, а не разовый заказ/проект?
isCompetitorAd — это реклама студии/фрилансера, предлагающего свои услуги, а не запрос?
isStudentProject — это учебный/курсовой/дипломный проект без реального бюджета?
reason — краткое обоснование до 15 слов

Сообщение: «${signalText}»`;

/**
 * @param {import('./openrouter.mjs').ReturnType<typeof import('./openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {string} signalText
 * @returns {Promise<{
 *   isRequest: boolean,
 *   solutionType: string | null,
 *   hasNiche: boolean,
 *   authorType: 'owner' | 'manager' | 'employee' | 'unknown',
 *   isVacancy: boolean,
 *   isCompetitorAd: boolean,
 *   isStudentProject: boolean,
 *   reason: string,
 * }>}
 */
export async function classifyIntent(openrouter, signalText) {
  const fallback = {
    isRequest: false,
    solutionType: null,
    hasNiche: false,
    authorType: 'unknown',
    isVacancy: false,
    isCompetitorAd: false,
    isStudentProject: false,
    reason: 'ошибка классификации',
  };

  try {
    // temperature: 0 for consistency; systemPrompt: null — the default
    // job-planning AGENT_SYSTEM_PROMPT would only confuse this one-off
    // classification, it has nothing to do with parser jobs.
    const { content } = await openrouter.chat(
      [{ role: 'user', content: INTENT_PROMPT(signalText) }],
      { temperature: 0, systemPrompt: null },
    );

    const jsonText = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
    const parsed = JSON.parse(jsonText);

    return {
      isRequest: parsed?.isRequest === true,
      solutionType: SOLUTION_TYPES.includes(parsed?.solutionType) ? parsed.solutionType : null,
      hasNiche: parsed?.hasNiche === true,
      authorType: AUTHOR_TYPES.includes(parsed?.authorType) ? parsed.authorType : 'unknown',
      isVacancy: parsed?.isVacancy === true,
      isCompetitorAd: parsed?.isCompetitorAd === true,
      isStudentProject: parsed?.isStudentProject === true,
      reason: typeof parsed?.reason === 'string' ? parsed.reason : fallback.reason,
    };
  } catch {
    return fallback;
  }
}
