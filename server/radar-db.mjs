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

/** @returns {{ channels: Record<string, unknown>[], keywords: Record<string, unknown>[], signals: Record<string, unknown>[] }} */
function readStore() {
  ensureDir();
  if (!existsSync(dbPath)) return { channels: [], keywords: [], signals: [] };
  try {
    const raw = readFileSync(dbPath, 'utf8');
    const data = JSON.parse(raw);
    return {
      channels: Array.isArray(data.channels) ? data.channels : [],
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      signals: Array.isArray(data.signals) ? data.signals : [],
    };
  } catch (err) {
    console.error('[radar-db] read failed:', err);
    return { channels: [], keywords: [], signals: [] };
  }
}

/** @param {{ channels: Record<string, unknown>[], keywords: Record<string, unknown>[], signals: Record<string, unknown>[] }} store */
function writeStore(store) {
  ensureDir();
  const tmp = `${dbPath}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  renameSync(tmp, dbPath);
}

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ——— Channels ———

/** @param {{ active?: boolean }} [opts] */
export function listChannels(opts = {}) {
  const { channels } = readStore();
  return typeof opts.active === 'boolean' ? channels.filter((c) => Boolean(c.active) === opts.active) : channels;
}

export function listActiveChannels() {
  return listChannels({ active: true });
}

/** @param {string} id */
export function getChannel(id) {
  return readStore().channels.find((c) => c.id === id) ?? null;
}

/** @param {Record<string, unknown>} channel */
export function createChannel(channel) {
  const store = readStore();
  const row = {
    active: true,
    lastMessageId: null,
    lastCheckedAt: null,
    ...channel,
    id: channel.id ?? genId('channel'),
    createdAt: channel.createdAt ?? new Date().toISOString(),
  };
  if (store.channels.some((c) => c.id === row.id)) {
    const err = new Error('Channel with this id already exists');
    err.status = 409;
    throw err;
  }
  store.channels.push(row);
  writeStore(store);
  return row;
}

/**
 * @param {string[]} usernames
 * @returns {{ created: Record<string, unknown>[], skipped: number }}
 */
export function createChannels(usernames) {
  const store = readStore();
  /** @type {Record<string, unknown>[]} */
  const created = [];
  let skipped = 0;

  for (const raw of usernames) {
    const username = String(raw ?? '').trim().replace(/^@/, '');
    if (!username) {
      skipped += 1;
      continue;
    }
    const exists =
      store.channels.some((c) => c.username === username) || created.some((c) => c.username === username);
    if (exists) {
      skipped += 1;
      continue;
    }
    const row = {
      active: true,
      lastMessageId: null,
      lastCheckedAt: null,
      username,
      id: genId('channel'),
      createdAt: new Date().toISOString(),
    };
    created.push(row);
    store.channels.push(row);
  }

  if (created.length) writeStore(store);
  return { created, skipped };
}

/** @param {string} id @param {Record<string, unknown>} partial */
export function updateChannel(id, partial) {
  const store = readStore();
  const idx = store.channels.findIndex((c) => c.id === id);
  if (idx === -1) {
    const err = new Error('Channel not found');
    err.status = 404;
    throw err;
  }
  const updated = { ...store.channels[idx], ...partial, id };
  store.channels[idx] = updated;
  writeStore(store);
  return updated;
}

/** @param {string} id */
export function deleteChannel(id) {
  const store = readStore();
  const next = store.channels.filter((c) => c.id !== id);
  if (next.length === store.channels.length) {
    const err = new Error('Channel not found');
    err.status = 404;
    throw err;
  }
  store.channels = next;
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

/** @param {string} channel @param {number | string | undefined} telegramMessageId */
export function isDuplicateSignal(channel, telegramMessageId) {
  if (telegramMessageId == null) return false;
  const { signals } = readStore();
  return signals.some((s) => s.channel === channel && s.telegram_message_id === telegramMessageId);
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
    if (row.telegram_message_id == null) {
      skipped += 1;
      continue;
    }
    const isDup =
      store.signals.some((s) => s.channel === row.channel && s.telegram_message_id === row.telegram_message_id) ||
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
