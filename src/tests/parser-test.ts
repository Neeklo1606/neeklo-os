/**
 * Parser API read-only integration tests.
 * Pipeline: Yandex + 2GIS search → smart org URLs (Yandex) → card scrape for phones.
 */

const API_BASE = 'https://api.neeklo.ru';
const API_KEY = (import.meta.env.VITE_PARSER_API_KEY as string | undefined)?.trim() || '';

const POLL_MS = 8000;
const JOB_TIMEOUT_MS = 15 * 60 * 1000;
const PHONE_RE = /\+7[\d\s()\-]{9,}/g;
const YANDEX_ORG_FULL =
  /https?:\/\/(?:www\.)?yandex\.ru\/maps\/org\/[^/\s"'<>]+\/\d+\/?/gi;
const GIS_FIRM = /https?:\/\/(?:www\.)?2gis\.ru\/[^/\s"'<>]+\/firm\/[^\s"'<>/\\]+/gi;

type LogFn = (...args: unknown[]) => void;

interface ParserOrganization {
  name?: string;
  address?: string;
  city?: string;
  rating?: number;
  reviews_count?: number;
  card_url?: string;
  phones?: string[];
}

interface OrgResult {
  name: string | null;
  source: 'yandex' | '2gis';
  address: string | null;
  phone: string | null;
  website: string | null;
  source_url: string | null;
}

interface ParserJobResponse {
  success?: boolean;
  job?: {
    id?: string;
    status?: string;
    result?: {
      answer?: string;
      pages?: Array<{
        url?: string;
        finalUrl?: string;
        ok?: boolean;
        blocked?: boolean;
        title?: string;
        data?: unknown;
        textPreview?: string;
      }>;
    };
    error?: string;
  };
  jobId?: string;
}

function headers(): HeadersInit {
  return {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json',
  };
}

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { 'x-api-key': API_KEY } });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: unknown }).error)
        : res.statusText,
    );
  }
  return body;
}

async function apiPost(path: string, payload: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok && res.status !== 202) {
    throw new Error(
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: unknown }).error)
        : res.statusText,
    );
  }
  return body;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractOrganizations(data: unknown): ParserOrganization[] {
  const rec = asRecord(data);
  if (!rec) return [];
  const nested = asRecord(rec.data);
  const fromNested = nested?.organizations ?? nested?.orgs;
  if (Array.isArray(fromNested)) {
    return fromNested.filter((o): o is ParserOrganization => o && typeof o === 'object');
  }
  const orgs = rec.organizations ?? rec.orgs ?? rec.companies;
  if (!Array.isArray(orgs)) return [];
  return orgs.filter((o): o is ParserOrganization => o && typeof o === 'object');
}

function phonesFromText(text: string): string[] {
  return [...new Set((text.match(PHONE_RE) ?? []).map((p) => p.trim()))];
}

function isValidYandexOrgUrl(url: string): boolean {
  return /yandex\.ru\/maps\/org\/[^/]+\/\d+/.test(url);
}

function isValid2gisFirmUrl(url: string): boolean {
  return /2gis\.ru\/[^/]+\/firm\//.test(url) && !/XXXXX/i.test(url);
}

function extractUrlsFromText(text: string, pattern: RegExp): string[] {
  return [...new Set((text.match(pattern) ?? []).map((u) => u.replace(/\/?$/, '/')))];
}

function extractYandexOrgUrls(result: unknown): string[] {
  const urls = new Set<string>();
  const raw = JSON.stringify(result ?? {});
  for (const u of extractUrlsFromText(raw, YANDEX_ORG_FULL)) {
    if (isValidYandexOrgUrl(u)) urls.add(u);
  }
  const rec = asRecord(result);
  for (const page of (rec?.pages as unknown[]) ?? []) {
    const p = asRecord(page);
    const orgs = extractOrganizations(p?.data);
    for (const org of orgs) {
      if (org.card_url && isValidYandexOrgUrl(org.card_url)) urls.add(org.card_url);
    }
  }
  return [...urls];
}

