import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PATH = join(__dirname, '..', 'data', 'leads.json');

/** @type {string} */
let dbPath = process.env.LEADS_DATABASE_PATH?.trim() || DEFAULT_PATH;

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
    return Array.isArray(data.leads) ? data.leads : [];
  } catch (err) {
    console.error('[leads-db] read failed:', err);
    return [];
  }
}

/** @param {Record<string, unknown>[]} leads */
function writeAll(leads) {
  ensureDir();
  const tmp = `${dbPath}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify({ leads, updatedAt: new Date().toISOString() }, null, 2),
    'utf8',
  );
  renameSync(tmp, dbPath);
}

function normalizeKey(value) {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** @param {Record<string, unknown>[]} existing @param {Record<string, unknown>} incoming */
function isDuplicate(existing, incoming) {
  const byEmail = new Map();
  const byPhone = new Map();

  for (const l of existing) {
    if (l.email) byEmail.set(normalizeKey(String(l.email)), l);
    if (l.phone) byPhone.set(normalizeKey(String(l.phone)), l);
  }

  const email = incoming.email;
  if (email && byEmail.has(normalizeKey(String(email)))) return 'email';

  const phone = incoming.phone;
  if (phone && byPhone.has(normalizeKey(String(phone)))) return 'phone';

  return null;
}

/**
 * @param {{ search?: string, status?: string }} [opts]
 */
export function listLeads(opts = {}) {
  let leads = readAll();
  const { search, status } = opts;

  if (status) leads = leads.filter((l) => l.status === status);

  if (search?.trim()) {
    const q = search.trim().toLowerCase();
    leads = leads.filter((l) => {
      const hay = [l.name, l.company, l.email, l.phone, l.assignedTo]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return leads.sort((a, b) => {
    const ta = String(a.createdAt ?? '');
    const tb = String(b.createdAt ?? '');
    return tb.localeCompare(ta);
  });
}

/** @param {string} id */
export function getLead(id) {
  return readAll().find((l) => l.id === id) ?? null;
}

/** @param {Record<string, unknown>} lead */
export function createLead(lead) {
  const all = readAll();
  if (!lead.id) lead.id = `lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (all.some((l) => l.id === lead.id)) {
    const err = new Error('Lead with this id already exists');
    err.status = 409;
    throw err;
  }
  const dup = isDuplicate(all, lead);
  if (dup) {
    const err = new Error(`Duplicate by ${dup}`);
    err.status = 409;
    throw err;
  }
  if (!lead.createdAt) lead.createdAt = new Date().toISOString();
  all.push(lead);
  writeAll(all);
  return lead;
}

/**
 * @param {Record<string, unknown>[]} incoming
 * @returns {{ created: Record<string, unknown>[], skipped: number }}
 */
export function createLeads(incoming) {
  const all = readAll();
  /** @type {Record<string, unknown>[]} */
  const created = [];
  let skipped = 0;

  for (const lead of incoming) {
    const row = { ...lead };
    if (!row.id) row.id = `lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!row.createdAt) row.createdAt = new Date().toISOString();

    if (all.some((l) => l.id === row.id) || created.some((l) => l.id === row.id)) {
      skipped += 1;
      continue;
    }
    if (isDuplicate([...all, ...created], row)) {
      skipped += 1;
      continue;
    }

    created.push(row);
    all.push(row);
  }

  if (created.length) writeAll(all);
  return { created, skipped };
}

/** @param {string} id @param {Record<string, unknown>} partial */
export function updateLead(id, partial) {
  const all = readAll();
  const idx = all.findIndex((l) => l.id === id);
  if (idx === -1) {
    const err = new Error('Lead not found');
    err.status = 404;
    throw err;
  }
  const updated = { ...all[idx], ...partial, id };
  all[idx] = updated;
  writeAll(all);
  return updated;
}

/** @param {string} id */
export function deleteLead(id) {
  const all = readAll();
  const next = all.filter((l) => l.id !== id);
  if (next.length === all.length) {
    const err = new Error('Lead not found');
    err.status = 404;
    throw err;
  }
  writeAll(next);
  return { id };
}
