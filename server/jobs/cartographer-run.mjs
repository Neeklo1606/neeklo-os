import { createCompanies, updateCompany } from '../companies-db.mjs';
import { updateCampaign } from '../campaigns-db.mjs';
import { enrichCompany } from '../enrich-company.mjs';
import { scoreCompany } from '../score-company.mjs';
import { patchCartographerRun } from '../cartographer-store.mjs';

const ENRICH_DELAY_MS = 2000;
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

/** @param {Record<string, unknown>} org @param {{ niche: string, region: string, campaignId: string }} ctx */
function orgToCompanyRecord(org, ctx) {
  const phones = Array.isArray(org.phones) ? org.phones : [];
  const phone = typeof org.phone === 'string' && org.phone ? org.phone : phones[0] ?? '';
  return {
    name: org.name,
    industry: ctx.niche,
    website: typeof org.website === 'string' ? org.website : '',
    phone,
    email: '',
    status: 'new',
    employees: 0,
    revenue: '—',
    city: ctx.region,
    contacts: phone ? 1 : 0,
    activeLeads: 0,
    avatar: String(org.name ?? '??').slice(0, 2).toUpperCase(),
    rating: typeof org.rating === 'number' ? org.rating : 0,
    reviewCount: typeof org.reviewCount === 'number' ? org.reviewCount : 0,
    niches: [ctx.niche],
    source: '2gis',
    address: typeof org.address === 'string' ? org.address : null,
    phone2: phones[1] ?? null,
    source_url: typeof org.card_url === 'string' ? org.card_url : null,
    campaignId: ctx.campaignId,
  };
}

/**
 * @param {import('../parser.mjs').ReturnType<typeof import('../parser.mjs').createParserClient>} parser
 * @param {import('../openrouter.mjs').ReturnType<typeof import('../openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {{ runId: string, campaignId: string, niche: string, region: string, limit: number, enrich: boolean }} opts
 */
export async function runCartographer(parser, openrouter, opts) {
  const { runId, campaignId, niche, region, limit, enrich } = opts;

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

    const toInsert = limited.map((org) => {
      const company = orgToCompanyRecord(org, { niche, region, campaignId });
      const { score, breakdown } = scoreCompany(company);
      return { ...company, score, score_breakdown: breakdown };
    });

    const { created: inserted } = createCompanies(toInsert);
    patchCartographerRun(runId, { found: inserted.length });

    if (enrich && inserted.length > 0) {
      patchCartographerRun(runId, { stage: 'enrich' });
      for (let i = 0; i < inserted.length; i += 1) {
        const company = inserted[i];
        try {
          const enrichment = await enrichCompany(parser, openrouter, company);
          const { score, breakdown } = scoreCompany({ ...company, ...enrichment });
          updateCompany(company.id, { ...enrichment, score, score_breakdown: breakdown });
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
