import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const nextBin = join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next');
const playwrightCli = join(rootDir, 'node_modules', '@playwright', 'test', 'cli.js');
const isWindows = process.platform === 'win32';

const server = spawn(process.execPath, [nextBin, 'dev', '-p', '3002'], {
  cwd: rootDir,
  env: { ...process.env, TAURI_DEV: '1' },
  stdio: 'inherit',
  detached: isWindows,
});

let cleanedUp = false;

const cleanup = () => {
  if (cleanedUp) return;
  cleanedUp = true;

  if (server.pid && isWindows) {
    spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }

  if (server.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
  }
};

const waitForServer = async () => {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if ((await canReachServer()) && (await canLoadApp())) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Timed out waiting for http://localhost:3002');
};

const canReachServer = () =>
  new Promise((resolve) => {
    const socket = net.connect(3002, '127.0.0.1', () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });

const canLoadApp = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('http://127.0.0.1:3002/?path=C:/test/note.md', {
      signal: controller.signal,
    });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const runPlaywright = () =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
      cwd: rootDir,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });

process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

let exitCode = 1;
try {
  await waitForServer();
  exitCode = await runPlaywright();
} finally {
  cleanup();
}

process.exit(exitCode);
