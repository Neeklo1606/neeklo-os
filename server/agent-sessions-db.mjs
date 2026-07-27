import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PATH = join(__dirname, '..', 'data', 'agent-sessions.json');

/** @type {string} */
let dbPath = process.env.AGENT_SESSIONS_DATABASE_PATH?.trim() || DEFAULT_PATH;

function ensureDir() {
  mkdirSync(dirname(dbPath), { recursive: true });
}

/** @returns {Record<string, unknown>[]} */
function readAll() {
  ensureDir();
  if (!existsSync(dbPath)) return [];
  try {
    const raw = readFileSync(dbPath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.sessions) ? data.sessions : [];
  } catch (err) {
    console.error('[agent-sessions-db] read failed:', err);
    return [];
  }
}

/** @param {Record<string, unknown>[]} sessions */
function writeAll(sessions) {
  ensureDir();
  const tmp = `${dbPath}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify({ sessions, updatedAt: new Date().toISOString() }, null, 2),
    'utf8',
  );
  renameSync(tmp, dbPath);
}

function sessionId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleFromMessages(messages) {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser?.content) return 'Новый чат';
  const text = String(firstUser.content).trim();
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

/** @returns {Record<string, unknown>[]} */
export function listSessions() {
  return readAll()
    .map((s) => ({
      id: s.id,
      title: s.title,
      messageCount: Array.isArray(s.messages) ? s.messages.length : 0,
      orgCount: Array.isArray(s.executed) ? s.executed.length : 0,
      niche: s.niche ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/** @param {string} id */
export function getSession(id) {
  return readAll().find((s) => s.id === id) ?? null;
}

/** @param {Record<string, unknown>} [seed] */
export function createSession(seed = {}) {
  const now = new Date().toISOString();
  const messages = Array.isArray(seed.messages) ? seed.messages : [];
  const session = {
    id: seed.id ?? sessionId(),
    title: seed.title ?? titleFromMessages(messages),
    messages,
    executed: Array.isArray(seed.executed) ? seed.executed : [],
    plannedJobs: Array.isArray(seed.plannedJobs) ? seed.plannedJobs : [],
    niche: seed.niche ?? null,
    lastUserQuery: seed.lastUserQuery ?? '',
    createdAt: seed.createdAt ?? now,
    updatedAt: now,
  };
  const all = readAll();
  all.push(session);
  writeAll(all);
  return session;
}

/** @param {string} id @param {Record<string, unknown>} partial */
export function updateSession(id, partial) {
  const all = readAll();
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }

  const prev = all[idx];
  const messages = partial.messages ?? prev.messages;
  const updated = {
    ...prev,
    ...partial,
    id,
    messages,
    title:
      partial.title ??
      (Array.isArray(messages) && messages.length > 0
        ? titleFromMessages(messages)
        : prev.title),
    updatedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  writeAll(all);
  return updated;
}

/** @param {string} id */
export function deleteSession(id) {
  const all = readAll();
  const next = all.filter((s) => s.id !== id);
  if (next.length === all.length) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  writeAll(next);
  return { id };
}

/** Ensure at least one session exists */
export function ensureDefaultSession() {
  const all = readAll();
  if (all.length) return all[0];
  return createSession();
}
