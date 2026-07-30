import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Opportunities — one row per proposed engagement with a company; a
 * company can have several over time (unlike Digital Audit's one-per-
 * company shape), so this is a plain create/update table keyed by
 * opportunity_id.
 * @typedef {{
 *   opportunity_id: string,
 *   company_id: string,
 *   product_archetype?: string,
 *   problem_hypothesis?: string,
 *   evidence_summary?: string,
 *   fit_score?: number,
 *   potential_budget_range?: string,
 *   sales_priority?: 'A' | 'B' | 'C' | 'D',
 *   recommended_offer?: string,
 *   next_step?: string,
 *   personalized_angle?: string,
 *   message_draft?: string,
 *   human_approval?: 'required' | 'approved' | 'rejected',
 *   approved_at?: string,
 *   rejected_at?: string,
 *   outcome?: string,
 *   created_at: string,
 * }} Opportunity
 */

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PATH = join(__dirname, '..', 'data', 'opportunities.json');

/** @type {string} */
let dbPath = process.env.OPPORTUNITIES_DATABASE_PATH?.trim() || DEFAULT_PATH;

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
    return Array.isArray(data.opportunities) ? data.opportunities : [];
  } catch (err) {
    console.error('[opportunities-db] read failed:', err);
    return [];
  }
}

/** @param {Record<string, unknown>[]} opportunities */
function writeAll(opportunities) {
  ensureDir();
  const tmp = `${dbPath}.tmp`;
  writeFileSync(tmp, JSON.stringify({ opportunities, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  renameSync(tmp, dbPath);
}

function genId() {
  return `opp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @param {{ companyId?: string, salesPriority?: string, humanApproval?: string, outcome?: string }} [filters] */
export function listOpportunities(filters = {}) {
  let opportunities = readAll();
  if (filters.companyId) opportunities = opportunities.filter((o) => o.company_id === filters.companyId);
  if (filters.salesPriority) opportunities = opportunities.filter((o) => o.sales_priority === filters.salesPriority);
  if (filters.humanApproval) opportunities = opportunities.filter((o) => o.human_approval === filters.humanApproval);
  if (filters.outcome) opportunities = opportunities.filter((o) => o.outcome === filters.outcome);
  return opportunities.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
}

/** @param {string} id */
export function getOpportunity(id) {
  return readAll().find((o) => o.opportunity_id === id) ?? null;
}

/** @param {Record<string, unknown>} opportunity */
export function createOpportunity(opportunity) {
  const all = readAll();
  const row = {
    ...opportunity,
    opportunity_id: opportunity.opportunity_id ?? genId(),
    created_at: opportunity.created_at ?? new Date().toISOString(),
  };
  if (all.some((o) => o.opportunity_id === row.opportunity_id)) {
    const err = new Error('Opportunity with this id already exists');
    err.status = 409;
    throw err;
  }
  all.push(row);
  writeAll(all);
  return row;
}

/** @param {string} id @param {Record<string, unknown>} partial */
export function updateOpportunity(id, partial) {
  const all = readAll();
  const idx = all.findIndex((o) => o.opportunity_id === id);
  if (idx === -1) {
    const err = new Error('Opportunity not found');
    err.status = 404;
    throw err;
  }
  const updated = { ...all[idx], ...partial, opportunity_id: id };
  all[idx] = updated;
  writeAll(all);
  return updated;
}

/** @param {string} id */
export function deleteOpportunity(id) {
  const all = readAll();
  const next = all.filter((o) => o.opportunity_id !== id);
  if (next.length === all.length) {
    const err = new Error('Opportunity not found');
    err.status = 404;
    throw err;
  }
  writeAll(next);
  return { opportunity_id: id };
}
