#!/usr/bin/env node
/**
 * Full maps phone test: Yandex + 2GIS (2-step pipeline each).
 * Run: node scripts/run-maps-phones-test.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const API_BASE = env.PARSER_API_BASE?.trim() || 'https://api.neeklo.ru';
const API_KEY = env.PARSER_API_KEY?.trim();
if (!API_KEY) {
  console.error('PARSER_API_KEY missing in .env');
  process.exit(1);
}

const POLL_MS = 8000;
const JOB_TIMEOUT_MS = 15 * 60 * 1000;
const PHONE_RE = /\+7[\d\s()\-]{9,}/g;
const YANDEX_ORG_FULL = /https?:\/\/(?:www\.)?yandex\.ru\/maps\/org\/[^/\s"'<>]+\/\d+\/?/gi;
const YANDEX_ORG_ANY = /https?:\/\/(?:www\.)?yandex\.ru\/maps\/org\/[^\s"'<>]+/gi;
const GIS_FIRM = /https?:\/\/(?:www\.)?2gis\.ru\/[^/\s"'<>]+\/firm\/[^\s"'<>]+/gi;

const headers = { 'x-api-key': API_KEY, 'Content-Type': 'application/json' };

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { 'x-api-key': API_KEY } });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || res.statusText);
  return body;
}

async function apiPost(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok && res.status !== 202) throw new Error(body?.error || res.statusText);
  return body;
}

async function pollJob(jobId, label) {
  const started = Date.now();
  while (Date.now() - started < JOB_TIMEOUT_MS) {
    const data = await apiGet(`/parser/jobs/${jobId}`);
    const status = data.job?.status;
    const elapsed = Math.round((Date.now() - started) / 1000);
    process.stdout.write(`\r  [${label}] poll ${elapsed}s: ${status}   `);
    if (status === 'completed') {
      console.log('');
      return data.job;
    }
    if (status === 'failed') throw new Error(data.job?.error || 'Job failed');
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`Job ${jobId} timed out`);
}

function unique(arr) {
  return [...new Set(arr)];
}

function phonesFromText(text) {
  if (!text) return [];
  return unique((text.match(PHONE_RE) || []).map((p) => p.trim()));
}

function extractFromResult(result, patterns) {
  const urls = new Set();
  const raw = JSON.stringify(result);
  for (const pat of patterns) {
    for (const m of raw.matchAll(pat)) urls.add(m[0].replace(/\/?$/, '/'));
  }
  return [...urls];
}

function extractOrgs(data) {
  if (!data || typeof data !== 'object') return [];
  const d = /** @type {Record<string, unknown>} */ (data);
  const nested = d.data;
  if (nested && typeof nested === 'object') {
    const orgs = /** @type {Record<string, unknown>} */ (nested).organizations;
    if (Array.isArray(orgs)) return orgs;
  }
  const orgs = d.organizations ?? d.orgs ?? d.companies;
  return Array.isArray(orgs) ? orgs : [];
}

function isValidYandexOrgUrl(url) {
  return /yandex\.ru\/maps\/org\/[^/]+\/\d+/.test(url);
}

function isValid2gisFirmUrl(url) {
  return /2gis\.ru\/[^/]+\/firm\//.test(url);
}

function contactsFromPage(page) {
  const data = page?.data;
  let contacts = null;
  if (data && typeof data === 'object') {
    const d = /** @type {Record<string, unknown>} */ (data);
    contacts = d.contacts ?? d.data?.contacts;
    if (!contacts && d.organizations?.[0]) contacts = d.organizations[0];
  }
  const phones = [];
  if (contacts && typeof contacts === 'object') {
    const c = /** @type {Record<string, unknown>} */ (contacts);
    if (Array.isArray(c.phones)) phones.push(...c.phones.filter((x) => typeof x === 'string'));
    if (typeof c.phone === 'string') phones.push(c.phone);
  }
  const fromPreview = phonesFromText(page?.textPreview);
  const fromAnswer = phonesFromText(page?.answer);
  const all = unique([...phones, ...fromPreview, ...fromAnswer]);
  const name =
    (contacts && typeof contacts === 'object' && typeof contacts.name === 'string'
      ? contacts.name
      : null) ||
    page?.title ||
    null;
  return { name, phones: all, website: contacts?.website ?? null, address: contacts?.address ?? null };
}

async function runCardJob(source, urls, batchSize = 3) {
  const results = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const label = `${source} Job2 batch ${Math.floor(i / batchSize) + 1}`;
    console.log(`\n─── ${label} (${batch.length} URLs) ───`);
    for (const u of batch) console.log(`  ${u}`);

    const body = {
      mode: 'urls',
      urls: batch,
      goal:
        'Из каждой карточки организации: name, address, phones[] (кликни «Показать телефон»), website, rating. Формат: data.contacts { name, address, phones, website }.',
      includeTextPreview: true,
    };
    const created = await apiPost('/parser/jobs', body);
    const jobId = created.jobId ?? created.id;
    console.log(`  jobId: ${jobId}`);
    const job = await pollJob(jobId, label);
    const answerPhones = phonesFromText(job.result?.answer);
    if (answerPhones.length) console.log(`  answer phones: ${answerPhones.join(', ')}`);

    for (const page of job.result?.pages ?? []) {
      const c = contactsFromPage(page);
      results.push({
        source,
        url: page.finalUrl || page.url,
        ok: page.ok,
        blocked: page.blocked,
        name: c.name,
        phones: c.phones,
        website: c.website,
        address: c.address,
      });
    }
  }
  return results;
}

