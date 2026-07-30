import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PATH = join(__dirname, '..', 'data', 'radar.json');

/** @type {string} */
let dbPath = process.env.RADAR_DATABASE_PATH?.trim() || DEFAULT_PATH;

function ensureDir() {
  mkdirSync(dirname(dbPath), { recursive: true });
}

/**
 * Was `channel: { id, username, title, category, active, lastMessageId,
 * lastCheckedAt }` (Telegram-only). Generalized to `source: { id, type,
 * identifier, label, active, lastCheckedAt, lastItemId }` so Avito/VC.ru/
 * Habr searches — identified by a search URL, not a channel username —
 * fit the same shape. Old on-disk records (key `channels`, no `type`)
 * are read and normalized into the new shape on load; every write goes
 * out under `sources`. Empty on this project so far, but handled anyway.
 * @param {Record<string, unknown>} raw
 */
function normalizeSource(raw) {
  if (raw.type) return raw; // already new-shape
  return {
    ...raw,
    type: 'telegram',
    identifier: raw.username ?? raw.identifier,
    label: raw.title ?? raw.label,
    lastItemId: raw.lastMessageId ?? raw.lastItemId ?? null,
  };
}

/** @returns {{ sources: Record<string, unknown>[], keywords: Record<string, unknown>[], signals: Record<string, unknown>[] }} */
function readStore() {
  ensureDir();
  if (!existsSync(dbPath)) return { sources: [], keywords: [], signals: [] };
  try {
    const raw = readFileSync(dbPath, 'utf8');
    const data = JSON.parse(raw);
    const rawSources = Array.isArray(data.sources) ? data.sources : Array.isArray(data.channels) ? data.channels : [];
    return {
      sources: rawSources.map(normalizeSource),
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      signals: Array.isArray(data.signals) ? data.signals : [],
    };
  } catch (err) {
    console.error('[radar-db] read failed:', err);
    return { sources: [], keywords: [], signals: [] };
  }
}

