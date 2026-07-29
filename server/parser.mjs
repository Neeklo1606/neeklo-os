import crypto from 'node:crypto';
import { extractCompaniesFromHtml } from './extract-entities.mjs';

/** @param {string} url */
export function sourceFromUrl(url) {
  if (typeof url !== 'string') return null;
  if (/2gis\.ru/i.test(url)) return '2gis';
  if (/yandex\.ru\/maps/i.test(url)) return 'yandex';
  if (/rusprofile\.ru/i.test(url)) return 'rusprofile';
  if (/avito\.ru/i.test(url)) return 'avito';
  return null;
}

// Sources where the API's `company` entities map directly to our Company shape.
export const COMPANY_ENTITY_SOURCES = new Set(['2gis', 'yandex', 'rusprofile']);

// Sources where the HTML-extraction fallback (extract-entities.mjs) applies —
// its prompt is hard-coded for Maps-style listing pages, so it's scoped to
// the two sources it was written for. Not extended to rusprofile/avito
// without a prompt rewrite (flagged in the integration report).
export const HTML_FALLBACK_SOURCES = new Set(['2gis', 'yandex']);

// docs/API_PARSER_INTEGRATION.ru.md §12: timeoutMs >= 120000 for browser-heavy
// sources; 2gis/yandex specifically need 180000 (Yandex Maps flakiness).
// No prior code enforced this — job bodies never set timeoutMs, so every
// job silently ran at the 120000 default. Enforcing the per-source floor now.
// parseUrl() doesn't enforce this itself (unlike parseOne) since it's a raw
// pass-through for callers like enrich-company.mjs — exported so any caller
// hitting 2gis/yandex individual pages can apply the same floor.
export const MIN_TIMEOUT_MS_BY_SOURCE = { '2gis': 180000, yandex: 180000, avito: 120000 };

/**
 * On search/listing pages (confirmed live against 2GIS) the API can fall back
 * to a fixed per-kind taxonomy where every entity redundantly embeds the SAME
 * full page HTML as `source` and the page <title> as `fields.title` — not a
 * per-organization extraction. A entity.source that's actually a URL is short;
 * one that's a raw HTML dump is not. Reject those rather than mapping the
 * page title in as a fake company name with megabytes of HTML as its card_url.
 */
export function isUrlShaped(value) {
  return typeof value === 'string' && value.length < 2048 && /^https?:\/\//i.test(value);
}

/** @param {import('./parser.mjs').Entity} entity */
export function companyFromEntity(entity) {
  const fields = entity?.fields ?? {};
  const phones = Array.isArray(fields.phones) ? fields.phones : [];
  const address = typeof fields.address === 'string' ? fields.address : null;
  const website = typeof fields.website === 'string' ? fields.website : null;
  if (phones.length === 0 && !address && !website) return null; // name-only isn't enough — see isUrlShaped comment
  if (!isUrlShaped(entity?.source)) return null;
  return {
    name: typeof fields.title === 'string' ? fields.title : null,
    phone: phones[0] ?? null,
    phones,
    address,
    website,
    card_url: entity.source,
  };
}

/**
 * Parser client — talks to neekloai.ru (the standardized parser backend).
 * Public interface: health, sources, listJobs, createJob, getJob, downloadJob, waitForJob.
 *
 * neekloai.ru has no async job queue for /parser/parse — createJob does the
 * real fetch synchronously and stores the result under a locally-generated
 * job id, so waitForJob can return it immediately with no polling.
 *
 * @param {import('./config.mjs').AppConfig} config
 * @param {import('./openrouter.mjs').ReturnType<typeof import('./openrouter.mjs').createOpenRouterClient>} openrouter
 */
