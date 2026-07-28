import { randomUUID } from 'node:crypto';

// Same in-memory + TTL pattern as run-store.mjs (the agent chat's job-plan
// runs) — a dedicated store because the cartographer's run shape (stage,
// found, enriched, campaignId) doesn't fit run-store.mjs's jobs/executed
// fields cleanly.
/** @type {Map<string, Record<string, unknown>>} */
const runs = new Map();
const TTL_MS = 2 * 60 * 60 * 1000;

/** @param {{ campaignId: string, niche: string, region: string }} meta */
export function createCartographerRun(meta) {
  const id = randomUUID();
  runs.set(id, {
    id,
    status: 'running', // running | completed | failed
    stage: 'search', // search | extract | enrich | score | done
    found: 0,
    enriched: 0,
    campaignId: meta.campaignId,
    niche: meta.niche,
    region: meta.region,
    error: null,
    startedAt: Date.now(),
  });
  return id;
}

/** @param {string} id @param {Record<string, unknown>} patch */
export function patchCartographerRun(id, patch) {
  const run = runs.get(id);
  if (run) Object.assign(run, patch);
}

/** @param {string} id */
export function getCartographerRun(id) {
  const run = runs.get(id);
  if (!run) return null;
  if (Date.now() - run.startedAt > TTL_MS) {
    runs.delete(id);
    return null;
  }
  return run;
}
