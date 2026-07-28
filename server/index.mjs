import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import { loadEnvFile } from './load-env.mjs';
import { loadConfig } from './config.mjs';
import { createParserClient } from './parser.mjs';
import { createOpenRouterClient } from './openrouter.mjs';
import { executeJobPlan } from './maps-pipeline.mjs';
import { inferNicheFromQuery } from './agent-prompt.mjs';
import { validateOrgsWithAgent } from './validate-orgs.mjs';
import { createRun, getRun, patchRun } from './run-store.mjs';
import { runRadarCheck } from './jobs/radar-check.mjs';
import { enrichCompany } from './enrich-company.mjs';
import { scoreCompany } from './score-company.mjs';
import { createCartographerRun, getCartographerRun } from './cartographer-store.mjs';
import { runCartographer } from './jobs/cartographer-run.mjs';
import {
  listCompanies,
  getCompany,
  createCompany,
  createCompanies,
  updateCompany,
  deleteCompany,
} from './companies-db.mjs';
import {
  listLeads,
  getLead,
  createLead,
  createLeads,
  updateLead,
  deleteLead,
} from './leads-db.mjs';
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  createCampaigns,
  updateCampaign,
  deleteCampaign,
} from './campaigns-db.mjs';
import {
  listSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
} from './agent-sessions-db.mjs';
import {
  listChannels,
  createChannel,
  createChannels,
  updateChannel as updateRadarChannel,
  deleteChannel,
  listKeywords,
  createKeyword,
  deleteKeyword,
  listSignals,
  getSignal,
  updateSignal,
} from './radar-db.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/** @param {import('node:http').IncomingMessage} req */
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  return JSON.parse(text);
}

/** @param {import('node:http').ServerResponse} res */
function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

/** @param {import('node:http').ServerResponse} res */
function sendError(res, err, fallback = 500) {
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : fallback;
  sendJson(res, status, {
    success: false,
    error: err?.message ?? 'Internal error',
  });
}

function serveStatic(res, filePath) {
  if (!existsSync(filePath)) return false;
  const ext = extname(filePath);
  const type = MIME[ext] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  res.end(readFileSync(filePath));
  return true;
}

/**
 * scoreCompany() returns { score, breakdown } per its own contract; the
 * Company record (src/data/mock.ts) stores the same data under
 * `score_breakdown` — this is the one place that translates between them.
 * @param {ReturnType<typeof scoreCompany>} result
 */
function scoreFields(result) {
  return { score: result.score, score_breakdown: result.breakdown };
}

/** @param {Record<string, unknown>} company */
function withScore(company) {
  return { ...company, ...scoreFields(scoreCompany(company)) };
}

function configStatus(config) {
  return {
    parserKey: Boolean(config.neekloApiKey),
    openrouterKey: Boolean(config.openrouterApiKey),
    model: config.openrouterModel,
    parserBase: config.neekloApiBase,
  };
}

const RADAR_CRON_EXPRESSION = '*/15 * * * *';
const RADAR_INTERVAL_MS = 15 * 60 * 1000;
// In-memory only — deliberately not persisted, mirrors run-store.mjs's approach
// for the maps job-plan runs. nextRunAt is an approximation (lastRun + 15min),
// not the exact cron wall-clock boundary '*/15 * * * *' actually fires on.
const radarState = { lastRunAt: null, nextRunAt: null, running: false };

/** @param {{ manual?: boolean }} [opts] */
async function runRadarCheckGuarded(opts = {}) {
  if (radarState.running) {
    console.log('[radar] skip — previous run still in progress');
    return;
  }
  radarState.running = true;
  try {
    await runRadarCheck(opts);
  } catch (err) {
    console.error('[radar] run failed:', err instanceof Error ? err.message : err);
  } finally {
    radarState.running = false;
    radarState.lastRunAt = new Date().toISOString();
    radarState.nextRunAt = new Date(Date.now() + RADAR_INTERVAL_MS).toISOString();
  }
}

