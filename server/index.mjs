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
import { scoreFit } from './score-fit.mjs';
import { createCartographerRun, getCartographerRun } from './cartographer-store.mjs';
import { runCartographer } from './jobs/cartographer-run.mjs';
import { generateOpportunity } from './generate-opportunity.mjs';
import {
  buildMorningReport,
  buildEveningReport,
  buildWeeklyMetrics,
  sendMorningReport,
  sendEveningReport,
} from './jobs/daily-report.mjs';
import { VERTICALS, SECOND_PRIORITY } from './verticals.mjs';
import { notifyHotSignal } from './notify-telegram.mjs';
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
import { listAudits, getAudit, upsertAudit } from './audit-db.mjs';
import {
  listOpportunities,
  getOpportunity,
  createOpportunity,
  updateOpportunity,
} from './opportunities-db.mjs';
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
  listSources,
  createSource,
  createSourcesBulk,
  updateSource,
  deleteSource,
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

/**
 * fit_score is a separate axis from `score` (see server/score-fit.mjs's
 * own header) — stored under its own fields so recomputing one never
 * clobbers the other.
 * @param {ReturnType<typeof scoreFit>} result
 */
function fitScoreFields(result) {
  return { fit_score: result.fit_score, fit_breakdown: result.breakdown, sales_priority: result.sales_priority };
}

function configStatus(config) {
  return {
    parserKey: Boolean(config.neekloApiKey),
    openrouterKey: Boolean(config.openrouterApiKey),
    model: config.openrouterModel,
    parserBase: config.neekloApiBase,
  };
}

// Separate cron schedules per strategy doc, not one shared loop — different
// sources have very different useful-check frequencies (a Telegram channel
// posts constantly; Avito/VC.ru/Habr search results barely change hour to
// hour). All three still funnel through the same runRadarCheckGuarded, whose
// `running` flag keeps them from overlapping — the parser is one sequential
// worker (docs), so two radar checks in flight at once would just queue
// behind each other anyway.
const TELEGRAM_CRON_EXPRESSION = '*/30 * * * *'; // every 30 min
const AVITO_CRON_EXPRESSION = '0 */6 * * *'; // every 6 hours
const DAILY_CRON_EXPRESSION = '0 6 * * *'; // once/day — vc + habr
const TELEGRAM_INTERVAL_MS = 30 * 60 * 1000;

// In-memory only — deliberately not persisted, mirrors run-store.mjs's
// approach for the maps job-plan runs. nextRunAt approximates the most
// frequent schedule (Telegram, every 30min) since that's the one a human
// checking "when's the next run" cares about; it's not literally the next
// firing of whichever cron happens to be soonest.
const radarState = { lastRunAt: null, nextRunAt: null, running: false };

