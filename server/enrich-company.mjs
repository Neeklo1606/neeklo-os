import { stripBloat } from './extract-entities.mjs';
import { upsertAudit } from './audit-db.mjs';
import { scoreFit } from './score-fit.mjs';
import { VERTICALS } from './verticals.mjs';

const MAX_AUDIT_CHARS = 6000;

// ── Deterministic detectors — cheap, no LLM call needed for any of these ──

const BOOKING_PATTERNS = [
  /онлайн[\s-]?запись/i,
  /записаться\s*онлайн/i,
  /запись\s*на\s*при[её]м/i,
  /\bbooking\b/i,
  /\bbook\s*(now|online|an?\s*appointment)\b/i,
  /yclients/i,
  /dikidi/i,
  /\bsonline\b/i,
];
const CATALOG_PATTERNS = [/каталог/i, /\/catalog\b/i, /\/shop\b/i, /\/products?\b/i, /добавить\s*в\s*корзину/i];
const PERSONAL_ACCOUNT_PATTERNS = [/личный\s*кабинет/i, /\bвойти\b/i, /\blogin\b/i, /\/lk\b/i, /\/cabinet\b/i, /\/account\b/i];
const DEALER_SECTION_PATTERNS = [
  /дилерам/i,
  /партнёрам/i,
  /партнерам/i,
  /оптовикам/i,
  /\bb2b\b/i,
  /\/dealers\b/i,
  /\/partners\b/i,
  /\/opt\b/i,
];
const CRM_WIDGET_PATTERNS = [/bitrix/i, /amocrm/i, /jivosite/i, /carrotquest/i];
const VACANCY_PATTERNS = [/вакансии/i, /карьера/i, /\/jobs\b/i];

const CONTACT_FORM_HINTS = [/оставить\s*заявку/i, /обратный\s*звонок/i];
const PHONE_INPUT_RE = /<input\b[^>]*(?:type=["']?tel["']?|name=["']?[^"']*phone[^"']*["']?)[^>]*>/i;
const FORM_TAG_RE = /<form\b[^>]*>/i;

