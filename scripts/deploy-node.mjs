import { execSync } from 'node:child_process';
import { readFile, writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const token = process.env.NEEKLO_DEPLOY_TOKEN?.trim();
if (!token) {
  console.error('NEEKLO_DEPLOY_TOKEN is required in .env');
  process.exit(1);
}

const required = ['NEEKLO_API_KEY', 'OPENROUTER_API_KEY'];
for (const key of required) {
  if (!process.env[key]?.trim()) {
    console.error(`${key} is required in .env`);
    process.exit(1);
  }
}

const port = process.env.PORT?.trim() || '8787';
const envContent = `# Production — deployed to Neeklo server (do not commit)
NEEKLO_API_KEY=${process.env.NEEKLO_API_KEY}
NEEKLO_API_BASE=${process.env.NEEKLO_API_BASE ?? 'https://neekloai.ru/api/v1'}
OPENROUTER_API_KEY=${process.env.OPENROUTER_API_KEY}
OPENROUTER_MODEL=${process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-v4-flash'}
PORT=${port}
PARSER_POLL_INTERVAL_MS=${process.env.PARSER_POLL_INTERVAL_MS ?? '6000'}
PARSER_JOB_TIMEOUT_MS=${process.env.PARSER_JOB_TIMEOUT_MS ?? '600000'}
DATABASE_PATH=${process.env.DATABASE_PATH ?? './data/companies.json'}
LEADS_DATABASE_PATH=${process.env.LEADS_DATABASE_PATH ?? './data/leads.json'}
CAMPAIGNS_DATABASE_PATH=${process.env.CAMPAIGNS_DATABASE_PATH ?? './data/campaigns.json'}
AGENT_SESSIONS_DATABASE_PATH=${process.env.AGENT_SESSIONS_DATABASE_PATH ?? './data/agent-sessions.json'}
TELEGRAM_BOT_TOKEN=${process.env.TELEGRAM_BOT_TOKEN ?? ''}
TELEGRAM_CHAT_ID=${process.env.TELEGRAM_CHAT_ID ?? ''}
`;

execSync('npm run build', {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_AGENT_API_URL: '/osnee/api/agent',
    VITE_COMPANIES_API_URL: '/osnee/api/companies',
    VITE_LEADS_API_URL: '/osnee/api/leads',
    VITE_CAMPAIGNS_API_URL: '/osnee/api/campaigns',
  },
});

const stage = await mkdtemp(join(tmpdir(), 'osnee-node-'));
const archive = join(tmpdir(), `osnee-node-${Date.now()}.tar.gz`);

await writeFile(join(stage, '.env'), envContent, { mode: 0o600 });
execSync(`cp -R server dist package.prod.json "${stage}/"`, { stdio: 'inherit' });
execSync(`mv "${join(stage, 'package.prod.json')}" "${join(stage, 'package.json')}"`, {
  stdio: 'inherit',
});

execSync(`tar -czf "${archive}" -C "${stage}" .`, { stdio: 'inherit' });

const fileBuffer = await readFile(archive);

function deployHeaders(token) {
  if (token.startsWith('nk_')) {
    return { 'x-api-key': token, 'Content-Type': 'application/gzip' };
  }
  return { 'X-Neeklo-Token': token, 'Content-Type': 'application/gzip' };
}

const url = 'https://model-api.neeklo.ru/v1/preview/osnee?type=node';
const res = await fetch(url, {
  method: 'POST',
  headers: deployHeaders(token),
  body: fileBuffer,
});

const data = await res.json();
await unlink(archive).catch(() => {});

if (!res.ok || data.error) {
  console.error('Node deploy failed:', data);
  process.exit(1);
}

console.log('Node deploy OK:', JSON.stringify(data, null, 2));
