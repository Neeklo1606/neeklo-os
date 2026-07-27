import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PATH = join(__dirname, '..', 'data', 'companies.json');

/** @type {string} */
let dbPath = process.env.DATABASE_PATH?.trim() || DEFAULT_PATH;

export function setDatabasePath(path) {
  dbPath = path;
}

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
    return Array.isArray(data.companies) ? data.companies : [];
  } catch (err) {
    console.error('[companies-db] read failed:', err);
    return [];
  }
}

/** @param {Record<string, unknown>[]} companies */
function writeAll(companies) {
  ensureDir();
  const tmp = `${dbPath}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify({ companies, updatedAt: new Date().toISOString() }, null, 2),
    'utf8',
  );
  renameSync(tmp, dbPath);
}

function normalizeKey(value) {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** @param {Record<string, unknown>[]} existing @param {Record<string, unknown>} incoming */
function isDuplicate(existing, incoming) {
  const byPhone = new Map();
  const byUrl = new Map();
  const byName = new Map();

  for (const c of existing) {
    if (c.phone) byPhone.set(normalizeKey(String(c.phone)), c);
    if (c.source_url) byUrl.set(normalizeKey(String(c.source_url)), c);
    if (c.name) byName.set(normalizeKey(String(c.name)), c);
  }

  const cardUrl = incoming.source_url;
  if (cardUrl && byUrl.has(normalizeKey(String(cardUrl)))) return 'card URL';

  const phone = incoming.phone;
  if (phone && byPhone.has(normalizeKey(String(phone)))) return 'phone';

  const name = incoming.name;
  if (name && phone && byName.has(normalizeKey(String(name)))) {
    const ex = byName.get(normalizeKey(String(name)));
    if (ex?.phone && normalizeKey(String(ex.phone)) === normalizeKey(String(phone))) {
      return 'name+phone';
    }
  }

  return null;
}

/**
 * @param {{ search?: string, status?: string }} [opts]
 */
export function listCompanies(opts = {}) {
  let companies = readAll();
  const { search, status } = opts;

  if (status) {
    companies = companies.filter((c) => c.status === status);
  }

  if (search?.trim()) {
    const q = search.trim().toLowerCase();
    companies = companies.filter((c) => {
      const hay = [
        c.name,
        c.industry,
        c.city,
        c.email,
        c.phone,
        c.website,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return companies.sort((a, b) => {
    const ta = String(a.createdAt ?? '');
    const tb = String(b.createdAt ?? '');
    return tb.localeCompare(ta);
  });
}

/** @param {string} id */
export function getCompany(id) {
  return readAll().find((c) => c.id === id) ?? null;
}

/** @param {Record<string, unknown>} company */
export function createCompany(company) {
  const all = readAll();
  if (!company.id) {
    company.id = `co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  if (all.some((c) => c.id === company.id)) {
    const err = new Error('Company with this id already exists');
    err.status = 409;
    throw err;
  }
  const dup = isDuplicate(all, company);
  if (dup) {
    const err = new Error(`Duplicate by ${dup}`);
    err.status = 409;
    throw err;
  }
  if (!company.createdAt) company.createdAt = new Date().toISOString();
  all.push(company);
  writeAll(all);
  return company;
}

/**
 * @param {Record<string, unknown>[]} incoming
 * @returns {{ created: Record<string, unknown>[], skipped: number }}
 */
export function createCompanies(incoming) {
  const all = readAll();
  /** @type {Record<string, unknown>[]} */
  const created = [];
  let skipped = 0;

  for (const company of incoming) {
    const row = { ...company };
    if (!row.id) row.id = `co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!row.createdAt) row.createdAt = new Date().toISOString();

    if (all.some((c) => c.id === row.id) || created.some((c) => c.id === row.id)) {
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
export function updateCompany(id, partial) {
  const all = readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) {
    const err = new Error('Company not found');
    err.status = 404;
    throw err;
  }
  const updated = { ...all[idx], ...partial, id };
  all[idx] = updated;
  writeAll(all);
  return updated;
}

/** @param {string} id */
export function deleteCompany(id) {
  const all = readAll();
  const next = all.filter((c) => c.id !== id);
  if (next.length === all.length) {
    const err = new Error('Company not found');
    err.status = 404;
    throw err;
  }
  writeAll(next);
  return { id };
}

export function companiesCount() {
  return readAll().length;
}
