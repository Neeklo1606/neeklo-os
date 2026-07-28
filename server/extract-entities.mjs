import * as cheerio from 'cheerio';

const MAX_HTML_CHARS = 40_000;

const EXTRACT_PROMPT = `Ты извлекаешь список организаций из HTML-фрагмента страницы поиска (Яндекс Карты / 2GIS).
Верни ТОЛЬКО JSON без пояснений:
{
  "organizations": [
    {
      "name": "string",
      "phone": "string | null",
      "address": "string | null",
      "rating": "number | null",
      "reviewCount": "number | null",
      "website": "string | null",
      "card_url": "string | null"
    }
  ]
}
Правила:
- Если данных нет — верни {"organizations": []}.
- Не выдумывай значения — используй null, если поле не найдено в HTML.
- phone только если это настоящий номер (формат +7...), не placeholder.
- card_url — прямая ссылка на карточку организации, если она есть в HTML (href на /firm/ или /maps/org/).
  Если href относительный (начинается с /), добавь домен сайта-источника (https://2gis.ru или https://yandex.ru) сам.`;

/** Removes script/style/svg/comments/base64 data URIs — the bulk of page-shell bloat. */
export function stripBloat(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/data:[a-z0-9/+.-]+;base64,[a-zA-Z0-9+/=]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Picks out repeated card-like blocks (listing items) instead of the full
 * document — cuts a stripped-but-still-huge page down to the region that
 * actually contains organization data.
 *
 * Real sites (2GIS confirmed) use CSS-module-hashed class names like `_1kf6gff`
 * with no semantic meaning, so matching on keywords like "card"/"item"/"firm"
 * in the class name never fires. Instead, group elements by exact (tag + class)
 * and look for a group that repeats a plausible listing-length number of times
 * (6–40 — long enough to be a real list, short enough not to be page chrome
 * like nav links or filter chips) with substantial text per item.
 */
function extractCardRegion(html) {
  const $ = cheerio.load(html);

  /** @type {Map<string, { count: number, textLen: number, els: unknown[] }>} */
  const groups = new Map();
  $('body *').each((_, el) => {
    const $el = $(el);
    const cls = $el.attr('class');
    if (!cls) return;
    const text = $el.text().trim();
    if (text.length < 10) return;
    const key = `${el.tagName}.${cls}`;
    if (!groups.has(key)) groups.set(key, { count: 0, textLen: 0, els: [] });
    const g = groups.get(key);
    g.count += 1;
    g.textLen += text.length;
    g.els.push(el);
  });

  const candidates = [...groups.values()]
    .map((g) => ({ ...g, avg: g.textLen / g.count }))
    .filter((g) => g.count >= 6 && g.count <= 40 && g.avg >= 50)
    .sort((a, b) => b.avg - a.avg);

  if (candidates.length === 0) {
    // No repeated card pattern found — fall back to <body> text-heavy region, truncated.
    const body = $('body').html() ?? html;
    return body.slice(0, MAX_HTML_CHARS);
  }

  const region = candidates[0].els.map((el) => $.html(el)).join('\n');
  return region.length > MAX_HTML_CHARS ? region.slice(0, MAX_HTML_CHARS) : region;
}

/**
 * @param {string} html
 * @param {{ source?: string, niche?: string }} [opts]
 * @param {import('./openrouter.mjs').ReturnType<typeof import('./openrouter.mjs').createOpenRouterClient>} openrouter
 */
export async function extractCompaniesFromHtml(html, opts, openrouter) {
  let cleaned = stripBloat(html);

  if (cleaned.length > MAX_HTML_CHARS) {
    try {
      cleaned = extractCardRegion(cleaned);
    } catch {
      cleaned = cleaned.slice(0, MAX_HTML_CHARS);
    }
  }
  if (cleaned.length > MAX_HTML_CHARS) {
    cleaned = cleaned.slice(0, MAX_HTML_CHARS);
  }

  if (!cleaned) return [];

  const niche = opts?.niche ?? '';
  const source = opts?.source ?? '';
  const { content } = await openrouter.chat([
    {
      role: 'user',
      content: `${EXTRACT_PROMPT}\n\nИсточник: ${source}\nНиша: ${niche}\n\nHTML:\n${cleaned}`,
    },
  ]);

  let parsed;
  try {
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }

  return Array.isArray(parsed?.organizations) ? parsed.organizations : [];
}