/** @param {{ manual?: boolean, sourceTypes?: string[] }} [opts] */
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
    radarState.nextRunAt = new Date(Date.now() + TELEGRAM_INTERVAL_MS).toISOString();
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

      // Verification route — builds a synthetic category-A signal (or one
      // overridden from the request body) and sends it through the real
      // notifyHotSignal pipeline, so you can confirm TELEGRAM_BOT_TOKEN/
      // TELEGRAM_CHAT_ID and message formatting without waiting for a real
      // hot signal. No `id`, so notifiedAt never gets persisted for it —
      // safe to call repeatedly.
      if (path === '/api/radar/test-notification' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const testSignal = {
          channel: body.channel ?? 'test_channel',
          telegram_message_id: body.telegram_message_id ?? 1,
          text: body.text ?? 'Тестовый сигнал: ищем срочно кто сделает CRM для нашего автосервиса, бюджет до 300 тысяч',
          date: body.date ?? new Date().toISOString(),
          foundAt: new Date().toISOString(),
          signal_score: body.signal_score ?? 85,
          category: 'A',
          breakdown: body.breakdown ?? [
            { criterion: 'Прямой запрос', points: 35, matched: true },
            { criterion: 'Указан бюджет', points: 15, matched: true },
          ],
          aiAnalysis: body.aiAnalysis ?? {
            isRequest: true,
            solutionType: 'crm',
            hasNiche: true,
            authorType: 'owner',
            isVacancy: false,
            isCompetitorAd: false,
            isStudentProject: false,
            reason: 'test-notification route',
          },
          author_name: body.author_name ?? null,
          source_name: body.source_name ?? 'telegram',
        };
        const sent = await notifyHotSignal(testSignal, body.company ?? null);
        sendJson(res, sent ? 200 : 502, {
          success: sent,
          message: sent
            ? 'Notification sent'
            : 'Failed to send — check TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID and server logs',
        });
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
        // Stamped on the transition so the evening report can tell "replied
        // today" from "replied at some unknown past point" — see
        // server/jobs/daily-report.mjs's buildEveningReport doc comment.
        if (body.status === 'replied' && !body.repliedAt) {
          body.repliedAt = new Date().toISOString();
        }
        const signal = updateSignal(decodeURIComponent(radarSignalMatch[1]), body);
        sendJson(res, 200, { success: true, signal });
        return;
      }

      // ——— Radar: sources (Telegram channels + Avito/VC.ru/Habr searches) ———
      if (path === '/api/radar/sources' && req.method === 'GET') {
        const sources = listSources();
        sendJson(res, 200, { success: true, sources, total: sources.length });
        return;
      }

      if (path === '/api/radar/sources/bulk' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const lines = typeof body.usernames === 'string' ? body.usernames.split('\n') : body.usernames;
        const { created, skipped } = createSourcesBulk(Array.isArray(lines) ? lines : []);
        sendJson(res, 201, { success: true, created, skipped, total: created.length });
        return;
      }

      if (path === '/api/radar/sources' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const source = createSource(body);
        sendJson(res, 201, { success: true, source });
        return;
      }

      const radarSourceMatch = path.match(/^\/api\/radar\/sources\/([^/]+)$/);
      if (radarSourceMatch) {
        const sourceId = decodeURIComponent(radarSourceMatch[1]);

        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          const source = updateSource(sourceId, body);
          sendJson(res, 200, { success: true, source });
          return;
        }

        if (req.method === 'DELETE') {
          const result = deleteSource(sourceId);
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

      if (path === '/api/companies/score-fit-all' && req.method === 'POST') {
        const companies = listCompanies();
        const scored = companies.map((c) => {
          const audit = getAudit(c.id);
          const vertical = c.vertical ? (VERTICALS[c.vertical] ?? null) : null;
          return updateCompany(c.id, fitScoreFields(scoreFit(c, audit, vertical)));
        });
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

      const companyGenerateOpportunityMatch = path.match(/^\/api\/companies\/([^/]+)\/generate-opportunity$/);
      if (companyGenerateOpportunityMatch && req.method === 'POST') {
        const companyId = decodeURIComponent(companyGenerateOpportunityMatch[1]);
        const company = getCompany(companyId);
        if (!company) {
          sendJson(res, 404, { success: false, error: 'Company not found' });
          return;
        }
        const audit = getAudit(companyId);
        const vertical = company.vertical ? (VERTICALS[company.vertical] ?? null) : null;
        const opportunity = await generateOpportunity(openrouter, company, audit, vertical);
        sendJson(res, 201, { success: true, opportunity });
        return;
      }

      // ——— Cartographer (deterministic 2GIS pipeline — see server/jobs/cartographer-run.mjs) ———
      if (path === '/api/cartographer/verticals' && req.method === 'GET') {
        sendJson(res, 200, { success: true, verticals: VERTICALS, secondPriority: SECOND_PRIORITY });
        return;
      }

      if (path === '/api/cartographer/run' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const niche = String(body?.niche ?? '').trim();
        const region = String(body?.region ?? '').trim();
        const limit = [10, 25, 50].includes(Number(body?.limit)) ? Number(body.limit) : 10;
        const enrich = Boolean(body?.enrich);
        const verticalKey = typeof body?.verticalKey === 'string' ? body.verticalKey.trim() : '';
        const vertical = verticalKey ? (VERTICALS[verticalKey] ?? null) : null;
        const exclude = {
          retailOnly: Boolean(body?.exclude?.retailOnly),
          noWebsite: Boolean(body?.exclude?.noWebsite),
          federalCorp: Boolean(body?.exclude?.federalCorp),
          microBusiness: Boolean(body?.exclude?.microBusiness),
          duplicates: Boolean(body?.exclude?.duplicates),
        };

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
        runCartographer(parser, openrouter, {
          runId,
          campaignId: campaign.id,
          niche,
          region,
          limit,
          enrich,
          verticalKey: verticalKey || undefined,
          vertical,
          exclude,
        }).catch((err) => console.error('[cartographer] run failed:', err));

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

      // ——— Digital Audit (one record per company — server/audit-db.mjs) ———
      if (path === '/api/audits' && req.method === 'GET') {
        const humanReviewParam = url.searchParams.get('humanReviewRequired');
        const audits = listAudits(
          humanReviewParam != null ? { humanReviewRequired: humanReviewParam === 'true' } : {},
        );
        sendJson(res, 200, { success: true, audits, total: audits.length });
        return;
      }

      if (path === '/api/audits' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const companyId = String(body?.company_id ?? '').trim();
        if (!companyId) {
          sendJson(res, 400, { success: false, error: 'company_id is required' });
          return;
        }
        const audit = upsertAudit(companyId, body);
        sendJson(res, 201, { success: true, audit });
        return;
      }

      const auditMatch = path.match(/^\/api\/audits\/([^/]+)$/);
      if (auditMatch && req.method === 'GET') {
        const audit = getAudit(decodeURIComponent(auditMatch[1]));
        if (!audit) {
          sendJson(res, 404, { success: false, error: 'Audit not found' });
          return;
        }
        sendJson(res, 200, { success: true, audit });
        return;
      }

      if (auditMatch && req.method === 'PUT') {
        const body = await readJsonBody(req);
        const audit = upsertAudit(decodeURIComponent(auditMatch[1]), body);
        sendJson(res, 200, { success: true, audit });
        return;
      }

      // ——— Opportunities (server/opportunities-db.mjs) ———
      if (path === '/api/opportunities/generate-batch' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const companyIds = (Array.isArray(body?.companyIds) ? body.companyIds : []).slice(0, 20);
        const generated = [];
        const failed = [];

        for (let i = 0; i < companyIds.length; i += 1) {
          const companyId = companyIds[i];
          const company = getCompany(companyId);
          if (!company) {
            failed.push({ id: companyId, error: 'Company not found' });
          } else {
            try {
              const audit = getAudit(companyId);
              const vertical = company.vertical ? (VERTICALS[company.vertical] ?? null) : null;
              const opportunity = await generateOpportunity(openrouter, company, audit, vertical);
              generated.push(opportunity);
            } catch (e) {
              failed.push({ id: companyId, error: e instanceof Error ? e.message : 'Generation failed' });
            }
          }
          if (i < companyIds.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        sendJson(res, 200, { success: true, generated, failed });
        return;
      }

      if (path === '/api/opportunities' && req.method === 'GET') {
        const opportunities = listOpportunities({
          companyId: url.searchParams.get('companyId') ?? undefined,
          salesPriority: url.searchParams.get('salesPriority') ?? undefined,
          humanApproval: url.searchParams.get('humanApproval') ?? undefined,
          outcome: url.searchParams.get('outcome') ?? undefined,
        });
        sendJson(res, 200, { success: true, opportunities, total: opportunities.length });
        return;
      }

      if (path === '/api/opportunities' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const companyId = String(body?.company_id ?? '').trim();
        if (!companyId) {
          sendJson(res, 400, { success: false, error: 'company_id is required' });
          return;
        }
        const opportunity = createOpportunity(body);
        sendJson(res, 201, { success: true, opportunity });
        return;
      }

      const opportunityMatch = path.match(/^\/api\/opportunities\/([^/]+)$/);
      if (opportunityMatch && req.method === 'GET') {
        const opportunity = getOpportunity(decodeURIComponent(opportunityMatch[1]));
        if (!opportunity) {
          sendJson(res, 404, { success: false, error: 'Opportunity not found' });
          return;
        }
        sendJson(res, 200, { success: true, opportunity });
        return;
      }

      if (opportunityMatch && req.method === 'PUT') {
        const body = await readJsonBody(req);
        // Stamped on the transition so the evening report can tell "sent
        // today" from "approved at some unknown past point" — see
        // server/jobs/daily-report.mjs's buildEveningReport doc comment.
        if (body.human_approval === 'approved' && !body.approved_at) {
          body.approved_at = new Date().toISOString();
        }
        if (body.human_approval === 'rejected' && !body.rejected_at) {
          body.rejected_at = new Date().toISOString();
        }
        const opportunity = updateOpportunity(decodeURIComponent(opportunityMatch[1]), body);
        sendJson(res, 200, { success: true, opportunity });
        return;
      }

      // ——— Daily/weekly reports (server/jobs/daily-report.mjs) ———
      if (path === '/api/reports/morning' && req.method === 'GET') {
        const report = await buildMorningReport();
        sendJson(res, 200, { success: true, report });
        return;
      }

      if (path === '/api/reports/evening' && req.method === 'GET') {
        const report = await buildEveningReport();
        sendJson(res, 200, { success: true, report });
        return;
      }

      if (path === '/api/reports/weekly' && req.method === 'GET') {
        const report = await buildWeeklyMetrics();
        sendJson(res, 200, { success: true, report });
        return;
      }

      if (path === '/api/reports/send-now' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const type = body?.type === 'evening' ? 'evening' : body?.type === 'morning' ? 'morning' : null;
        if (!type) {
          sendJson(res, 400, { success: false, error: "type must be 'morning' or 'evening'" });
          return;
        }
        const { report, sent } = type === 'morning' ? await sendMorningReport() : await sendEveningReport();
        sendJson(res, 200, { success: true, report, sent });
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
    console.log(
      `  Radar DB: ${process.env.RADAR_DATABASE_PATH ?? './data/radar.json'} (telegram every 30min, avito every 6h, vc/habr daily + all checked 30s after start)`,
    );
  });

  cron.schedule(TELEGRAM_CRON_EXPRESSION, () =>
    runRadarCheckGuarded({ sourceTypes: ['telegram'] }).catch(console.error),
  );
  cron.schedule(AVITO_CRON_EXPRESSION, () => runRadarCheckGuarded({ sourceTypes: ['avito'] }).catch(console.error));
  cron.schedule(DAILY_CRON_EXPRESSION, () =>
    runRadarCheckGuarded({ sourceTypes: ['vc', 'habr'] }).catch(console.error),
  );
  setTimeout(() => runRadarCheckGuarded().catch(console.error), 30_000);

  // Explicit Moscow timezone — 09:00/18:00 are meant as MSK wall-clock
  // times regardless of the server host's own timezone.
  cron.schedule('0 9 * * *', () => sendMorningReport().catch(console.error), { timezone: 'Europe/Moscow' });
  cron.schedule('0 18 * * *', () => sendEveningReport().catch(console.error), { timezone: 'Europe/Moscow' });
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