const ANALYTICS_PATTERNS = [
  /mc\.yandex\.ru\/metrika/i,
  /gtag\s*\(/i,
  /google-analytics/i,
  /vk\.com\/rtrg/i,
  /top-fwork\.ru/i,
];
const ADS_PATTERNS = [/yandex_rtb/i, /adfox/i, /utm_source=/i];

const VK_LINK_RE = /https?:\/\/(?:www\.)?vk\.com\/[a-zA-Z0-9_.]+/gi;
const TELEGRAM_LINK_RE = /https?:\/\/t\.me\/[a-zA-Z0-9_]+/gi;
const WHATSAPP_LINK_RE = /https?:\/\/wa\.me\/[0-9+]+/gi;
const INTERNAL_HREF_RE = /href=["'](\/[a-zA-Z0-9_-][^"'#?]*)/gi;

/**
 * "Landing-page pattern" heuristic per the brief: a single-page site
 * (few distinct internal paths) with a <form> near the top of the
 * document (crude "above the fold" proxy — a real above-the-fold check
 * needs a renderer, not a string). Deliberately approximate.
 */
function looksLikeLandingPage(html) {
  const paths = new Set();
  for (const m of html.matchAll(INTERNAL_HREF_RE)) paths.add(m[1]);
  const formIndex = html.search(FORM_TAG_RE);
  const formNearTop = formIndex >= 0 && formIndex < html.length * 0.3;
  return paths.size <= 3 && formNearTop;
}

/** @param {string} html @param {string} finalUrl */
function detectSignals(html, finalUrl) {
  const bookingExists = BOOKING_PATTERNS.some((re) => re.test(html));
  const catalogExists = CATALOG_PATTERNS.some((re) => re.test(html));
  const personalAccountExists = PERSONAL_ACCOUNT_PATTERNS.some((re) => re.test(html));
  const dealerSectionExists = DEALER_SECTION_PATTERNS.some((re) => re.test(html));
  const crmWidgetDetected = CRM_WIDGET_PATTERNS.some((re) => re.test(html));
  const vacancyPageExists = VACANCY_PATTERNS.some((re) => re.test(html));
  const analyticsDetected = ANALYTICS_PATTERNS.some((re) => re.test(html));
  const adsSignals = ADS_PATTERNS.some((re) => re.test(html)) || looksLikeLandingPage(html);
  const hasContactForm =
    (FORM_TAG_RE.test(html) && PHONE_INPUT_RE.test(html)) || CONTACT_FORM_HINTS.some((re) => re.test(html));

  const vkMatches = [...html.matchAll(VK_LINK_RE)].map((m) => m[0]);
  const tgMatches = [...html.matchAll(TELEGRAM_LINK_RE)].map((m) => m[0]);
  const waMatches = [...html.matchAll(WHATSAPP_LINK_RE)].map((m) => m[0]);
  const messengerLinks = [...new Set([...tgMatches, ...waMatches])];

  return {
    https: /^https:\/\//i.test(finalUrl),
    formExists: FORM_TAG_RE.test(html) || hasContactForm,
    bookingExists,
    catalogExists,
    personalAccountExists,
    dealerSectionExists,
    crmWidgetDetected,
    vacancyPageExists,
    analyticsDetected,
    adsSignals,
    messengerLinks,
    // Kept under their original names — server/score-company.mjs's CRITERIA
    // array reads exactly these fields; renaming them here would silently
    // zero out half its scoring without touching that file, which the brief
    // says to keep as-is.
    hasOnlineBooking: bookingExists,
    hasContactForm,
    hasAnalytics: analyticsDetected,
    hasAds: adsSignals,
    socialVk: vkMatches[0] ?? null,
    socialTelegram: tgMatches[0] ?? null,
  };
}

const yesNo = (v) => (v ? 'да' : 'нет');
const MOBILE_STATUSES = new Set(['good', 'issues', 'unknown']);
const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);

/**
 * Per the strategy's rule that conclusions must read as hypotheses with
 * evidence, never accusations — the prompt spells out both a right and a
 * wrong example so the model has a concrete contrast to match, not just an
 * abstract instruction.
 * @param {{ name?: string, vertical?: string }} company @param {ReturnType<typeof detectSignals>} flags
 */
function buildAuditPrompt(company, vertical) {
  const name = company.name ?? 'компания';
  const verticalLabel = vertical?.label ?? 'не указана';
  return `Ты аудитор для digital-студии. Компания «${name}», вертикаль «${verticalLabel}».
Найденные признаки: {detected flags}

ВАЖНО: формулируй наблюдение и гипотезу, НЕ обвинение.
Правильно: «Онлайн-запись не найдена; компания принимает клиентов по записи — потенциальная зона ручной обработки. Требует проверки.»
Неправильно: «Вы теряете 40% клиентов.»

Ответь JSON:
{
  "key_conversion_path": "как клиент может совершить целевое действие",
  "observed_gap": "наблюдаемый разрыв, 1-2 предложения, как гипотеза",
  "mobile_status": "good"|"issues"|"unknown",
  "audit_confidence": "high"|"medium"|"low",
  "human_review_required": true|false,
  "growth_signals": ["вакансии", "новые филиалы", ...] или []
}`;
}

/**
 * @param {import('./openrouter.mjs').ReturnType<typeof import('./openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {{ name?: string }} company
 * @param {{ label?: string } | null} vertical
 * @param {ReturnType<typeof detectSignals>} flags
 * @param {string} trimmedHtml
 */
async function auditWithAi(openrouter, company, vertical, flags, trimmedHtml) {
  const fallback = {
    key_conversion_path: '',
    observed_gap: '',
    mobile_status: 'unknown',
    audit_confidence: 'low',
    human_review_required: true,
    growth_signals: [],
  };

  const flagsSummary = `онлайн-запись: ${yesNo(flags.bookingExists)}, каталог: ${yesNo(flags.catalogExists)}, личный кабинет: ${yesNo(flags.personalAccountExists)}, дилерский раздел: ${yesNo(flags.dealerSectionExists)}, форма заявки: ${yesNo(flags.formExists)}, CRM-виджет: ${yesNo(flags.crmWidgetDetected)}, аналитика: ${yesNo(flags.analyticsDetected)}, страница вакансий: ${yesNo(flags.vacancyPageExists)}, мессенджеры: ${flags.messengerLinks.length > 0 ? flags.messengerLinks.join(', ') : 'нет'}`;

  const prompt = buildAuditPrompt(company, vertical).replace('{detected flags}', flagsSummary);

  try {
    const { content } = await openrouter.chat(
      [{ role: 'user', content: `${prompt}\n\nHTML:\n${trimmedHtml}` }],
      { temperature: 0, systemPrompt: null },
    );
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
    const parsed = JSON.parse(jsonText);
    return {
      key_conversion_path: typeof parsed?.key_conversion_path === 'string' ? parsed.key_conversion_path : '',
      observed_gap: typeof parsed?.observed_gap === 'string' ? parsed.observed_gap : '',
      mobile_status: MOBILE_STATUSES.has(parsed?.mobile_status) ? parsed.mobile_status : 'unknown',
      audit_confidence: CONFIDENCE_LEVELS.has(parsed?.audit_confidence) ? parsed.audit_confidence : 'low',
      human_review_required: parsed?.human_review_required !== false,
      growth_signals: Array.isArray(parsed?.growth_signals) ? parsed.growth_signals.filter((s) => typeof s === 'string') : [],
    };
  } catch {
    // AI audit is best-effort — a bad/unparseable response shouldn't fail
    // the whole audit, the deterministic flags are still useful and get
    // saved regardless. human_review_required defaults true here since we
    // genuinely don't know anything about this one.
    return fallback;
  }
}

/**
 * Full Digital Audit — deterministic detection (website_exists, https,
 * form/booking/catalog/personal-account/dealer-section/vacancy-page
 * presence, messenger links, analytics/CRM-widget detection) plus one AI
 * call for the judgment fields that need it (key_conversion_path,
 * observed_gap as a hypothesis, mobile_status, audit_confidence,
 * human_review_required, growth_signals).
 *
 * The full result is written to audit-db.mjs (one row per company,
 * upserted) — that's the source of truth for every field. This function's
 * return value carries only what the Company record itself needs: a few
 * denormalized flags for fast table filtering (hasWebsite, hasBooking,
 * hasDealerSection), the score-company.mjs-compatible field names (see
 * detectSignals' comment — that file is kept as-is per the brief, so it
 * still needs its original field names), and fit_score/fit_breakdown/
 * sales_priority from scoreFit (run here, on the fresh audit, rather than
 * requiring a separate score-fit-all call after every enrichment).
 * @param {import('./parser.mjs').ReturnType<typeof import('./parser.mjs').createParserClient>} parser
 * @param {import('./openrouter.mjs').ReturnType<typeof import('./openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {import('./companies-db.mjs').Company} company
 */
export async function enrichCompany(parser, openrouter, company) {
  const enrichedAt = new Date().toISOString();
  const vertical = company?.vertical ? (VERTICALS[company.vertical] ?? null) : null;

  /** @param {Record<string, unknown>} auditFields */
  const finish = (auditFields, companyPatch) => {
    const audit = upsertAudit(company.id, { ...auditFields, audited_at: enrichedAt });
    const { fit_score, fit_breakdown, sales_priority } = scoreFit({ ...company, ...companyPatch }, audit, vertical);
    return { enrichedAt, fit_score, fit_breakdown, sales_priority, ...companyPatch };
  };

  const website = company?.website?.trim();
  if (!website) {
    // No website is itself an audit finding, not a skipped audit — still
    // gets a row (website_exists: false) and a fit_score, since scoreFit
    // doesn't require website data to run.
    return finish(
      { website_exists: false, proof_url: null, audit_confidence: 'high', human_review_required: false },
      { websiteWorking: false, hasWebsite: false, hasBooking: false, hasDealerSection: false },
    );
  }

  let data;
  try {
    data = await parser.parseUrl(website, { timeoutMs: 60000 });
  } catch {
    return finish(
      { website_exists: true, proof_url: website, audit_confidence: 'low', human_review_required: true, observed_gap: 'Сайт не удалось загрузить для проверки — недоступен или блокирует парсер.' },
      { websiteWorking: false, hasWebsite: true, hasBooking: false, hasDealerSection: false },
    );
  }

  // Structural failure signals from the API itself (not a thrown error):
  // fetched:false, a non-null error string, or a captcha/login wall — all
  // mean we didn't actually get the page.
  if (data?.fetched === false || data?.error || data?.authRequired) {
    return finish(
      { website_exists: true, proof_url: website, audit_confidence: 'low', human_review_required: true, observed_gap: 'Сайт вернул ошибку/капчу при проверке — требуется ручной осмотр.' },
      { websiteWorking: false, hasWebsite: true, hasBooking: false, hasDealerSection: false },
    );
  }

  const rawHtml = data?.parsed?.source ?? data?.entities?.[0]?.source ?? '';
  if (!rawHtml) {
    return finish(
      { website_exists: true, proof_url: website, audit_confidence: 'low', human_review_required: true, observed_gap: 'Не удалось получить содержимое страницы для проверки.' },
      { websiteWorking: false, hasWebsite: true, hasBooking: false, hasDealerSection: false },
    );
  }

  const finalUrl = String(data?.finalUrl ?? data?.fetchMeta?.finalUrl ?? website);
  const flags = detectSignals(rawHtml, finalUrl);
  const trimmed = stripBloat(rawHtml).slice(0, MAX_AUDIT_CHARS);
  const ai = await auditWithAi(openrouter, company, vertical, flags, trimmed);

  const auditFields = {
    website_exists: true,
    https: flags.https,
    mobile_status: ai.mobile_status,
    // No reliable signal for page-speed from static HTML alone — left
    // unset rather than guessed; a real speed audit needs a renderer.
    site_speed_note: null,
    form_exists: flags.formExists,
    booking_exists: flags.bookingExists,
    catalog_exists: flags.catalogExists,
    personal_account_exists: flags.personalAccountExists,
    dealer_section_exists: flags.dealerSectionExists,
    messenger_links: flags.messengerLinks,
    analytics_detected: flags.analyticsDetected,
    crm_widget_detected: flags.crmWidgetDetected,
    key_conversion_path: ai.key_conversion_path,
    observed_gap: ai.observed_gap,
    proof_url: website,
    audit_confidence: ai.audit_confidence,
    human_review_required: ai.human_review_required,
    growth_signals: ai.growth_signals,
  };

  return finish(auditFields, {
    websiteWorking: true,
    hasWebsite: true,
    hasBooking: flags.bookingExists,
    hasDealerSection: flags.dealerSectionExists,
    // score-company.mjs-compatible fields — see detectSignals' comment.
    hasOnlineBooking: flags.hasOnlineBooking,
    hasContactForm: flags.hasContactForm,
    hasAnalytics: flags.hasAnalytics,
    hasAds: flags.hasAds,
    socialVk: flags.socialVk,
    socialTelegram: flags.socialTelegram,
  });
}
