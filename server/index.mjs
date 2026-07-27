import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './load-env.mjs';
import { loadConfig } from './config.mjs';
import { createParserClient } from './parser.mjs';
import { createOpenRouterClient } from './openrouter.mjs';
import { executeJobPlan } from './maps-pipeline.mjs';
import { inferNicheFromQuery } from './agent-prompt.mjs';
import { validateOrgsWithAgent } from './validate-orgs.mjs';
import { createRun, getRun, patchRun } from './run-store.mjs';
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

function configStatus(config) {
  return {
    parserKey: Boolean(config.neekloApiKey),
    openrouterKey: Boolean(config.openrouterApiKey),
    model: config.openrouterModel,
    parserBase: config.neekloApiBase,
  };
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
        const { created, skipped } = createCompanies(items);
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
        const company = createCompany(body);
        sendJson(res, 201, { success: true, company });
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
  });
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