function extract2gisFirmUrls(result: unknown): string[] {
  const urls = new Set<string>();
  const raw = JSON.stringify(result ?? {});
  for (const u of extractUrlsFromText(raw, GIS_FIRM)) {
    if (isValid2gisFirmUrl(u)) urls.add(u);
  }
  const rec = asRecord(result);
  for (const page of (rec?.pages as unknown[]) ?? []) {
    const p = asRecord(page);
    const orgs = extractOrganizations(p?.data);
    for (const org of orgs) {
      if (org.card_url && isValid2gisFirmUrl(org.card_url)) urls.add(org.card_url);
    }
  }
  return [...urls];
}

async function pollJob(jobId: string, log: LogFn): Promise<ParserJobResponse['job']> {
  const started = Date.now();
  while (Date.now() - started < JOB_TIMEOUT_MS) {
    const data = (await apiGet(`/parser/jobs/${jobId}`)) as ParserJobResponse;
    const status = data.job?.status;
    const elapsed = Math.round((Date.now() - started) / 1000);
    log(`  poll ${elapsed}s: status=${status}`);
    if (status === 'completed') return data.job;
    if (status === 'failed') {
      throw new Error(data.job?.error ?? 'Job failed');
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`Job ${jobId} timed out after ${JOB_TIMEOUT_MS / 60000} minutes`);
}

async function createJob(body: Record<string, unknown>, log: LogFn): Promise<string> {
  const created = (await apiPost('/parser/jobs', body)) as { jobId?: string; id?: string };
  const jobId = created.jobId ?? created.id;
  if (!jobId) throw new Error('No jobId returned');
  log(`  jobId: ${jobId}`);
  return jobId;
}

async function fetchSmartYandexUrls(log: LogFn): Promise<string[]> {
  log('  smart parse: extracting Yandex org URLs with numeric IDs…');
  const jobId = await createJob(
    {
      mode: 'parse',
      source: 'smart',
      query: 'стоматологические клиники Москва',
      limit: 15,
      options: {
        url: 'https://yandex.ru/maps/?text=стоматологические%20клиники%20Москва',
        goal: 'yandex.ru/maps/org/slug/NUMERIC_ID URLs for dental clinics',
      },
    },
    log,
  );
  await pollJob(jobId, log);
  const res = await fetch(`${API_BASE}/parser/jobs/${jobId}/download`, {
    headers: { 'x-api-key': API_KEY },
  });
  const text = await res.text();
  const urls = extractUrlsFromText(text, YANDEX_ORG_FULL).filter(isValidYandexOrgUrl);
  log(`  smart download: ${urls.length} valid org URLs`);
  return urls;
}

function mergePageContacts(
  source: 'yandex' | '2gis',
  page: NonNullable<ParserJobResponse['job']>['result'] extends infer R
    ? R extends { pages?: infer P }
      ? P extends Array<infer Item>
        ? Item
        : never
      : never
    : never,
  answer?: string,
): OrgResult {
  const dataRec = asRecord(page.data);
  const contactsRaw = dataRec?.contacts ?? dataRec;
  const contacts = asRecord(contactsRaw);
  const phones: string[] = [];
  if (contacts) {
    const p = contacts.phones ?? contacts.phone;
    if (Array.isArray(p)) phones.push(...p.filter((x): x is string => typeof x === 'string'));
    else if (typeof p === 'string' && !p.includes('...')) phones.push(p);
  }
  if (phones.length === 0) {
    phones.push(...phonesFromText(page.textPreview ?? ''));
    phones.push(...phonesFromText(answer ?? ''));
  }
  const uniquePhones = [...new Set(phones)];
  return {
    name:
      (typeof contacts?.name === 'string' ? contacts.name : null) ??
      (typeof page.title === 'string' ? page.title : null),
    source,
    address: typeof contacts?.address === 'string' ? contacts.address : null,
    phone: uniquePhones[0] ?? null,
    website: typeof contacts?.website === 'string' ? contacts.website : null,
    source_url: page.finalUrl ?? page.url ?? null,
  };
}

async function scrapeCardPhones(
  source: 'yandex' | '2gis',
  urls: string[],
  log: LogFn,
): Promise<OrgResult[]> {
  if (urls.length === 0) return [];
  const batchSize = 5;
  const results: OrgResult[] = [];

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    log(`─── ${source} cards batch ${Math.floor(i / batchSize) + 1} (${batch.length} URLs) ───`);
    for (const u of batch) log(`  ${u}`);

    const jobId = await createJob(
      {
        mode: 'urls',
        urls: batch,
        goal:
          'Из карточки: name, address, phones[] (кликни «Показать телефон»), website, rating. data.contacts',
        includeTextPreview: true,
      },
      log,
    );
    const job = await pollJob(jobId, log);
    const answer = job?.result?.answer ?? '';

    for (const page of job?.result?.pages ?? []) {
      results.push(mergePageContacts(source, page, answer));
    }
  }
  return results;
}

