import { createCompanies, updateCompany } from '../companies-db.mjs';
import { updateCampaign } from '../campaigns-db.mjs';
import { enrichCompany } from '../enrich-company.mjs';
import { scoreCompany } from '../score-company.mjs';
import { getAudit } from '../audit-db.mjs';
import { generateOpportunity } from '../generate-opportunity.mjs';
import { patchCartographerRun } from '../cartographer-store.mjs';
import {
  companyFromEntity,
  sourceFromUrl,
  MIN_TIMEOUT_MS_BY_SOURCE,
  HTML_FALLBACK_SOURCES,
} from '../parser.mjs';
import { extractCompaniesFromHtml } from '../extract-entities.mjs';

const ENRICH_DELAY_MS = 2000;
const PHONE_FETCH_DELAY_MS = 1500;
// Caps cost/time on the second-job pass — a full 50-company run doesn't need
// 50 individual card-page fetches on top of the search job.
const PHONE_FETCH_BATCH_LIMIT = 20;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CYRILLIC_TO_LATIN = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

/**
 * 2GIS city paths are lowercase latin slugs (moskva, krasnodar, stavropol —
 * every example seen live against the real API this session used this
 * form), not the display name a user types. Best-effort transliteration —
 * some real 2GIS slugs are irregular abbreviations (spb, ekb) that no
 * phonetic transliteration produces; if a search 404s, try the slug
 * directly in "Регион" instead of the city's Cyrillic name.
 */
function regionToSlug(region) {
  const lower = String(region ?? '').trim().toLowerCase();
  const translit = [...lower].map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch).join('');
  return translit.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Neither the structured-entity path (companyFromEntity in parser.mjs) nor
 * the HTML-extraction fallback (extract-entities.mjs) ever return a distinct
 * `city` field — only a free-text `address` string. In practice 2GIS/Yandex
 * addresses are "Street, Number, City" (confirmed against live results), so
 * the last comma-separated segment is the city. This matters because the
 * requested region can silently mismatch the actual result (e.g. a bad
 * search query making 2GIS fall back to unrelated nationwide listings) —
 * hardcoding ctx.region here masked that exact bug. Only fall back to
 * ctx.region when address is missing or has no comma-separated city segment.
 * @param {string | null | undefined} address
 */
function cityFromAddress(address) {
  if (typeof address !== 'string') return null;
  const segments = address.split(',').map((s) => s.trim()).filter(Boolean);
  return segments.length > 1 ? segments[segments.length - 1] : null;
}

/** @param {Record<string, unknown>} org @param {{ niche: string, region: string, campaignId: string, verticalKey?: string }} ctx */
function orgToCompanyRecord(org, ctx) {
  const phones = Array.isArray(org.phones) ? org.phones : [];
  const phone = typeof org.phone === 'string' && org.phone ? org.phone : phones[0] ?? '';
  const address = typeof org.address === 'string' ? org.address : null;
  return {
    name: org.name,
    industry: ctx.niche,
    website: typeof org.website === 'string' ? org.website : '',
    phone,
    email: '',
    status: 'new',
    employees: 0,
    revenue: '—',
    city: typeof org.city === 'string' && org.city ? org.city : cityFromAddress(address) ?? ctx.region,
    contacts: phone ? 1 : 0,
    activeLeads: 0,
    avatar: String(org.name ?? '??').slice(0, 2).toUpperCase(),
    rating: typeof org.rating === 'number' ? org.rating : 0,
    reviewCount: typeof org.reviewCount === 'number' ? org.reviewCount : 0,
    niches: [ctx.niche],
    source: '2gis',
    address,
    phone2: phones[1] ?? null,
    source_url: typeof org.card_url === 'string' ? org.card_url : null,
    campaignId: ctx.campaignId,
    // Tags the record for server/score-fit.mjs's vertical-fit criterion —
    // previously nothing set these, so every company ever collected had
    // vertical: undefined regardless of which vertical the search used.
    ...(ctx.verticalKey ? { vertical: ctx.verticalKey, subsegment: ctx.niche } : {}),
  };
}

const EXCLUSION_CLASSIFY_DELAY_MS = 500;