/** @param {{ sources: Record<string, unknown>[], keywords: Record<string, unknown>[], signals: Record<string, unknown>[] }} store */
function writeStore(store) {
  ensureDir();
  const tmp = `${dbPath}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  renameSync(tmp, dbPath);
}

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ——— Sources (was "Channels" — Telegram-only; generalized to also carry
// Avito/VC.ru/Habr searches, distinguished by `type`) ———

/**
 * @typedef {{
 *   id: string,
 *   type: 'telegram' | 'avito' | 'vc' | 'habr' | 'custom',
 *   identifier: string,
 *   label?: string,
 *   category?: string,
 *   active: boolean,
 *   lastCheckedAt: string | null,
 *   lastItemId: number | string | null,
 *   createdAt: string,
 * }} RadarSource
 */

/** @param {{ active?: boolean, type?: string }} [opts] */
export function listSources(opts = {}) {
  const { sources } = readStore();
  let filtered = sources;
  if (typeof opts.active === 'boolean') filtered = filtered.filter((s) => Boolean(s.active) === opts.active);
  if (opts.type) filtered = filtered.filter((s) => s.type === opts.type);
  return filtered;
}

export function listActiveSources() {
  return listSources({ active: true });
}

/** @param {string} id */
export function getSource(id) {
  return readStore().sources.find((s) => s.id === id) ?? null;
}

/** @param {Record<string, unknown>} source */
export function createSource(source) {
  const store = readStore();
  const row = {
    active: true,
    lastCheckedAt: null,
    lastItemId: null,
    type: 'telegram',
    ...source,
    id: source.id ?? genId('source'),
    createdAt: source.createdAt ?? new Date().toISOString(),
  };
  if (!row.identifier) {
    const err = new Error('identifier is required');
    err.status = 400;
    throw err;
  }
  if (store.sources.some((s) => s.id === row.id)) {
    const err = new Error('Source with this id already exists');
    err.status = 409;
    throw err;
  }
  store.sources.push(row);
  writeStore(store);
  return row;
}

/**
 * Bulk add — Telegram-specific (the "paste a list of usernames" flow);
 * Avito/VC.ru/Habr searches are added one at a time via createSource
 * since each needs its own keyword/URL, not a bare username.
 * @param {string[]} usernames
 * @returns {{ created: Record<string, unknown>[], skipped: number }}
 */
export function createSourcesBulk(usernames) {
  const store = readStore();
  /** @type {Record<string, unknown>[]} */
  const created = [];
  let skipped = 0;

  for (const raw of usernames) {
    const identifier = String(raw ?? '').trim().replace(/^@/, '');
    if (!identifier) {
      skipped += 1;
      continue;
    }
    const exists =
      store.sources.some((s) => s.type === 'telegram' && s.identifier === identifier) ||
      created.some((s) => s.identifier === identifier);
    if (exists) {
      skipped += 1;
      continue;
    }
    const row = {
      active: true,
      lastCheckedAt: null,
      lastItemId: null,
      type: 'telegram',
      identifier,
      id: genId('source'),
      createdAt: new Date().toISOString(),
    };
    created.push(row);
    store.sources.push(row);
  }

  if (created.length) writeStore(store);
  return { created, skipped };
}

/** @param {string} id @param {Record<string, unknown>} partial */
export function updateSource(id, partial) {
  const store = readStore();
  const idx = store.sources.findIndex((s) => s.id === id);
  if (idx === -1) {
    const err = new Error('Source not found');
    err.status = 404;
    throw err;
  }
  const updated = { ...store.sources[idx], ...partial, id };
  store.sources[idx] = updated;
  writeStore(store);
  return updated;
}

/** @param {string} id */
export function deleteSource(id) {
  const store = readStore();
  const next = store.sources.filter((s) => s.id !== id);
  if (next.length === store.sources.length) {
    const err = new Error('Source not found');
    err.status = 404;
    throw err;
  }
  store.sources = next;
  writeStore(store);
  return { id };
}

// ——— Keywords ———

/** @param {{ active?: boolean }} [opts] */
export function listKeywords(opts = {}) {
  const { keywords } = readStore();
  return typeof opts.active === 'boolean' ? keywords.filter((k) => Boolean(k.active) === opts.active) : keywords;
}

export function listActiveKeywords() {
  return listKeywords({ active: true });
}

/** @param {Record<string, unknown>} keyword */
export function createKeyword(keyword) {
  const store = readStore();
  const row = {
    active: true,
    ...keyword,
    id: keyword.id ?? genId('keyword'),
    createdAt: keyword.createdAt ?? new Date().toISOString(),
  };
  if (store.keywords.some((k) => k.id === row.id)) {
    const err = new Error('Keyword with this id already exists');
    err.status = 409;
    throw err;
  }
  store.keywords.push(row);
  writeStore(store);
  return row;
}

/** @param {string} id @param {Record<string, unknown>} partial */
export function updateKeyword(id, partial) {
  const store = readStore();
  const idx = store.keywords.findIndex((k) => k.id === id);
  if (idx === -1) {
    const err = new Error('Keyword not found');
    err.status = 404;
    throw err;
  }
  const updated = { ...store.keywords[idx], ...partial, id };
  store.keywords[idx] = updated;
  writeStore(store);
  return updated;
}

/** @param {string} id */
export function deleteKeyword(id) {
  const store = readStore();
  const next = store.keywords.filter((k) => k.id !== id);
  if (next.length === store.keywords.length) {
    const err = new Error('Keyword not found');
    err.status = 404;
    throw err;
  }
  store.keywords = next;
  writeStore(store);
  return { id };
}

// ——— Signals ———

/**
 * @typedef {{
 *   id: string,
 *   channel: string,
 *   telegram_message_id?: number,
 *   source_url?: string,
 *   text?: string,
 *   date?: string | null,
 *   mediaUrl?: string | null,
 *   views?: number | null,
 *   matchedKeywords?: string[],
 *   aiReason?: string,
 *   status: 'new' | 'replied' | 'irrelevant' | 'archived',
 *   leadId?: string,
 *   foundAt: string,
 *   createdAt: string,
 *   // ── strategy fields (server/score-signal.mjs) — replaces the old
 *   // binary aiIntent 'yes'|'no'|'unclear' with a 0-100 numeric score ──
 *   aiAnalysis?: {
 *     isRequest: boolean,
 *     solutionType: string | null,
 *     hasNiche: boolean,
 *     authorType: 'owner' | 'manager' | 'employee' | 'unknown',
 *     isVacancy: boolean,
 *     isCompetitorAd: boolean,
 *     isStudentProject: boolean,
 *     reason: string,
 *   },
 *   signal_score?: number,
 *   urgency?: 'high' | 'medium' | 'low',
 *   category?: 'A' | 'B' | 'C' | 'D',
 *   breakdown?: { criterion: string, points: number, matched: boolean }[],
 *   evidence?: string,
 *   recommended_action?: string,
 *   author_name?: string | null,
 *   source_name?: string,
 *   notifiedAt?: string,
 *   repliedAt?: string,
 * }} RadarSignal
 */

/** @param {string} channel @param {number | string | undefined} telegramMessageId */
export function isDuplicateSignal(channel, telegramMessageId) {
  if (telegramMessageId == null) return false;
  const { signals } = readStore();
  return signals.some((s) => s.channel === channel && s.telegram_message_id === telegramMessageId);
}

/** Non-Telegram sources (Avito/VC.ru/Habr) have no message id — a listing
 * or article URL is the natural dedup key instead.
 * @param {string} sourceUrl */
export function isDuplicateSignalByUrl(sourceUrl) {
  if (!sourceUrl) return false;
  const { signals } = readStore();
  return signals.some((s) => s.source_url === sourceUrl);
}

/** @param {{ channel?: string, status?: string }} [opts] */
export function listSignals(opts = {}) {
  const { signals } = readStore();
  let filtered = signals;
  if (opts.channel) filtered = filtered.filter((s) => s.channel === opts.channel);
  if (opts.status) filtered = filtered.filter((s) => s.status === opts.status);
  return filtered.sort((a, b) => String(b.foundAt ?? '').localeCompare(String(a.foundAt ?? '')));
}

/** @param {string} id */
export function getSignal(id) {
  return readStore().signals.find((s) => s.id === id) ?? null;
}

/** @param {string} id @param {Record<string, unknown>} partial */
export function updateSignal(id, partial) {
  const store = readStore();
  const idx = store.signals.findIndex((s) => s.id === id);
  if (idx === -1) {
    const err = new Error('Signal not found');
    err.status = 404;
    throw err;
  }
  const updated = { ...store.signals[idx], ...partial, id };
  store.signals[idx] = updated;
  writeStore(store);
  return updated;
}

/**
 * @param {Record<string, unknown>[]} incoming
 * @returns {{ created: Record<string, unknown>[], skipped: number }}
 */
export function createSignals(incoming) {
  const store = readStore();
  /** @type {Record<string, unknown>[]} */
  const created = [];
  let skipped = 0;

  for (const signal of incoming) {
    const row = { ...signal };
    const dedupeByUrl = row.telegram_message_id == null;
    if (dedupeByUrl && !row.source_url) {
      skipped += 1;
      continue;
    }

    const isDup = dedupeByUrl
      ? store.signals.some((s) => s.source_url === row.source_url) || created.some((s) => s.source_url === row.source_url)
      : store.signals.some((s) => s.channel === row.channel && s.telegram_message_id === row.telegram_message_id) ||
        created.some((s) => s.channel === row.channel && s.telegram_message_id === row.telegram_message_id);
    if (isDup) {
      skipped += 1;
      continue;
    }
    row.id = row.id ?? genId('signal');
    row.createdAt = row.createdAt ?? new Date().toISOString();
    created.push(row);
    store.signals.push(row);
  }

  if (created.length) writeStore(store);
  return { created, skipped };
}
