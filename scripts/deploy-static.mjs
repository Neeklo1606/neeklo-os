import { execSync } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const token = process.env.NEEKLO_DEPLOY_TOKEN?.trim();
if (!token) {
  console.error('NEEKLO_DEPLOY_TOKEN is required in .env');
  process.exit(1);
}

const archive = join(tmpdir(), `osnee-dist-${Date.now()}.tar.gz`);

execSync(`tar -czf "${archive}" -C dist .`, { stdio: 'inherit' });

const fileBuffer = await readFile(archive);

function deployHeaders(token) {
  if (token.startsWith('nk_')) {
    return { 'x-api-key': token, 'Content-Type': 'application/gzip' };
  }
  return { 'X-Neeklo-Token': token, 'Content-Type': 'application/gzip' };
}

const res = await fetch('https://model-api.neeklo.ru/v1/preview/osnee', {
  method: 'POST',
  headers: deployHeaders(token),
  body: fileBuffer,
});

const data = await res.json();
await unlink(archive).catch(() => {});

if (!res.ok || data.error) {
  console.error('Deploy failed:', data);
  process.exit(1);
}

console.log('Deployed:', data.url ?? data);
console.log('Files:', data.files ?? '—');