/**
 * One AI call per company for the three judgment-based exclusion criteria
 * that have no reliable deterministic signal (retail-only, micro-business,
 * and a same-call assist for federal-chain). temperature 0 per spec.
 * Never throws — a parse/network failure returns the "keep, benefit of the
 * doubt" defaults rather than silently excluding a company because the LLM
 * call happened to fail.
 *
 * `company.industry` here is NOT an independently observed category — in
 * this pipeline it's always just the search niche/subsegment the query
 * used (see orgToCompanyRecord: `industry: ctx.niche`), so it's the same
 * value for every candidate in a run. Confirmed live: phrasing the prompt
 * as "категория «X»" made the model treat that label as settled fact and
 * default to trusting it for every company, including an obvious kiosk
 * and an obvious federal chain in a synthetic test batch. Rephrasing it as
 * "found via this search query — not a confirmed category, don't trust it"
 * and telling the model to judge from the name/reviews/website instead
 * fixed this — the same test batch then correctly split retail-only and
 * flagged the federal chain.
 * @param {import('../openrouter.mjs').ReturnType<typeof import('../openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {{ name?: string, industry?: string, reviewCount?: number, website?: string }} company
 * @param {{ label?: string } | null} vertical
 */
async function classifyForExclusion(openrouter, company, vertical) {
  const fallback = { isRetailOnly: false, isFederalChain: false, isMicroBusiness: false, matchesVertical: true, reason: '' };
  const prompt = `Компания «${company.name ?? ''}» найдена в 2GIS по поисковому запросу «${company.industry ?? ''}» — это НЕ подтверждённая категория, а просто запрос, по которому её нашли. У неё ${company.reviewCount ?? 0} отзывов, сайт: ${company.website || 'нет'}.
Оцени КРИТИЧЕСКИ по названию компании, отзывам и сайту — не доверяй поисковому запросу как факту. Вертикаль, которую мы реально ищем: ${vertical?.label ?? 'не указана'}.
Ответь строго JSON:
{
  "isRetailOnly": true|false,
  "isFederalChain": true|false,
  "isMicroBusiness": true|false,
  "matchesVertical": true|false,
  "reason": "до 10 слов"
}`;

  try {
    const { content } = await openrouter.chat([{ role: 'user', content: prompt }], { temperature: 0, systemPrompt: null });
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
    const parsed = JSON.parse(jsonText);
    return {
      isRetailOnly: parsed?.isRetailOnly === true,
      isFederalChain: parsed?.isFederalChain === true,
      isMicroBusiness: parsed?.isMicroBusiness === true,
      matchesVertical: parsed?.matchesVertical !== false,
      reason: typeof parsed?.reason === 'string' ? parsed.reason : '',
    };
  } catch {
    return fallback;
  }
}

/**
 * Runs each collected candidate through the checked exclusion filters
 * before anything gets inserted into companies-db — excluded companies are
 * never written, only logged (name + reason) so the UI can show them, not
 * silently drop them.
 * @param {import('../openrouter.mjs').ReturnType<typeof import('../openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {Array<Record<string, any>>} candidates
 * @param {{ vertical: { label?: string } | null, exclude: Record<string, boolean> }} ctx
 * @returns {Promise<{ kept: Array<Record<string, any>>, excluded: { name: string, reason: string }[] }>}
 */
async function filterExclusions(openrouter, candidates, ctx) {
  const exclude = ctx.exclude ?? {};
  const vertical = ctx.vertical ?? null;
  const kept = [];
  const excluded = [];
  const seenPhones = new Set();
  const seenNames = new Set();
  const seenDomains = new Set();
  const needsAi = Boolean(exclude.retailOnly || exclude.microBusiness || exclude.federalCorp);

  for (let i = 0; i < candidates.length; i += 1) {
    const company = candidates[i];
    const name = String(company.name ?? '(без названия)').trim();

    if (exclude.noWebsite && !String(company.website ?? '').trim()) {
      excluded.push({ name, reason: 'нет сайта' });
      continue;
    }

    // Intra-batch duplicate check — visible/reported, distinct from
    // companies-db.mjs's own createCompanies dedup (phone/source_url/
    // name+phone), which always applies regardless of this checkbox as a
    // baseline data-integrity guard. This is the checkbox-controlled,
    // logged layer on top of that, not a replacement for it.
    if (exclude.duplicates) {
      const domain = String(company.website ?? '')
        .replace(/^https?:\/\/(www\.)?/i, '')
        .split('/')[0]
        .toLowerCase();
      const phoneDigits = String(company.phone ?? '').replace(/\D/g, '');
      const normName = name.toLowerCase();
      const isDup =
        (domain && seenDomains.has(domain)) || (phoneDigits && seenPhones.has(phoneDigits)) || seenNames.has(normName);
      if (isDup) {
        excluded.push({ name, reason: 'дубликат по домену/телефону/названию' });
        continue;
      }
      if (domain) seenDomains.add(domain);
      if (phoneDigits) seenPhones.add(phoneDigits);
      seenNames.add(normName);
    }

    let ai = null;
    if (needsAi) {
      ai = await classifyForExclusion(openrouter, company, vertical);
      if (i < candidates.length - 1) await sleep(EXCLUSION_CLASSIFY_DELAY_MS);
    }

    // Conservative by design (per the brief): review count alone never
    // excludes — a genuinely great large local business can also have
    // 500+ reviews. Only acts when the AI independently agrees.
    if (exclude.federalCorp && (company.reviewCount ?? 0) >= 500 && ai?.isFederalChain) {
      excluded.push({ name, reason: 'похоже на федеральную сеть/корпорацию (много отзывов + подтверждено AI)' });
      continue;
    }

    if (exclude.retailOnly && ai?.isRetailOnly) {
      excluded.push({ name, reason: ai.reason || 'только розница, без опта/B2B' });
      continue;
    }

    if (exclude.microBusiness && ai?.isMicroBusiness) {
      excluded.push({ name, reason: ai.reason || 'микробизнес без признаков процесса' });
      continue;
    }

    kept.push(company);
  }

  return { kept, excluded };
}