async function runSearchJob(source, url, goal) {
  console.log(`\n═══ ${source} Job1: search ═══`);
  console.log(`  URL: ${url}`);
  const created = await apiPost('/parser/jobs', {
    mode: 'urls',
    urls: [url],
    goal,
    includeTextPreview: true,
  });
  const jobId = created.jobId ?? created.id;
  console.log(`  jobId: ${jobId}`);
  const job = await pollJob(jobId, `${source} Job1`);
  return job;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('Maps Phone Test — Yandex + 2GIS');
  console.log('═══════════════════════════════════════');

  const health = await apiGet('/parser/health');
  console.log('\nHealth:', health.cdp ? '✅ cdp online' : '❌ offline');
  if (!health.cdp) process.exit(1);

  const allResults = [];

  // ─── YANDEX ───
  const yaJob1 = await runSearchJob(
    'Yandex',
    'https://yandex.ru/maps/?text=стоматологические%20клиники%20Москва',
    'Найди 10 стоматологических клиник Москвы. Для каждой открой карточку в списке и скопируй ПОЛНЫЙ URL из адресной строки с числовым ID, например https://yandex.ru/maps/org/slug/1234567890/. В data.organizations[] верни: name, address, city, rating (number), reviews_count (number), card_url (полный URL с /число/ в конце).',
  );

  let yaUrls = extractFromResult(yaJob1.result, [YANDEX_ORG_FULL]);
  const yaOrgs = extractOrgs(yaJob1.result?.pages?.[0]?.data);
  for (const org of yaOrgs) {
    const u = org.card_url || org.cardUrl || org.url;
    if (typeof u === 'string' && isValidYandexOrgUrl(u)) yaUrls.push(u);
  }
  yaUrls = unique(yaUrls.filter(isValidYandexOrgUrl));

  console.log(`\nYandex: ${yaOrgs.length} orgs in data, ${yaUrls.length} valid card URLs`);
  if (yaUrls.length === 0) {
    const fallback = extractFromResult(yaJob1.result, [YANDEX_ORG_ANY]);
    console.log(`  ⚠️ No URLs with numeric ID. Fallback URLs (may 404): ${fallback.length}`);
    yaUrls = fallback.slice(0, 5);
  } else {
    yaUrls = yaUrls.slice(0, 10);
  }

  if (yaUrls.length > 0) {
    const yaResults = await runCardJob('Yandex', yaUrls, 3);
    allResults.push(...yaResults);
  }

  // ─── 2GIS ───
  const gisJob1 = await runSearchJob(
    '2GIS',
    'https://2gis.ru/moscow/search/стоматологические%20клиники',
    'Найди 10 стоматологических клиник Москвы. Для каждой открой карточку и скопируй полный firm URL вида https://2gis.ru/moscow/firm/XXXXX. В data.organizations[] верни: name, address, city, rating, card_url (полный firm URL).',
  );

  let gisUrls = extractFromResult(gisJob1.result, [GIS_FIRM]);
  const gisOrgs = extractOrgs(gisJob1.result?.pages?.[0]?.data);
  for (const org of gisOrgs) {
    const u = org.card_url || org.cardUrl || org.url;
    if (typeof u === 'string' && isValid2gisFirmUrl(u)) gisUrls.push(u);
  }
  gisUrls = unique(gisUrls.filter(isValid2gisFirmUrl));

  console.log(`\n2GIS: ${gisOrgs.length} orgs in data, ${gisUrls.length} firm URLs`);
  if (gisUrls.length === 0) {
    console.log('  ⚠️ No 2GIS firm URLs found — phones unlikely on search page');
    const previewPhones = phonesFromText(gisJob1.result?.pages?.[0]?.textPreview);
    if (previewPhones.length) {
      allResults.push({
        source: '2GIS',
        url: 'search page',
        ok: true,
        name: 'from search preview',
        phones: previewPhones,
      });
    }
  } else {
    gisUrls = gisUrls.slice(0, 10);
    const gisResults = await runCardJob('2GIS', gisUrls, 3);
    allResults.push(...gisResults);
  }

  // ─── REPORT ───
  console.log('\n═══════════════════════════════════════');
  console.log('RESULTS — ALL ORGANIZATIONS');
  console.log('═══════════════════════════════════════\n');

  let withPhone = 0;
  for (const r of allResults) {
    const phone = r.phones?.[0] ?? '—';
    if (r.phones?.length) withPhone++;
    console.log(`[${r.source}] ${r.name || '?'}`);
    console.log(`  URL: ${r.url}`);
    console.log(`  Phone: ${phone}${r.phones?.length > 1 ? ` (+${r.phones.length - 1} more)` : ''}`);
    if (r.address) console.log(`  Address: ${r.address}`);
    if (r.website) console.log(`  Website: ${r.website}`);
    console.log(`  ok=${r.ok}${r.blocked ? ' BLOCKED' : ''}`);
    console.log('');
  }

  console.log('─── SUMMARY ───');
  console.log(`Total org pages: ${allResults.length}`);
  console.log(`With phone: ${withPhone}`);
  console.log(`Without phone: ${allResults.length - withPhone}`);
}

main().catch((e) => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