async function runMapsPipeline(
  source: 'yandex' | '2gis',
  searchUrl: string,
  searchGoal: string,
  log: LogFn,
  smartFallback?: () => Promise<string[]>,
): Promise<OrgResult[]> {
  log(`\n─── ${source.toUpperCase()} Job1: search ───`);
  const job1Id = await createJob(
    {
      mode: 'urls',
      urls: [searchUrl],
      goal: searchGoal,
      includeTextPreview: true,
    },
    log,
  );
  const job1 = await pollJob(job1Id, log);
  const orgs = extractOrganizations(job1?.result?.pages?.[0]?.data);
  log(`  found ${orgs.length} organizations in data`);

  let cardUrls =
    source === 'yandex'
      ? extractYandexOrgUrls(job1?.result)
      : extract2gisFirmUrls(job1?.result);

  if (cardUrls.length === 0 && smartFallback) {
    log(`  ⚠️ no valid card URLs in Job1 — running smart fallback`);
    cardUrls = await smartFallback();
  }

  cardUrls = cardUrls.slice(0, 10);
  log(`  card URLs for Job2: ${cardUrls.length}`);

  if (cardUrls.length === 0) {
    log(`  ⚠️ skipping ${source} Job2 — no card URLs`);
    return orgs.map((o) => ({
      name: o.name ?? null,
      source,
      address: o.address ?? null,
      phone: null,
      website: null,
      source_url: o.card_url ?? null,
    }));
  }

  return scrapeCardPhones(source, cardUrls, log);
}

export async function runParserTest(log: LogFn = console.log): Promise<void> {
  log('═══════════════════════════════════════');
  log('NEEKLO OS — Parser API Test (Yandex + 2GIS)');
  log('═══════════════════════════════════════\n');

  if (!API_KEY) {
    log('❌ VITE_PARSER_API_KEY is not set');
    return;
  }

  log('─── TEST 1: Health check ───');
  try {
    const health = (await apiGet('/parser/health')) as { cdp?: boolean };
    if (health.cdp !== true) {
      log('❌ Parser offline (cdp: false)');
      return;
    }
    log('✅ Parser online, cdp: true\n');
  } catch (e) {
    log('❌ Parser offline', e instanceof Error ? e.message : e);
    return;
  }

  const allResults: OrgResult[] = [];

  const yandexResults = await runMapsPipeline(
    'yandex',
    'https://yandex.ru/maps/?text=стоматологические%20клиники%20Москва',
    '10 стоматологических клиник Москвы. data.organizations[]: name, address, city, rating, reviews_count, card_url (полный yandex.ru/maps/org/slug/NUMERIC_ID/)',
    log,
    () => fetchSmartYandexUrls(log),
  );
  allResults.push(...yandexResults);

  const gisResults = await runMapsPipeline(
    '2gis',
    'https://2gis.ru/moscow/search/стоматологические%20клиники',
    '10 стоматологических клиник Москвы. data.organizations[]: name, address, city, rating, card_url (полный 2gis.ru/moscow/firm/ID)',
    log,
  );
  allResults.push(...gisResults);

  const withPhone = allResults.filter((r) => r.phone).length;
  const yandexWithPhone = yandexResults.filter((r) => r.phone).length;
  const gisWithPhone = gisResults.filter((r) => r.phone).length;

  log('\n─── PHONE RESULTS ───');
  for (const r of allResults) {
    log(`[${r.source}] ${r.name ?? '?'} → ${r.phone ?? '—'}`);
    if (r.source_url) log(`  ${r.source_url}`);
  }

  log('\n─── FINAL REPORT ───');
  log(`Total organizations: ${allResults.length}`);
  log(`Yandex with phone: ${yandexWithPhone}/${yandexResults.length}`);
  log(`2GIS with phone: ${gisWithPhone}/${gisResults.length}`);
  log(`Total with phone: ${withPhone}/${allResults.length}`);
  log('Note: 2GIS often masks phones (+7 …) on list pages; use firm URLs from UI/smart.');
  log('═══════════════════════════════════════');
}
