import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const nextBin = join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next');
const playwrightCli = join(rootDir, 'node_modules', '@playwright', 'test', 'cli.js');
const isWindows = process.platform === 'win32';
const host = '127.0.0.1';

const getAvailablePort = () =>
  new Promise((resolve, reject) => {
    const reservation = net.createServer();
    reservation.unref();
    reservation.on('error', reject);
    reservation.listen(0, host, () => {
      const address = reservation.address();
      if (!address || typeof address === 'string') {
        reservation.close();
        reject(new Error('Could not allocate an E2E server port'));
        return;
      }
      reservation.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });

const configuredPort = process.env.E2E_PORT
  ? Number.parseInt(process.env.E2E_PORT, 10)
  : undefined;
if (configuredPort !== undefined && (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535)) {
  throw new Error(`Invalid E2E_PORT: ${process.env.E2E_PORT}`);
}

const port = configuredPort ?? await getAvailablePort();
const baseUrl = `http://${host}:${port}`;
const runId = `${process.pid}-${port}`;
const nextDistDir = `.next/e2e-${runId}`;
const nextTsconfig = `.tsconfig-e2e-${runId}.json`;

mkdirSync(join(rootDir, '.next'), { recursive: true });
writeFileSync(
  join(rootDir, nextTsconfig),
  `${JSON.stringify({
    extends: './tsconfig.json',
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', `.next/e2e-${runId}/types/**/*.ts`],
    exclude: ['node_modules'],
  }, null, 2)}\n`,
);

console.log(`[e2e] Starting isolated server at ${baseUrl}`);

const server = spawn(process.execPath, [nextBin, 'dev', '-H', host, '-p', String(port)], {
  cwd: rootDir,
  env: {
    ...process.env,
    TAURI_DEV: '1',
    NEXT_DIST_DIR: nextDistDir,
    NEXT_TSCONFIG_PATH: nextTsconfig,
  },
  stdio: 'inherit',
  detached: false,
});

let cleanedUp = false;

const cleanup = () => {
  if (cleanedUp) return;
  cleanedUp = true;

  if (server.pid) {
    try {
      if (isWindows) server.kill('SIGTERM');
      else process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
  }

  rmSync(join(rootDir, nextDistDir), { recursive: true, force: true });
  rmSync(join(rootDir, nextTsconfig), { force: true });
};

const waitForServer = async () => {
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    if ((await canReachServer()) && (await canLoadApp())) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
};

const canReachServer = () =>
  new Promise((resolve) => {
    const socket = net.connect(port, host, () => {
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
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const urls = [`${baseUrl}/?path=C:/test/note.md`, `${baseUrl}/viewer`];
    for (const url of urls) {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status >= 500) return false;
    }
    return true;
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
      env: {
        ...process.env,
        E2E_BASE_URL: baseUrl,
        E2E_OUTPUT_DIR: `test-results/e2e-${runId}`,
      },
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
