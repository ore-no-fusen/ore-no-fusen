import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(rootDir, 'app', 'api');
const parkedApiDir = join(rootDir, `.tauri-build-api-${process.pid}`);
const nextBin = join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next');

if (!existsSync(apiDir)) throw new Error(`Tauri build API source is missing: ${apiDir}`);
if (existsSync(parkedApiDir)) throw new Error(`Tauri build temporary path already exists: ${parkedApiDir}`);

const routeFiles = readdirSync(apiDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name === 'route.ts')
  .map((entry) => join(entry.parentPath, entry.name));

if (routeFiles.length === 0) throw new Error('No server-only API routes were found for the Tauri build');

for (const routeFile of routeFiles) {
  const parkedFile = join(parkedApiDir, relative(apiDir, routeFile));
  mkdirSync(dirname(parkedFile), { recursive: true });
  renameSync(routeFile, parkedFile);
}
try {
  const result = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: rootDir,
    env: { ...process.env, IS_TAURI_BUILD: 'true' },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  for (const routeFile of routeFiles) {
    const parkedFile = join(parkedApiDir, relative(apiDir, routeFile));
    mkdirSync(dirname(routeFile), { recursive: true });
    renameSync(parkedFile, routeFile);
  }
  rmSync(parkedApiDir, { recursive: true, force: true });
}