/**
 * The "second job" pattern: 2GIS/Yandex search-result pages hide phones
 * behind ad rotation/personalization far more often than a company's own
 * individual card page does (confirmed in the diagnosis — a bad search
 * query returned ad cards with 0 tel: links at all, while a good search
 * page's real listings had 21). Re-fetching source_url gives the extractor
 * a second, focused shot at a page that's only about this one business.
 * Same preference order as the main search path: structured entities
 * first, HTML-extraction fallback only if those come back degenerate.
 * @param {import('../parser.mjs').ReturnType<typeof import('../parser.mjs').createParserClient>} parser
 * @param {import('../openrouter.mjs').ReturnType<typeof import('../openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {{ id: string, name?: string, source_url?: string | null }} company
 * @param {string} niche
 */
async function fetchPhoneFromCardPage(parser, openrouter, company, niche) {
  const cardUrl = company.source_url;
  if (!cardUrl) return null;

  const detectedSource = sourceFromUrl(cardUrl);
  // parseUrl() doesn't enforce parseOne()'s per-source timeout floor itself
  // (it's a raw pass-through for enrich-company.mjs's website-audit use)  —
  // apply the same 2gis/yandex floor here since card pages are just as
  // browser-render-heavy as search pages.
  const timeoutMs = detectedSource ? (MIN_TIMEOUT_MS_BY_SOURCE[detectedSource] ?? 60000) : 60000;

  let data;
  try {
    data = await parser.parseUrl(cardUrl, { timeoutMs });
  } catch (e) {
    console.error(
      `[cartographer] phone re-fetch failed for ${company.name ?? company.id}:`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }

  if (data?.fetched === false || data?.error || data?.authRequired) return null;

  // 1. Structured entities first.
  const entities = Array.isArray(data?.entities) ? data.entities : [];
  const structured = entities
    .filter((e) => e?.kind === 'company')
    .map(companyFromEntity)
    .find((c) => c && (c.phone || c.website));
  if (structured) {
    return { phone: structured.phone ?? null, website: structured.website ?? null };
  }

  // 2. Fall back to HTML extraction on this individual card page — only for
  // the two sources extract-entities.mjs's prompt was written for.
  if (!detectedSource || !HTML_FALLBACK_SOURCES.has(detectedSource)) return null;
  const rawHtml = data?.parsed?.source ?? data?.entities?.[0]?.source ?? '';
  if (!rawHtml) return null;

  const organizations = await extractCompaniesFromHtml(rawHtml, { source: detectedSource, niche }, openrouter);
  const match = organizations.find((o) => o?.phone || o?.website);
  return match ? { phone: match.phone ?? null, website: match.website ?? null } : null;
}

/**
 * @param {import('../parser.mjs').ReturnType<typeof import('../parser.mjs').createParserClient>} parser
 * @param {import('../openrouter.mjs').ReturnType<typeof import('../openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {Array<Record<string, any>>} companies
 * @param {{ runId: string, niche: string }} ctx
 */
async function fetchMissingPhones(parser, openrouter, companies, ctx) {
  const missing = companies.filter((c) => !c.phone && c.source_url).slice(0, PHONE_FETCH_BATCH_LIMIT);
  patchCartographerRun(ctx.runId, { phonesTotal: missing.length, phonesFetched: 0 });

  for (let i = 0; i < missing.length; i += 1) {
    const company = missing[i];
    try {
      const found = await fetchPhoneFromCardPage(parser, openrouter, company, ctx.niche);
      const patch = {};
      if (found?.phone && !company.phone) patch.phone = found.phone;
      if (found?.website && !company.website) patch.website = found.website;

      if (Object.keys(patch).length > 0) {
        patch.contacts = 1;
        Object.assign(company, patch);
        const { score, breakdown } = scoreCompany(company);
        patch.score = score;
        patch.score_breakdown = breakdown;
        company.score = score;
        company.score_breakdown = breakdown;
        updateCompany(company.id, patch);
      }
    } catch (e) {
      // Never let one company's failure stop the batch.
      console.error(
        `[cartographer] phone backfill failed for ${company.name ?? company.id}:`,
        e instanceof Error ? e.message : e,
      );
    }
    patchCartographerRun(ctx.runId, { phonesFetched: i + 1 });
    if (i < missing.length - 1) await sleep(PHONE_FETCH_DELAY_MS);
  }
}

/**
 * @param {import('../parser.mjs').ReturnType<typeof import('../parser.mjs').createParserClient>} parser
 * @param {import('../openrouter.mjs').ReturnType<typeof import('../openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {{ runId: string, campaignId: string, niche: string, region: string, limit: number, enrich: boolean, verticalKey?: string, vertical?: { label?: string } | null, exclude?: Record<string, boolean> }} opts
 */
export async function runCartographer(parser, openrouter, opts) {
  const { runId, campaignId, niche, region, limit, enrich, verticalKey, vertical, exclude } = opts;

  try {
    patchCartographerRun(runId, { stage: 'search' });
    const regionSlug = regionToSlug(region) || 'moskva';
    const searchUrl = `https://2gis.ru/${regionSlug}/search/${encodeURI(niche)}`;

    const created = await parser.createJob({ urls: [searchUrl], niche });
    const jobId = created.jobId ?? created.id;
    const finished = await parser.waitForJob(jobId);
    if (finished.job?.status !== 'completed') {
      throw new Error(finished.job?.error ?? 'Не удалось получить результаты 2GIS');
    }

    patchCartographerRun(runId, { stage: 'extract' });
    const page = finished.job?.result?.pages?.[0];
    const organizations = Array.isArray(page?.data?.organizations) ? page.data.organizations : [];
    const limited = organizations.filter((org) => org?.name).slice(0, limit);

    const candidates = limited.map((org) => orgToCompanyRecord(org, { niche, region, campaignId, verticalKey }));

    patchCartographerRun(runId, { stage: 'exclude' });
    const { kept, excluded } = await filterExclusions(openrouter, candidates, { vertical: vertical ?? null, exclude: exclude ?? {} });
    patchCartographerRun(runId, { excludedCount: excluded.length, excluded });

    const toInsert = kept.map((company) => {
      const { score, breakdown } = scoreCompany(company);
      return { ...company, score, score_breakdown: breakdown };
    });

    const { created: inserted } = createCompanies(toInsert);
    patchCartographerRun(runId, { found: inserted.length });

    if (inserted.length > 0) {
      patchCartographerRun(runId, { stage: 'phones' });
      await fetchMissingPhones(parser, openrouter, inserted, { runId, niche });
    }

    if (enrich && inserted.length > 0) {
      patchCartographerRun(runId, { stage: 'enrich' });
      for (let i = 0; i < inserted.length; i += 1) {
        const company = inserted[i];
        try {
          const enrichment = await enrichCompany(parser, openrouter, company);
          const { score, breakdown } = scoreCompany({ ...company, ...enrichment });
          const updated = updateCompany(company.id, { ...enrichment, score, score_breakdown: breakdown });

          // Opportunity generation costs a full OpenRouter call per company —
          // only worth it for A/B priority (per the brief: don't burn tokens
          // drafting outreach for companies already scored as poor fits).
          if (updated.sales_priority === 'A' || updated.sales_priority === 'B') {
            try {
              const audit = getAudit(company.id);
              await generateOpportunity(openrouter, updated, audit, vertical ?? null);
            } catch (e) {
              console.error(`[cartographer] opportunity generation failed for ${company.id}:`, e instanceof Error ? e.message : e);
            }
          }
        } catch (e) {
          console.error(`[cartographer] enrich failed for ${company.id}:`, e instanceof Error ? e.message : e);
        }
        patchCartographerRun(runId, { enriched: i + 1 });
        if (i < inserted.length - 1) await sleep(ENRICH_DELAY_MS);
      }
      patchCartographerRun(runId, { stage: 'score' });
    }

    try {
      updateCampaign(campaignId, { leadsGenerated: inserted.length });
    } catch {
      // Campaign record is informational for this run — don't fail the
      // whole run over it if it was deleted mid-flight.
    }

    patchCartographerRun(runId, { status: 'completed', stage: 'done' });
  } catch (err) {
    patchCartographerRun(runId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Cartographer run failed',
    });
  }
}