export function createParserClient(config, openrouter) {
  /** @type {Map<string, { id: string, status: 'completed' | 'failed', result: unknown, error: string | null }>} */
  const jobStore = new Map();

  const headers = (extra = {}) => ({
    'x-api-key': config.neekloApiKey,
    ...extra,
  });

  async function request(path, options = {}) {
    const { timeoutMs, ...fetchOptions } = options;
    const url = `${config.neekloApiBase}${path}`;
    const controller = timeoutMs ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetch(url, {
        ...fetchOptions,
        headers: headers(fetchOptions.headers ?? {}),
        signal: controller?.signal,
      });
    } catch (e) {
      if (controller?.signal.aborted) {
        const err = new Error(`neekloai.ru timeout after ${timeoutMs}ms`);
        err.status = 504;
        throw err;
      }
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    const requestId = body?.requestId;
    if (!res.ok || body?.success === false) {
      const message = body?.error?.message ?? body?.error ?? res.statusText;
      const err = new Error(typeof message === 'string' ? message : `neekloai.ru ${res.status}`);
      err.status = res.status;
      err.body = body;
      err.requestId = requestId;
      console.error(`[neekloai] requestId=${requestId ?? 'n/a'} ${path} → ${err.message}`);
      throw err;
    }
    // requestId is logged for support/debugging per docs §15/§8 checklist, and
    // carried on the unwrapped data so callers can surface it without a second lookup.
    console.log(`[neekloai] requestId=${requestId ?? 'n/a'} ${path}`);
    // Unwrap { success, data, requestId } envelope.
    const data = body?.data ?? body;
    return data && typeof data === 'object' ? { ...data, requestId } : data;
  }

  /** @param {string} url */
  function isTelegramUrl(url) {
    return typeof url === 'string' && /(^|\/\/)t\.me\//i.test(url);
  }

  /** @param {unknown} data */
  function assertNoCaptcha(data) {
    if (data && typeof data === 'object' && data.authRequired) {
      const reason = data.authRequired.reason ?? 'unknown';
      const err = new Error(`Требуется ручная проверка капчи на ПК-воркере: ${reason}`);
      err.status = 409; // not a 5xx — retrying immediately won't help, matches FIX3's no-retry-on-4xx rule
      throw err;
    }
  }

  /**
   * Direct client for POST /parser/telegram/parse — used by the Radar
   * (server/jobs/radar-check.mjs), separate from parseOne's URL-based
   * telegram handling since callers here already know the channel username.
   * mode: 'incremental' relies on the API's own server-side
   * last_parsed_message_id cursor per channel (confirmed against
   * NEEKLO_USER_GUIDE.ru.md §4.2) — we don't send a cursor ourselves.
   * @param {string} channel @param {{ limit?: number, mode?: 'latest' | 'incremental' | 'offset' | 'full', offset?: number, wait?: boolean, timeoutMs?: number }} [opts]
   */
  async function parseTelegramChannel(channel, opts = {}) {
    const { limit = 50, mode = 'latest', offset, wait = true, timeoutMs = 120000 } = opts;
    const data = await request('/parser/telegram/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, limit, mode, ...(offset != null ? { offset } : {}), wait, timeoutMs }),
      timeoutMs: timeoutMs + 5000,
    });
    assertNoCaptcha(data);
    return data;
  }

  /**
   * Direct client for POST /parser/parse that returns the raw API response
   * as-is (no organizations/entity shaping) — used by enrich-company.mjs,
   * which needs the actual page HTML (data.parsed.source) plus discovery/
   * fetchMeta/error/authRequired to judge whether the site is reachable.
   * @param {string} url @param {{ timeoutMs?: number }} [opts]
   */
  async function parseUrl(url, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 60000;
    return request('/parser/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: encodeURI(url), timeoutMs }),
      timeoutMs: timeoutMs + 5000,
    });
  }

  /** @param {string} url @param {{ timeoutMs?: number, niche?: string }} [opts] */
  async function parseOne(url, opts = {}) {
    const detectedSource = sourceFromUrl(url);
    const minTimeoutMs = detectedSource ? (MIN_TIMEOUT_MS_BY_SOURCE[detectedSource] ?? 120000) : 120000;
    const timeoutMs = Math.max(opts.timeoutMs ?? 120000, minTimeoutMs);

    if (isTelegramUrl(url)) {
      const channel = url
        .replace(/^https?:\/\/(www\.)?t\.me\//i, '')
        .replace(/^s\//, '')
        .split(/[/?]/)[0];
      const data = await request('/parser/telegram/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, limit: 50, mode: 'latest', wait: true, timeoutMs }),
        timeoutMs: timeoutMs + 5000,
      });
      assertNoCaptcha(data);
      // Already structured (posts[]) — no HTML to extract from, skip the extraction layer entirely.
      return { finalUrl: url, data, textPreview: JSON.stringify(data?.posts ?? []) };
    }

    // neekloai.ru's validator rejects raw spaces/unescaped Cyrillic in the URL
    // ("url must be a URL address") — confirmed against the live API. The URL
    // must already be encoded by the time it reaches this function — callers
    // (cartographer-run.mjs, executeJobPlan in maps-pipeline.mjs) are
    // responsible for that. Encoding here too used to double-encode already-
    // escaped `%` sequences (%25D0%25A1...), turning valid search queries
    // into garbage 2GIS can't parse — confirmed live: it fell back to serving
    // unrelated sponsored listings instead of real search results.
    const data = await request('/parser/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, timeoutMs }),
      timeoutMs: timeoutMs + 5000,
    });
    // authRequired must be checked BEFORE entityCount is treated as meaningful —
    // assertNoCaptcha already throws above, so everything below only runs once
    // we know the API isn't blocked on a captcha/login wall.
    assertNoCaptcha(data);

    const entities = Array.isArray(data?.entities) ? data.entities : [];

    // 1. Structured entities first — cheaper and more reliable than the LLM
    // HTML-extraction fallback, per API_PARSER_INTEGRATION.ru.md §5.
    if (entities.length > 0 && detectedSource && COMPANY_ENTITY_SOURCES.has(detectedSource)) {
      const companies = entities
        .filter((e) => e?.kind === 'company')
        .map(companyFromEntity)
        .filter((c) => c && c.name);
      if (companies.length > 0) {
        return {
          finalUrl: url,
          // orgsFromData in src/lib/agent/extract.ts looks for a top-level
          // `organizations` bucket first — this matches that expected shape.
          data: { organizations: companies, entityCount: data?.entityCount, fetchMeta: data?.fetchMeta, requestId: data?.requestId },
          textPreview: JSON.stringify(companies),
        };
      }
    }

    // Avito: marketplace-product entities are listings, not companies — do NOT
    // splice them into `organizations` (that bucket is bulk-inserted as Company
    // records downstream). Surfaced separately under `listings` until product
    // decides how Avito listings should land in the CRM (flagged in the report).
    if (entities.length > 0 && detectedSource === 'avito') {
      // Same page-title/raw-HTML fallback risk as companyFromEntity above —
      // require a real title and a URL-shaped source before trusting the entity.
      const listings = entities.filter(
        (e) => e?.kind === 'marketplace-product' && typeof e?.fields?.title === 'string' && isUrlShaped(e?.source),
      );
      if (listings.length > 0) {
        return {
          finalUrl: url,
          data: { listings, entityCount: data?.entityCount, fetchMeta: data?.fetchMeta, requestId: data?.requestId },
          textPreview: JSON.stringify(listings),
        };
      }
    }

    // 2. Fall back to LLM HTML extraction — only for the two sources the
    // extract-entities.mjs prompt was written for (Yandex Maps / 2GIS), and
    // only once structured entities didn't yield anything above.
    if (HTML_FALLBACK_SOURCES.has(detectedSource)) {
      // The real single copy of the page is in data.parsed.source — the 12 entries
      // under data.entities[] are a fixed taxonomy (company/person/email/phone/...)
      // that each redundantly embed the SAME full page HTML, not per-entity extractions.
      const rawHtml = data?.parsed?.source ?? data?.entities?.[0]?.source ?? '';
      const organizations = rawHtml
        ? await extractCompaniesFromHtml(rawHtml, { source: detectedSource, niche: opts.niche }, openrouter)
        : [];
      return {
        finalUrl: url,
        data: { organizations, entityCount: data?.entityCount, fetchMeta: data?.fetchMeta, requestId: data?.requestId },
        textPreview: JSON.stringify(organizations),
      };
    }

    return { finalUrl: url, data, textPreview: JSON.stringify(data?.entities ?? data ?? '') };
  }

  return {
    health: (timeoutMs) => request('/health', timeoutMs ? { timeoutMs } : {}),
    sources: async () => ({ sources: ['yandex', '2gis', 'telegram', 'vk'] }),
    listJobs: async () => ({ jobs: [...jobStore.values()] }),
    parseTelegramChannel,
    parseUrl,

    createJob: async (body) => {
      const urls = Array.isArray(body?.urls)
        ? body.urls
        : body?.options?.url
          ? [body.options.url]
          : body?.url
            ? [body.url]
            : [];

      if (urls.length === 0) {
        const err = new Error('No URL in job body');
        err.status = 400;
        throw err;
      }

      const pages = [];
      for (const url of urls) {
        pages.push(await parseOne(url, { timeoutMs: body?.timeoutMs, niche: body?.niche }));
      }

      const id = crypto.randomUUID();
      jobStore.set(id, { id, status: 'completed', result: { pages }, error: null });
      return { id, jobId: id, status: 'completed' };
    },

    getJob: async (id) => ({ job: jobStore.get(id) ?? null }),

    downloadJob: async (id) => jobStore.get(id)?.result ?? null,

    // createJob already ran the fetch synchronously, so there's nothing to poll for.
    waitForJob: async (id) => {
      const job = jobStore.get(id);
      if (!job) {
        return { job: { status: 'failed', error: 'Job not found' } };
      }
      return { job };
    },
  };
}
