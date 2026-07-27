import { randomUUID } from 'node:crypto';

/** @type {Map<string, Record<string, unknown>>} */
const runs = new Map();
const TTL_MS = 2 * 60 * 60 * 1000;

/** @param {{ jobs: unknown[], userText: string, niche?: string }} meta */
export function createRun(meta) {
  const id = randomUUID();
  runs.set(id, {
    id,
    status: 'running',
    jobsTotal: meta.jobs.length,
    jobsDone: 0,
    executed: [],
    niche: meta.niche ?? null,
    userText: meta.userText,
    error: null,
    currentLabel: null,
    startedAt: Date.now(),
  });
  return id;
}

/** @param {string} id @param {Record<string, unknown>} patch */
export function patchRun(id, patch) {
  const run = runs.get(id);
  if (run) Object.assign(run, patch);
}

/** @param {string} id */
export function getRun(id) {
  const run = runs.get(id);
  if (!run) return null;
  if (Date.now() - run.startedAt > TTL_MS) {
    runs.delete(id);
    return null;
  }
  return run;
}
