import { mapsCardGoal } from './company-schema.mjs';

const YANDEX_ORG_RE =
  /https?:\/\/(?:www\.)?yandex\.ru\/maps\/org\/[a-zA-Z0-9_%-]+(?:\/\d+)?\/?/gi;
const YANDEX_ORG_NUMERIC = /yandex\.ru\/maps\/org\/[^/]+\/\d+/;
const GIS_FIRM_RE =
  /https?:\/\/(?:www\.)?2gis\.ru\/[^/\s"'<>]+\/firm\/[^\s"'<>/\\]+/gi;

/** @param {string} url */
function isValidYandexOrgUrl(url) {
  return typeof url === 'string' && YANDEX_ORG_NUMERIC.test(url);
}

/** @param {string} url */
function isValid2gisFirmUrl(url) {
  return (
    typeof url === 'string' &&
    /2gis\.ru\/[^/]+\/firm\//.test(url) &&
    !/XXXXX/i.test(url) &&
    url.split('/firm/')[1]?.length > 3
  );
}

/** @param {unknown} result */
export function extractYandexOrgUrls(result) {
  /** @type {Set<string>} */
  const urls = new Set();

  const add = (raw) => {
    if (typeof raw !== 'string' || !raw.includes('/maps/org/')) return;
    const normalized = raw.split(/[\s)"'\],]/)[0].replace(/\/reviews\/?$/, '/').replace(/\/?$/, '/');
    if (isValidYandexOrgUrl(normalized)) urls.add(normalized);
  };

  if (result && typeof result === 'object') {
    const r = /** @type {Record<string, unknown>} */ (result);
    if (typeof r.answer === 'string') {
      for (const m of r.answer.matchAll(YANDEX_ORG_RE)) add(m[0]);
    }
    for (const page of /** @type {Array<Record<string, unknown>>} */ (r.pages ?? [])) {
      add(String(page.finalUrl ?? ''));
      const data = page.data;
      if (data && typeof data === 'object') {
        const d = /** @type {Record<string, unknown>} */ (data);
        const nested = d.data;
        const buckets = ['organizations', 'orgs', 'companies', 'items'];
        for (const key of buckets) {
          const arr = /** @type {unknown[]} */ (d[key] ?? (nested && typeof nested === 'object' ? /** @type {Record<string, unknown>} */ (nested)[key] : undefined));
          if (!Array.isArray(arr)) continue;
          for (const item of arr) {
            if (item && typeof item === 'object') {
              const rec = /** @type {Record<string, unknown>} */ (item);
              add(String(rec.card_url ?? rec.cardUrl ?? rec.url ?? ''));
            }
          }
        }
      }
      if (typeof page.textPreview === 'string') {
        for (const m of page.textPreview.matchAll(YANDEX_ORG_RE)) add(m[0]);
      }
    }
  }

  return [...urls].slice(0, 20);
}

/** @param {unknown} result */
export function extract2gisFirmUrls(result) {
  /** @type {Set<string>} */
  const urls = new Set();

  const add = (raw) => {
    if (typeof raw !== 'string') return;
    const normalized = raw.split(/[\s)"'\],\\]/)[0].replace(/\/?$/, '/');
    if (isValid2gisFirmUrl(normalized)) urls.add(normalized);
  };

  if (result && typeof result === 'object') {
    const r = /** @type {Record<string, unknown>} */ (result);
    const raw = JSON.stringify(r);
    for (const m of raw.matchAll(GIS_FIRM_RE)) add(m[0]);
    for (const page of /** @type {Array<Record<string, unknown>>} */ (r.pages ?? [])) {
      add(String(page.finalUrl ?? ''));
      const data = page.data;
      if (data && typeof data === 'object') {
        const d = /** @type {Record<string, unknown>} */ (data);
        const nested = d.data;
        for (const key of ['organizations', 'orgs', 'companies']) {
          const arr = /** @type {unknown[]} */ (d[key] ?? (nested && typeof nested === 'object' ? /** @type {Record<string, unknown>} */ (nested)[key] : undefined));
          if (!Array.isArray(arr)) continue;
          for (const item of arr) {
            if (item && typeof item === 'object') {
              const rec = /** @type {Record<string, unknown>} */ (item);
              add(String(rec.card_url ?? rec.cardUrl ?? ''));
            }
          }
        }
      }
    }
  }

  return [...urls].slice(0, 20);
}

/** @param {string} text */
export function wantsMapsEnrichment(text) {
  return /телефон|phones?|контакт|whatsapp|компани|организа|найти|найди|карточк|магазин|продаж|iphone|айфон|2gis|яндекс|карт|импорт|создай/i.test(
    text,
  );
}

/** @param {Record<string, unknown>} body */
export function mapsJobSource(body) {
  const urls = body?.urls;
  if (!Array.isArray(urls)) return null;
  if (urls.some((u) => typeof u === 'string' && u.includes('2gis.ru'))) return '2gis';
  if (urls.some((u) => typeof u === 'string' && u.includes('yandex.ru/maps'))) return 'yandex';
  return null;
}

/** @param {Record<string, unknown>} body */
export function isMapsSearchJob(body) {
  const urls = body?.urls;
  if (!Array.isArray(urls)) return false;
  return urls.some(
    (u) =>
      typeof u === 'string' &&
      (u.includes('yandex.ru/maps') || u.includes('2gis.ru')) &&
      !u.includes('/maps/org/') &&
      !u.includes('/firm/'),
  );
}

/** @param {Record<string, unknown>} body */
export function isMapsCardJob(body) {
  const urls = body?.urls;
  if (!Array.isArray(urls)) return false;
  return urls.some(
    (u) =>
      typeof u === 'string' &&
      (u.includes('/maps/org/') || u.includes('2gis.ru') && u.includes('/firm/')),
  );
}

/**
 * @param {import('./parser.mjs').ReturnType<typeof import('./parser.mjs').createParserClient>} parser
 * @param {string} searchUrl
 * @param {string} query
 */
export async function fetchYandexOrgUrlsViaSmart(parser, searchUrl, query) {
  const created = await parser.createJob({
    mode: 'parse',
    source: 'smart',
    query: query.slice(0, 120),
    limit: 15,
    options: {
      url: searchUrl,
      goal: 'yandex.ru/maps/org/slug/NUMERIC_ID URLs for each organization',
    },
  });
  const jobId = created.jobId ?? created.id;
  if (!jobId) return [];

  const finished = await parser.waitForJob(jobId);
  if (finished.job?.status !== 'completed') return [];

  try {
    const download = await parser.downloadJob(jobId);
    const text = typeof download === 'string' ? download : JSON.stringify(download);
    const urls = new Set();
    for (const m of text.matchAll(/https:\/\/yandex\.ru\/maps\/org\/[^/\s"\\]+\/\d+/g)) {
      const u = `${m[0].replace(/\/reviews\/?$/, '')}/`;
      if (isValidYandexOrgUrl(u)) urls.add(u);
    }
    return [...urls].slice(0, 15);
  } catch {
    return extractYandexOrgUrls(finished.job?.result);
  }
}

/**
 * @param {unknown} lastResult
 * @param {string} userText
 * @param {'yandex' | '2gis'} source
 * @param {string} [niche]
 */
export function buildMapsCardJob(lastResult, userText, source, niche) {
  if (!wantsMapsEnrichment(userText)) return null;

  const orgUrls =
    source === '2gis' ? extract2gisFirmUrls(lastResult) : extractYandexOrgUrls(lastResult);

  if (orgUrls.length === 0) return null;

  return {
    label: `${source === '2gis' ? '2GIS' : 'Яндекс'} карточки (${orgUrls.length}) — контакты`,
    body: {
      mode: 'urls',
      urls: orgUrls,
      goal: mapsCardGoal(niche ?? ''),
      includeTextPreview: true,
    },
    source,
  };
}

const RETRY_DELAYS_MS = [2000, 5000];

/** @param {unknown} err */
function isRetryableError(err) {
  const status = /** @type {{ status?: number }} */ (err)?.status;
  // No status usually means a network/timeout failure — treat as retryable.
  // A real status code is only retryable if it's a 5xx (server/gateway problem),
  // never a 4xx (that's a real request problem, retrying won't help).
  return typeof status === 'number' ? status >= 500 && status < 600 : true;
}

/** @param {() => Promise<unknown>} fn */
async function withRetry(fn) {
  const maxAttempts = RETRY_DELAYS_MS.length + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      const retryable = isRetryableError(e);
      if (!retryable || attempt === maxAttempts) {
        const base = e instanceof Error ? e.message : 'Job failed';
        throw new Error(attempt > 1 ? `${base} (после ${attempt} попыток)` : base);
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }
  }
  return undefined;
}

/**
 * parser.mjs's request() no longer encodes URLs itself (encoding an
 * already-encoded URL a second time turns `%D0%A1...` into `%25D0%25A1...`,
 * garbage 2GIS can't parse) — callers now own encoding. Job bodies here
 * originate from the LLM's plan (openrouter.plan()) and embed raw, unescaped
 * Cyrillic search text straight into the URL string (see agent-prompt.mjs's
 * own examples, e.g. "https://2gis.ru/moscow/search/ЗАПРОС"), so this is the
 * one place that must encode before dispatch. Safe to apply unconditionally:
 * URLs that are already fully-qualified and ASCII-only (extracted card URLs
 * from buildMapsCardJob/fetchYandexOrgUrlsViaSmart) pass through encodeURI
 * unchanged.
 * @param {Record<string, unknown>} body
 */
function encodeJobUrls(body) {
  const next = { ...body };
  if (Array.isArray(next.urls)) {
    next.urls = next.urls.map((u) => (typeof u === 'string' ? encodeURI(u) : u));
  }
  if (next.options && typeof next.options === 'object') {
    const options = /** @type {Record<string, unknown>} */ (next.options);
    if (typeof options.url === 'string') {
      next.options = { ...options, url: encodeURI(options.url) };
    }
  }
  if (typeof next.url === 'string') {
    next.url = encodeURI(next.url);
  }
  return next;
}

/**
 * @param {import('./parser.mjs').ReturnType<typeof import('./parser.mjs').createParserClient>} parser
 * @param {Array<{ label?: string, body?: Record<string, unknown> }>} plannedJobs
 * @param {{ userText?: string, autoMapsPipeline?: boolean, niche?: string, onProgress?: (state: { executed: unknown[], currentLabel: string | null, jobsDone: number }) => void }} opts
 */
export async function executeJobPlan(parser, plannedJobs, opts = {}) {
  /** @type {Array<{ label: string, jobId: string, status: string, source?: string, result?: unknown, error?: string }>} */
  const executed = [];
  let pending = plannedJobs.map((j) => ({
    label: j.label ?? 'Задача',
    body: j.body ?? j,
  }));

  const userText = opts.userText ?? '';
  const niche = opts.niche ?? null;

  const report = (currentLabel = null) => {
    opts.onProgress?.({ executed: [...executed], currentLabel, jobsDone: executed.length });
  };

  // Preflight: one quick health check before burning through full job timeouts
  // when the parser service is already known to be down.
  if (pending.length > 0) {
    try {
      await parser.health(5000);
    } catch {
      const message = 'Сервис парсинга недоступен (health check failed)';
      for (const item of pending) {
        executed.push({ label: item.label ?? 'Задача', jobId: '', status: 'failed', error: message });
      }
      report(null);
      return executed;
    }
  }

  let stepIndex = 0;
  while (stepIndex < pending.length) {
    const item = pending[stepIndex];
    stepIndex += 1;
    item.body = encodeJobUrls(item.body);
    const label = item.label ?? 'Задача';
    const jobSource = mapsJobSource(item.body);

    report(label);

    try {
      const created = await withRetry(() => parser.createJob(item.body));
      const jobId = created.jobId ?? created.id;
      if (!jobId) {
        executed.push({ label, jobId: '', status: 'failed', error: 'No jobId returned' });
        continue;
      }
      const finished = await withRetry(() => parser.waitForJob(jobId));
      const result = finished.job?.result;
      executed.push({
        label,
        jobId,
        status: finished.job?.status ?? 'unknown',
        source: jobSource ?? undefined,
        result,
        error: finished.job?.error,
      });

      if (
        opts.autoMapsPipeline !== false &&
        finished.job?.status === 'completed' &&
        isMapsSearchJob(item.body) &&
        !pending.slice(stepIndex).some((p) => isMapsCardJob(p.body))
      ) {
        const source = mapsJobSource(item.body) ?? 'yandex';
        let cardJob = buildMapsCardJob(result, userText, source, niche ?? undefined);

        if (!cardJob && source === 'yandex') {
          const searchUrl = /** @type {string[]} */ (item.body.urls)?.[0];
          if (searchUrl) {
            const smartUrls = await fetchYandexOrgUrlsViaSmart(parser, searchUrl, userText);
            if (smartUrls.length > 0) {
              cardJob = {
                label: `Яндекс smart → карточки (${smartUrls.length})`,
                body: {
                  mode: 'urls',
                  urls: smartUrls,
                  goal: mapsCardGoal(niche ?? ''),
                  includeTextPreview: true,
                },
                source: 'yandex',
              };
            }
          }
        }

        if (cardJob) {
          pending = [...pending, cardJob];
        }
      }
      report(null);
    } catch (e) {
      executed.push({
        label,
        jobId: '',
        status: 'failed',
        error: e instanceof Error ? e.message : 'Job failed',
      });
    }
  }

  report(null);
  return executed;
}

// backward compat
export const wantsPhoneContacts = wantsMapsEnrichment;
export function appendMapsPhoneStep(jobs, lastResult, userText) {
  const card = buildMapsCardJob(lastResult, userText, 'yandex');
  return card ? [...jobs, card] : jobs;
}

export function extractYandexOrgUrlsLegacy(result) {
  return extractYandexOrgUrls(result);
}
