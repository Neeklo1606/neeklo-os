import { cp, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function readVersion() {
  try {
    const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
    return pkg.version;
  } catch {
    return undefined;
  }
}

const version = await readVersion();
const stamp = version ? `${version}-${timestamp()}` : timestamp();
const backupDir = join('backups', stamp);

await mkdir(backupDir, { recursive: true });

if (existsSync('dist')) {
  await cp('dist', join(backupDir, 'dist'), { recursive: true });
}

if (existsSync('server')) {
  await cp('server', join(backupDir, 'server'), { recursive: true });
}

console.log(`✅ Backup saved to backups/${stamp}/`);
