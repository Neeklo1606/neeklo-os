import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Digital Audit — one record per company, keyed by company_id (not a
 * generic id list like companies/signals, since re-auditing a company
 * updates its existing row rather than appending a new one).
 * @typedef {{
 *   id: string,
 *   company_id: string,
 *   website_exists?: boolean,
 *   https?: boolean,
 *   mobile_status?: string,
 *   site_speed_note?: string,
 *   form_exists?: boolean,
 *   booking_exists?: boolean,
 *   catalog_exists?: boolean,
 *   personal_account_exists?: boolean,
 *   dealer_section_exists?: boolean,
 *   messenger_links?: string[],
 *   analytics_detected?: boolean,
 *   crm_widget_detected?: boolean,
 *   key_conversion_path?: string,
 *   observed_gap?: string,
 *   proof_url?: string,
 *   audit_confidence?: 'high' | 'medium' | 'low',
 *   human_review_required?: boolean,
 *   growth_signals?: string[],
 *   audited_at: string,
 * }} DigitalAudit
 */

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PATH = join(__dirname, '..', 'data', 'digital-audit.json');

/** @type {string} */
let dbPath = process.env.AUDIT_DATABASE_PATH?.trim() || DEFAULT_PATH;

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
    return Array.isArray(data.audits) ? data.audits : [];
  } catch (err) {
    console.error('[audit-db] read failed:', err);
    return [];
  }
}

/** @param {Record<string, unknown>[]} audits */
function writeAll(audits) {
  ensureDir();
  const tmp = `${dbPath}.tmp`;
  writeFileSync(tmp, JSON.stringify({ audits, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  renameSync(tmp, dbPath);
}

function genId() {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @param {{ humanReviewRequired?: boolean }} [opts] */
export function listAudits(opts = {}) {
  let audits = readAll();
  if (typeof opts.humanReviewRequired === 'boolean') {
    audits = audits.filter((a) => Boolean(a.human_review_required) === opts.humanReviewRequired);
  }
  return audits.sort((a, b) => String(b.audited_at ?? '').localeCompare(String(a.audited_at ?? '')));
}

/** @param {string} companyId */
export function getAudit(companyId) {
  return readAll().find((a) => a.company_id === companyId) ?? null;
}

/**
 * One audit per company: updates the existing row for companyId if one
 * exists, otherwise creates it.
 * @param {string} companyId @param {Record<string, unknown>} partial
 */
export function upsertAudit(companyId, partial) {
  const all = readAll();
  const idx = all.findIndex((a) => a.company_id === companyId);
  const audited_at = partial.audited_at ?? new Date().toISOString();

  if (idx === -1) {
    const row = { ...partial, id: genId(), company_id: companyId, audited_at };
    all.push(row);
    writeAll(all);
    return row;
  }

  const updated = { ...all[idx], ...partial, id: all[idx].id, company_id: companyId, audited_at };
  all[idx] = updated;
  writeAll(all);
  return updated;
}

/** @param {string} companyId */
export function deleteAudit(companyId) {
  const all = readAll();
  const next = all.filter((a) => a.company_id !== companyId);
  if (next.length === all.length) {
    const err = new Error('Audit not found');
    err.status = 404;
    throw err;
  }
  writeAll(next);
  return { company_id: companyId };
}
