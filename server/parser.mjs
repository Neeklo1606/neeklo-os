import crypto from 'node:crypto';
import { extractCompaniesFromHtml } from './extract-entities.mjs';

/** @param {string} url */
function mapsSourceFromUrl(url) {
  if (typeof url !== 'string') return null;
  if (/2gis\.ru/i.test(url)) return '2gis';
  if (/yandex\.ru\/maps/i.test(url)) return 'yandex';
  return null;
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
    if (!res.ok || body?.success === false) {
      const message = body?.error?.message ?? body?.error ?? res.statusText;
      const err = new Error(typeof message === 'string' ? message : `neekloai.ru ${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    // Unwrap { success, data, requestId } envelope.
    return body?.data ?? body;
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

  /** @param {string} url @param {{ timeoutMs?: number, niche?: string }} [opts] */
  async function parseOne(url, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 120000;

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
    // ("url must be a URL address") — confirmed against the live API.
    const data = await request('/parser/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: encodeURI(url), timeoutMs }),
      timeoutMs: timeoutMs + 5000,
    });
    assertNoCaptcha(data);

    const mapsSource = mapsSourceFromUrl(url);
    if (mapsSource) {
      // The real single copy of the page is in data.parsed.source — the 12 entries
      // under data.entities[] are a fixed taxonomy (company/person/email/phone/...)
      // that each redundantly embed the SAME full page HTML, not per-entity extractions.
      const rawHtml = data?.parsed?.source ?? data?.entities?.[0]?.source ?? '';
      const organizations = rawHtml
        ? await extractCompaniesFromHtml(rawHtml, { source: mapsSource, niche: opts.niche }, openrouter)
        : [];
      return {
        finalUrl: url,
        // orgsFromData in src/lib/agent/extract.ts looks for a top-level
        // `organizations` bucket first — this matches that expected shape.
        data: { organizations, entityCount: data?.entityCount, fetchMeta: data?.fetchMeta },
        textPreview: JSON.stringify(organizations),
      };
    }

    return { finalUrl: url, data, textPreview: JSON.stringify(data?.entities ?? data ?? '') };
  }

  return {
    health: (timeoutMs) => request('/health', timeoutMs ? { timeoutMs } : {}),
    sources: async () => ({ sources: ['yandex', '2gis', 'telegram', 'vk'] }),
    listJobs: async () => ({ jobs: [...jobStore.values()] }),

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