function startJobPlanAsync(parser, jobs, opts) {
  const runId = createRun({
    jobs,
    userText: opts.userText,
    niche: opts.niche,
  });

  executeJobPlan(parser, jobs, {
    userText: opts.userText,
    autoMapsPipeline: opts.autoMapsPipeline !== false,
    niche: opts.niche,
    onProgress: ({ executed, currentLabel, jobsDone }) => {
      patchRun(runId, {
        executed,
        jobsDone,
        currentLabel,
        jobsTotal: Math.max(jobs.length, jobsDone + (currentLabel ? 1 : 0)),
      });
    },
  })
    .then((executed) => {
      const allFailed = executed.length > 0 && executed.every((e) => e.status === 'failed');
      patchRun(runId, {
        status: allFailed ? 'failed' : 'completed',
        executed,
        jobsDone: executed.length,
        currentLabel: null,
        error: allFailed ? `Все задачи провалились: ${executed[0]?.error ?? 'unknown'}` : null,
      });
    })
    .catch((err) => {
      patchRun(runId, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Job plan failed',
        currentLabel: null,
      });
    });

  return runId;
}

async function main() {
  loadEnvFile();
  const config = loadConfig();
  const openrouter = createOpenRouterClient(config);
  const parser = createParserClient(config, openrouter);

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    let path = url.pathname;
    if (path.startsWith('/osnee/')) path = path.slice('/osnee'.length);
    else if (path === '/osnee') path = '/';

    try {
      // ——— API ———
      if (path === '/api/agent/config' && req.method === 'GET') {
        sendJson(res, 200, { success: true, config: configStatus(config) });
        return;
      }

      if (path === '/api/agent/health' && req.method === 'GET') {
        const health = await parser.health();
        sendJson(res, 200, { success: true, health });
        return;
      }

      if (path === '/api/radar/status' && req.method === 'GET') {
        sendJson(res, 200, { success: true, ...radarState });
        return;
      }

      if (path === '/api/radar/check-now' && req.method === 'POST') {
        if (radarState.running) {
          sendJson(res, 200, { success: true, started: false, reason: 'already running' });
          return;
        }
        // Fire-and-forget — a real run (Telegram fetch + classify per channel)
        // can take minutes; the client polls /api/radar/status for `running`
        // and refetches signals once it flips back to false.
        runRadarCheckGuarded({ manual: true }).catch(console.error);
        sendJson(res, 202, { success: true, started: true });
        return;
      }

      // ——— Radar: signals ———
      if (path === '/api/radar/signals' && req.method === 'GET') {
        const allSignals = listSignals({
          channel: url.searchParams.get('channel') ?? undefined,
          status: url.searchParams.get('status') ?? undefined,
        });
        const limitParam = Number(url.searchParams.get('limit'));
        const signals = Number.isInteger(limitParam) && limitParam > 0 ? allSignals.slice(0, limitParam) : allSignals;
        sendJson(res, 200, { success: true, signals, total: allSignals.length });
        return;
      }

      const radarSignalToLeadMatch = path.match(/^\/api\/radar\/signals\/([^/]+)\/to-lead$/);
      if (radarSignalToLeadMatch && req.method === 'POST') {
        const signal = getSignal(decodeURIComponent(radarSignalToLeadMatch[1]));
        if (!signal) {
          sendJson(res, 404, { success: false, error: 'Signal not found' });
          return;
        }
        if (signal.leadId) {
          sendJson(res, 409, { success: false, error: 'Signal already converted to a lead', leadId: signal.leadId });
          return;
        }
        const lead = createLead({
          name: `Telegram-сигнал: @${signal.channel}`,
          company: `@${signal.channel}`,
          email: '',
          phone: '',
          status: 'new',
          priority: 'medium',
          value: 0,
          assignedTo: '',
          tags: Array.isArray(signal.matchedKeywords) ? signal.matchedKeywords : [],
          avatar: '',
        });
        updateSignal(signal.id, { leadId: lead.id });
        sendJson(res, 201, { success: true, lead });
        return;
      }

      const radarSignalMatch = path.match(/^\/api\/radar\/signals\/([^/]+)$/);
      if (radarSignalMatch && req.method === 'PATCH') {
        const body = await readJsonBody(req);
        const signal = updateSignal(decodeURIComponent(radarSignalMatch[1]), body);
        sendJson(res, 200, { success: true, signal });
        return;
      }

      // ——— Radar: channels ———
      if (path === '/api/radar/channels' && req.method === 'GET') {
        const channels = listChannels();
        sendJson(res, 200, { success: true, channels, total: channels.length });
        return;
      }

      if (path === '/api/radar/channels/bulk' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const lines = typeof body.usernames === 'string' ? body.usernames.split('\n') : body.usernames;
        const { created, skipped } = createChannels(Array.isArray(lines) ? lines : []);
        sendJson(res, 201, { success: true, created, skipped, total: created.length });
        return;
      }

      if (path === '/api/radar/channels' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const channel = createChannel(body);
        sendJson(res, 201, { success: true, channel });
        return;
      }

      const radarChannelMatch = path.match(/^\/api\/radar\/channels\/([^/]+)$/);
      if (radarChannelMatch) {
        const channelId = decodeURIComponent(radarChannelMatch[1]);

        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          const channel = updateRadarChannel(channelId, body);
          sendJson(res, 200, { success: true, channel });
          return;
        }

        if (req.method === 'DELETE') {
          const result = deleteChannel(channelId);
          sendJson(res, 200, { success: true, ...result });
          return;
        }
      }

      // ——— Radar: keywords ———
      if (path === '/api/radar/keywords' && req.method === 'GET') {
        const keywords = listKeywords();
        sendJson(res, 200, { success: true, keywords, total: keywords.length });
        return;
      }

      if (path === '/api/radar/keywords' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const keyword = createKeyword(body);
        sendJson(res, 201, { success: true, keyword });
        return;
      }

      const radarKeywordMatch = path.match(/^\/api\/radar\/keywords\/([^/]+)$/);
      if (radarKeywordMatch && req.method === 'DELETE') {
        const result = deleteKeyword(decodeURIComponent(radarKeywordMatch[1]));
        sendJson(res, 200, { success: true, ...result });
        return;
      }

      if (path === '/api/agent/sources' && req.method === 'GET') {
        const sources = await parser.sources();
        sendJson(res, 200, sources);
        return;
      }

      if (path === '/api/agent/jobs' && req.method === 'GET') {
        const jobs = await parser.listJobs();
        sendJson(res, 200, jobs);
        return;
      }

      if (path === '/api/agent/jobs' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const created = await parser.createJob(body);
        sendJson(res, 202, created);
        return;
      }

      const jobMatch = path.match(/^\/api\/agent\/jobs\/([^/]+)(\/wait|\/download)?$/);
      if (jobMatch) {
        const [, jobId, action] = jobMatch;

        if (action === '/download' && req.method === 'GET') {
          const data = await parser.downloadJob(jobId);
          sendJson(res, 200, { success: true, data });
          return;
        }

        if (action === '/wait' && req.method === 'POST') {
          const result = await parser.waitForJob(jobId);
          sendJson(res, 200, { success: true, ...result });
          return;
        }

        if (!action && req.method === 'GET') {
          const job = await parser.getJob(jobId);
          sendJson(res, 200, job);
          return;
        }
      }

      if (path === '/api/agent/run-plan' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const jobs = Array.isArray(body.jobs) ? body.jobs : [];
        const userText = String(body.userText ?? '');
        const niche = body.niche ? String(body.niche) : inferNicheFromQuery(userText);
        const useAsync = body.async !== false;

        if (useAsync) {
          const runId = startJobPlanAsync(parser, jobs, {
            userText,
            niche: niche ?? undefined,
            autoMapsPipeline: body.autoMapsPipeline !== false,
          });
          sendJson(res, 202, { success: true, runId, status: 'running', niche });
          return;
        }

        const executed = await executeJobPlan(parser, jobs, {
          userText,
          autoMapsPipeline: body.autoMapsPipeline !== false,
          niche: niche ?? undefined,
        });
        sendJson(res, 200, { success: true, executed, niche });
        return;
      }

      const runMatch = path.match(/^\/api\/agent\/run-plan\/([^/]+)$/);
      if (runMatch && req.method === 'GET') {
        const run = getRun(runMatch[1]);
        if (!run) {
          sendJson(res, 404, { success: false, error: 'Run not found' });
          return;
        }
        sendJson(res, 200, { success: true, run });
        return;
      }

      if (path === '/api/agent/validate-orgs' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const orgs = Array.isArray(body.orgs) ? body.orgs : [];
        const result = await validateOrgsWithAgent(openrouter, {
          orgs,
          userQuery: String(body.userQuery ?? ''),
          existing: Array.isArray(body.existing) ? body.existing : [],
        });
        sendJson(res, 200, { success: true, ...result });
        return;
      }

      // ——— Companies DB ———
      if (path === '/api/companies' && req.method === 'GET') {
        const companies = listCompanies({
          search: url.searchParams.get('search') ?? undefined,
          status: url.searchParams.get('status') ?? undefined,
        });
        sendJson(res, 200, { success: true, companies, total: companies.length });
        return;
      }

      if (path === '/api/companies/bulk' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const items = Array.isArray(body.companies) ? body.companies : [];
        // Scored on creation — covers every bulk company-creation path
        // (parsing pipelines included), scoring is cheap/local (no LLM).
        const { created, skipped } = createCompanies(items.map(withScore));
        sendJson(res, 201, {
          success: true,
          created,
          skipped,
          total: created.length,
        });
        return;
      }

      if (path === '/api/companies' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const company = createCompany(withScore(body));
        sendJson(res, 201, { success: true, company });
        return;
      }

      if (path === '/api/companies/enrich-batch' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const ids = (Array.isArray(body.ids) ? body.ids : []).slice(0, 20);
        const enriched = [];
        const failed = [];

        for (let i = 0; i < ids.length; i += 1) {
          const id = ids[i];
          const company = getCompany(id);
          if (!company) {
            failed.push({ id, error: 'Company not found' });
          } else {
            try {
              const enrichment = await enrichCompany(parser, openrouter, company);
              const scored = scoreFields(scoreCompany({ ...company, ...enrichment }));
              const updated = updateCompany(id, { ...enrichment, ...scored });
              enriched.push(updated);
            } catch (e) {
              failed.push({ id, error: e instanceof Error ? e.message : 'Enrichment failed' });
            }
          }
          if (i < ids.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        sendJson(res, 200, { success: true, enriched, failed });
        return;
      }

      const companyEnrichMatch = path.match(/^\/api\/companies\/([^/]+)\/enrich$/);
      if (companyEnrichMatch && req.method === 'POST') {
        const companyId = decodeURIComponent(companyEnrichMatch[1]);
        const company = getCompany(companyId);
        if (!company) {
          sendJson(res, 404, { success: false, error: 'Company not found' });
          return;
        }
        const enrichment = await enrichCompany(parser, openrouter, company);
        const scored = scoreFields(scoreCompany({ ...company, ...enrichment }));
        const updated = updateCompany(companyId, { ...enrichment, ...scored });
        sendJson(res, 200, { success: true, company: updated });
        return;
      }

      const companyScoreAllMatch = path === '/api/companies/score-all' && req.method === 'POST';
      if (companyScoreAllMatch) {
        const companies = listCompanies();
        const scored = companies.map((c) => updateCompany(c.id, scoreFields(scoreCompany(c))));
        sendJson(res, 200, { success: true, scored, total: scored.length });
        return;
      }

      const companyScoreMatch = path.match(/^\/api\/companies\/([^/]+)\/score$/);
      if (companyScoreMatch && req.method === 'POST') {
        const companyId = decodeURIComponent(companyScoreMatch[1]);
        const company = getCompany(companyId);
        if (!company) {
          sendJson(res, 404, { success: false, error: 'Company not found' });
          return;
        }
        const updated = updateCompany(companyId, scoreFields(scoreCompany(company)));
        sendJson(res, 200, { success: true, company: updated });
        return;
      }

      // ——— Cartographer (deterministic 2GIS pipeline — see server/jobs/cartographer-run.mjs) ———
      if (path === '/api/cartographer/run' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const niche = String(body?.niche ?? '').trim();
        const region = String(body?.region ?? '').trim();
        const limit = [10, 25, 50].includes(Number(body?.limit)) ? Number(body.limit) : 10;
        const enrich = Boolean(body?.enrich);

        if (!niche || !region) {
          sendJson(res, 400, { success: false, error: 'niche and region are required' });
          return;
        }

        const campaign = createCampaign({
          name: `${niche} — ${region} (2ГИС)`,
          description: `Картограф: сбор ${limit} компаний по нише «${niche}» в ${region}${enrich ? ' с обогащением и скорингом' : ''}`,
          status: 'active',
          budget: 0,
          spent: 0,
          startDate: new Date().toISOString(),
          endDate: null,
          leadsGenerated: 0,
          conversions: 0,
          channels: ['2gis'],
          niche,
          region,
        });

        const runId = createCartographerRun({ campaignId: campaign.id, niche, region });
        runCartographer(parser, openrouter, { runId, campaignId: campaign.id, niche, region, limit, enrich }).catch(
          (err) => console.error('[cartographer] run failed:', err),
        );

        sendJson(res, 202, { success: true, runId, campaignId: campaign.id });
        return;
      }

      const cartographerRunMatch = path.match(/^\/api\/cartographer\/run\/([^/]+)$/);
      if (cartographerRunMatch && req.method === 'GET') {
        const run = getCartographerRun(decodeURIComponent(cartographerRunMatch[1]));
        if (!run) {
          sendJson(res, 404, { success: false, error: 'Run not found' });
          return;
        }
        sendJson(res, 200, { success: true, ...run });
        return;
      }

      const companyMatch = path.match(/^\/api\/companies\/([^/]+)$/);
      if (companyMatch) {
        const companyId = decodeURIComponent(companyMatch[1]);

        if (req.method === 'GET') {
          const company = getCompany(companyId);
          if (!company) {
            sendJson(res, 404, { success: false, error: 'Company not found' });
            return;
          }
          sendJson(res, 200, { success: true, company });
          return;
        }

        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          const company = updateCompany(companyId, body);
          sendJson(res, 200, { success: true, company });
          return;
        }

        if (req.method === 'DELETE') {
          const result = deleteCompany(companyId);
          sendJson(res, 200, { success: true, ...result });
          return;
        }
      }

      // ——— Leads DB ———
      if (path === '/api/leads' && req.method === 'GET') {
        const leads = listLeads({
          search: url.searchParams.get('search') ?? undefined,
          status: url.searchParams.get('status') ?? undefined,
        });
        sendJson(res, 200, { success: true, leads, total: leads.length });
        return;
      }

      if (path === '/api/leads/bulk' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const items = Array.isArray(body.leads) ? body.leads : [];
        const { created, skipped } = createLeads(items);
        sendJson(res, 201, { success: true, created, skipped, total: created.length });
        return;
      }

      if (path === '/api/leads' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const lead = createLead(body);
        sendJson(res, 201, { success: true, lead });
        return;
      }

      const leadMatch = path.match(/^\/api\/leads\/([^/]+)$/);
      if (leadMatch) {
        const leadId = decodeURIComponent(leadMatch[1]);

        if (req.method === 'GET') {
          const lead = getLead(leadId);
          if (!lead) {
            sendJson(res, 404, { success: false, error: 'Lead not found' });
            return;
          }
          sendJson(res, 200, { success: true, lead });
          return;
        }

        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          const lead = updateLead(leadId, body);
          sendJson(res, 200, { success: true, lead });
          return;
        }

        if (req.method === 'DELETE') {
          const result = deleteLead(leadId);
          sendJson(res, 200, { success: true, ...result });
          return;
        }
      }

      // ——— Campaigns DB ———
      if (path === '/api/campaigns' && req.method === 'GET') {
        const campaigns = listCampaigns({
          search: url.searchParams.get('search') ?? undefined,
          status: url.searchParams.get('status') ?? undefined,
        });
        sendJson(res, 200, { success: true, campaigns, total: campaigns.length });
        return;
      }

      if (path === '/api/campaigns/bulk' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const items = Array.isArray(body.campaigns) ? body.campaigns : [];
        const { created, skipped } = createCampaigns(items);
        sendJson(res, 201, { success: true, created, skipped, total: created.length });
        return;
      }

      if (path === '/api/campaigns' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const campaign = createCampaign(body);
        sendJson(res, 201, { success: true, campaign });
        return;
      }

      const campaignMatch = path.match(/^\/api\/campaigns\/([^/]+)$/);
      if (campaignMatch) {
        const campaignId = decodeURIComponent(campaignMatch[1]);

        if (req.method === 'GET') {
          const campaign = getCampaign(campaignId);
          if (!campaign) {
            sendJson(res, 404, { success: false, error: 'Campaign not found' });
            return;
          }
          sendJson(res, 200, { success: true, campaign });
          return;
        }

        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          const campaign = updateCampaign(campaignId, body);
          sendJson(res, 200, { success: true, campaign });
          return;
        }

        if (req.method === 'DELETE') {
          const result = deleteCampaign(campaignId);
          sendJson(res, 200, { success: true, ...result });
          return;
        }
      }

      // ——— Agent chat sessions ———
      if (path === '/api/agent/sessions' && req.method === 'GET') {
        const sessions = listSessions();
        sendJson(res, 200, { success: true, sessions, total: sessions.length });
        return;
      }

      if (path === '/api/agent/sessions' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const session = createSession(body);
        sendJson(res, 201, { success: true, session });
        return;
      }

      const sessionMatch = path.match(/^\/api\/agent\/sessions\/([^/]+)$/);
      if (sessionMatch) {
        const sessionId = decodeURIComponent(sessionMatch[1]);

        if (req.method === 'GET') {
          const session = getSession(sessionId);
          if (!session) {
            sendJson(res, 404, { success: false, error: 'Session not found' });
            return;
          }
          sendJson(res, 200, { success: true, session });
          return;
        }

        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          const session = updateSession(sessionId, body);
          sendJson(res, 200, { success: true, session });
          return;
        }

        if (req.method === 'DELETE') {
          const result = deleteSession(sessionId);
          sendJson(res, 200, { success: true, ...result });
          return;
        }
      }

      if (path === '/api/agent/chat' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const autoExecute = Boolean(body.autoExecute);

        const plan = await openrouter.plan(
          messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content ?? ''),
          })),
        );

        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        const userText = String(lastUser?.content ?? '');
        const niche = plan.niche ?? inferNicheFromQuery(userText);

        /** @type {string | null} */
        let runId = null;
        if (autoExecute && plan.jobs.length > 0) {
          runId = startJobPlanAsync(parser, plan.jobs, {
            userText,
            autoMapsPipeline: true,
            niche: niche ?? undefined,
          });
        }

        sendJson(res, 200, {
          success: true,
          message: plan.message,
          jobs: plan.jobs,
          autoRun: plan.autoRun,
          niche,
          runId,
          executed: [],
          action: plan.action ?? null,
        });
        return;
      }

      // ——— Static (production) ———
      if (req.method === 'GET') {
        let staticPath = path;
        if (staticPath.startsWith('/osnee')) {
          staticPath = staticPath.slice('/osnee'.length) || '/';
        }
        if (staticPath === '/' || staticPath === '') {
          if (serveStatic(res, join(DIST_DIR, 'index.html'))) return;
        }
        const assetPath = join(DIST_DIR, staticPath.replace(/^\//, ''));
        if (serveStatic(res, assetPath)) return;
        if (serveStatic(res, join(DIST_DIR, 'index.html'))) return;
      }

      sendJson(res, 404, { success: false, error: 'Not found' });
    } catch (err) {
      console.error('[agent-api]', err);
      sendError(res, err);
    }
  });

  server.listen(config.port, () => {
    console.log(`NEEKLO Agent API → http://localhost:${config.port}`);
    console.log(`  Parser: ${config.neekloApiBase}`);
    console.log(`  Model:  ${config.openrouterModel}`);
    console.log(`  Companies DB: ${process.env.DATABASE_PATH ?? './data/companies.json'}`);
    console.log(`  Leads DB:     ${process.env.LEADS_DATABASE_PATH ?? './data/leads.json'}`);
    console.log(`  Campaigns DB: ${process.env.CAMPAIGNS_DATABASE_PATH ?? './data/campaigns.json'}`);
    console.log(`  Agent chats:  ${process.env.AGENT_SESSIONS_DATABASE_PATH ?? './data/agent-sessions.json'}`);
    console.log(`  Static: ${existsSync(DIST_DIR) ? 'dist/' : 'none (run npm run build)'}`);
    console.log(`  Radar DB: ${process.env.RADAR_DATABASE_PATH ?? './data/radar.json'} (every 15min + 30s after start)`);
  });

  cron.schedule(RADAR_CRON_EXPRESSION, () => runRadarCheckGuarded().catch(console.error));
  setTimeout(() => runRadarCheckGuarded().catch(console.error), 30_000);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
