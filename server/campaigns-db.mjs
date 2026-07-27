import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PATH = join(__dirname, '..', 'data', 'campaigns.json');

/** @type {string} */
let dbPath = process.env.CAMPAIGNS_DATABASE_PATH?.trim() || DEFAULT_PATH;

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
    return Array.isArray(data.campaigns) ? data.campaigns : [];
  } catch (err) {
    console.error('[campaigns-db] read failed:', err);
    return [];
  }
}

/** @param {Record<string, unknown>[]} campaigns */
function writeAll(campaigns) {
  ensureDir();
  const tmp = `${dbPath}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify({ campaigns, updatedAt: new Date().toISOString() }, null, 2),
    'utf8',
  );
  renameSync(tmp, dbPath);
}

/**
 * @param {{ search?: string, status?: string }} [opts]
 */
export function listCampaigns(opts = {}) {
  let campaigns = readAll();
  const { search, status } = opts;

  if (status) campaigns = campaigns.filter((c) => c.status === status);

  if (search?.trim()) {
    const q = search.trim().toLowerCase();
    campaigns = campaigns.filter((c) => {
      const hay = [c.name, c.description, ...(Array.isArray(c.channels) ? c.channels : [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return campaigns.sort((a, b) => {
    const ta = String(a.startDate ?? '');
    const tb = String(b.startDate ?? '');
    return tb.localeCompare(ta);
  });
}

/** @param {string} id */
export function getCampaign(id) {
  return readAll().find((c) => c.id === id) ?? null;
}

/** @param {Record<string, unknown>} campaign */
export function createCampaign(campaign) {
  const all = readAll();
  if (!campaign.id) campaign.id = `camp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (all.some((c) => c.id === campaign.id)) {
    const err = new Error('Campaign with this id already exists');
    err.status = 409;
    throw err;
  }
  all.push(campaign);
  writeAll(all);
  return campaign;
}

/**
 * @param {Record<string, unknown>[]} incoming
 * @returns {{ created: Record<string, unknown>[], skipped: number }}
 */
export function createCampaigns(incoming) {
  const all = readAll();
  /** @type {Record<string, unknown>[]} */
  const created = [];
  let skipped = 0;

  for (const campaign of incoming) {
    const row = { ...campaign };
    if (!row.id) row.id = `camp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (all.some((c) => c.id === row.id) || created.some((c) => c.id === row.id)) {
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
export function updateCampaign(id, partial) {
  const all = readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) {
    const err = new Error('Campaign not found');
    err.status = 404;
    throw err;
  }
  const updated = { ...all[idx], ...partial, id };
  all[idx] = updated;
  writeAll(all);
  return updated;
}

/** @param {string} id */
export function deleteCampaign(id) {
  const all = readAll();
  const next = all.filter((c) => c.id !== id);
  if (next.length === all.length) {
    const err = new Error('Campaign not found');
    err.status = 404;
    throw err;
  }
  writeAll(next);
  return { id };
}
