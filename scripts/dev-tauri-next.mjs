import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nextBin = join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');

const child = spawn(process.execPath, [nextBin, 'dev', '-p', '3002'], {
  env: { ...process.env, TAURI_DEV: '1' },
  shell: false,
  stdio: ['inherit', 'pipe', 'pipe'],
});

const shouldHideLine = (line) => {
  const text = line.replace(/\x1b\[[0-9;]*m/g, '');
  return /^\s*GET \/\?path=/.test(text);
};

const labelLine = (line) => {
  const text = line.replace(/\x1b\[[0-9;]*m/g, '');
  if (/^\s*[○✓]\s+Compil/.test(text)) return `[Next.js] ${line}`;
  if (/^\s*✓\s+Ready in /.test(text)) return `[Next.js] ${line}`;
  if (/^\s*▲\s+Next\.js /.test(text)) return `[Next.js] ${line}`;
  if (/^\s*-\s+Local:/.test(text)) return `[Next.js] ${line}`;
  if (/^\s*GET \/ /.test(text)) return `[Next.js] ${line}`;
  return line;
};

const pipeFiltered = (stream, output) => {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!shouldHideLine(line)) output.write(`${labelLine(line)}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer && !shouldHideLine(buffer)) output.write(labelLine(buffer));
  });
};

pipeFiltered(child.stdout, process.stdout);
pipeFiltered(child.stderr, process.stderr);

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
