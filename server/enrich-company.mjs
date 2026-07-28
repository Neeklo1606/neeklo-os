import { stripBloat } from './extract-entities.mjs';

const MAX_AUDIT_CHARS = 6000;

// Deterministic, regex-only detectors — cheap, no LLM call needed for these.
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

/** @param {string} html */
function detectSignals(html) {
  const hasOnlineBooking = BOOKING_PATTERNS.some((re) => re.test(html));
  const hasContactForm =
    (FORM_TAG_RE.test(html) && PHONE_INPUT_RE.test(html)) || CONTACT_FORM_HINTS.some((re) => re.test(html));
  const hasAnalytics = ANALYTICS_PATTERNS.some((re) => re.test(html));
  const hasAds = ADS_PATTERNS.some((re) => re.test(html)) || looksLikeLandingPage(html);

  const vkMatches = [...html.matchAll(VK_LINK_RE)].map((m) => m[0]);
  const tgMatches = [...html.matchAll(TELEGRAM_LINK_RE)].map((m) => m[0]);

  return {
    hasOnlineBooking,
    hasContactForm,
    hasAnalytics,
    hasAds,
    socialVk: vkMatches[0] ?? null,
    socialTelegram: tgMatches[0] ?? null,
  };
}

const yesNo = (v) => (v ? 'да' : 'нет');

/** @param {{ name?: string, niches?: string[] }} company @param {ReturnType<typeof detectSignals>} flags */
function buildAuditPrompt(company, flags) {
  const name = company.name ?? 'компания';
  const niche = Array.isArray(company.niches) && company.niches.length > 0 ? company.niches.join(', ') : 'не указана';
  return `Ты аудитор сайтов для digital-студии. Оцени этот сайт компании «${name}» (ниша: ${niche}).

Найденные признаки: онлайн-запись: ${yesNo(flags.hasOnlineBooking)}, форма заявки: ${yesNo(flags.hasContactForm)}, аналитика: ${yesNo(flags.hasAnalytics)}, реклама: ${yesNo(flags.hasAds)}

Ответь строго в JSON:
{
  "verdict": "одно предложение — что не так с сайтом",
  "opportunity": "одно предложение — что мы можем предложить",
  "designAge": "modern"|"dated"|"very-old"
}`;
}

const DESIGN_AGES = new Set(['modern', 'dated', 'very-old']);

/**
 * @param {import('./openrouter.mjs').ReturnType<typeof import('./openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {{ name?: string, niches?: string[] }} company
 * @param {ReturnType<typeof detectSignals>} flags
 * @param {string} trimmedHtml
 */
async function auditWithAi(openrouter, company, flags, trimmedHtml) {
  try {
    const { content } = await openrouter.chat(
      [{ role: 'user', content: `${buildAuditPrompt(company, flags)}\n\nHTML:\n${trimmedHtml}` }],
      { temperature: 0, systemPrompt: null },
    );
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
    const parsed = JSON.parse(jsonText);
    const verdict = typeof parsed?.verdict === 'string' ? parsed.verdict : '';
    const opportunity = typeof parsed?.opportunity === 'string' ? parsed.opportunity : '';
    const designAge = DESIGN_AGES.has(parsed?.designAge) ? parsed.designAge : null;
    return { verdict, opportunity, designAge };
  } catch {
    // AI audit is best-effort — a bad/unparseable response shouldn't fail
    // the whole enrichment, since the deterministic flags are still useful.
    return { verdict: '', opportunity: '', designAge: null };
  }
}

/**
 * @param {import('./parser.mjs').ReturnType<typeof import('./parser.mjs').createParserClient>} parser
 * @param {import('./openrouter.mjs').ReturnType<typeof import('./openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {{ website?: string, name?: string, niches?: string[] }} company
 */
export async function enrichCompany(parser, openrouter, company) {
  const enrichedAt = new Date().toISOString();

  const website = company?.website?.trim();
  if (!website) {
    return { enrichedAt, websiteWorking: false };
  }

  let data;
  try {
    data = await parser.parseUrl(website, { timeoutMs: 60000 });
  } catch {
    return { enrichedAt, websiteWorking: false };
  }

  // Structural failure signals from the API itself (not a thrown error):
  // fetched:false, a non-null error string, or a captcha/login wall — all
  // mean we didn't actually get the page.
  if (data?.fetched === false || data?.error || data?.authRequired) {
    return { enrichedAt, websiteWorking: false };
  }

  const rawHtml = data?.parsed?.source ?? data?.entities?.[0]?.source ?? '';
  if (!rawHtml) {
    return { enrichedAt, websiteWorking: false };
  }

  const flags = detectSignals(rawHtml);
  const trimmed = stripBloat(rawHtml).slice(0, MAX_AUDIT_CHARS);
  const { verdict, opportunity, designAge } = await auditWithAi(openrouter, company, flags, trimmed);

  return {
    enrichedAt,
    websiteWorking: true,
    ...flags,
    designAge,
    auditText: [verdict, opportunity].filter(Boolean).join(' '),
  };
}
