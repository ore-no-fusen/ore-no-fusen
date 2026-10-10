import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { ReleaseMachine, atomicJSON } from './engine.mjs';
import { createRunner } from './runner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };
export function acquireLock(file, info) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (alive(existing.pid)) return { existing };
    fs.unlinkSync(file);
  }
  const fd = fs.openSync(file, 'wx', 0o600);
  fs.writeFileSync(fd, JSON.stringify(info)); fs.closeSync(fd);
  return { release: () => { if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).token === info.token) fs.unlinkSync(file); } };
}

export function createServer(machine, { token, port, readOnly = false }) {
  const origin = `http://127.0.0.1:${port}`;
  function respond(res, code, body, type = 'application/json; charset=utf-8') {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  }
  return http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== `127.0.0.1:${port}` || !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return respond(res, 403, { error: 'このPCからのみ利用できます。' });
      if (req.headers.origin && req.headers.origin !== origin) return respond(res, 403, { error: '別サイトからの操作を拒否しました。' });
      if (req.method === 'GET' && ['/', '/ui.js', '/ui.css'].includes(req.url)) {
        const name = req.url === '/' ? 'index.html' : req.url.slice(1);
        return respond(res, 200, fs.readFileSync(path.join(here, name), 'utf8'), name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8');
      }
      if (req.headers.authorization !== `Bearer ${token}`) return respond(res, 401, { error: '起動用ファイルから画面を開き直してください。' });
      if (req.method === 'GET' && req.url === '/api/state') {
        const info = await machine.inspect();
        // Version write recovery data is kept on disk, not sent to the page.
        const { versionTexts: _texts, ...state } = info.state;
        return respond(res, 200, { ...info, state, readOnly });
      }
      if (req.method !== 'POST' || !['/api/prepare', '/api/package'].includes(req.url)) return respond(res, 404, { error: '見つかりません。' });
      if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return respond(res, 403, { error: 'この画面からの操作のみ受け付けます。' });
      if (readOnly) return respond(res, 403, { error: '表示確認モードです。リリース操作は無効です。' });
      let body = ''; for await (const chunk of req) { body += chunk.toString('utf8'); if (body.length > 4096) return respond(res, 413, { error: '入力が大きすぎます。' }); }
      const input = JSON.parse(body);
      if (typeof input.version !== 'string' || input.version.length > 30) return respond(res, 400, { error: '版番号を入力してください。' });
      machine.start(req.url === '/api/prepare' ? 'prepare' : 'package', input);
      return respond(res, 202, { accepted: true });
    } catch (error) { respond(res, 409, { error: error.message }); }
  });
}

function openBrowser(url) { const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, detached: true, stdio: 'ignore' }); child.on('error', error => console.error(error.message)); child.unref(); }
export async function main(args = process.argv.slice(2)) {
  const root = path.resolve(here, '../..'); const dataDir = path.join(root, 'my/release-machine');
  const readOnly = args.includes('--read-only'); const port = readOnly ? 3100 : 3099;
  const token = randomBytes(32).toString('hex');
  const lock = acquireLock(path.join(dataDir, `server-${port}.lock`), { pid: process.pid, token, port });
  if (lock.existing) {
    if (args.includes('--browser')) openBrowser(`http://127.0.0.1:${port}/#${lock.existing.token}`);
    console.log(`既に起動しています: http://127.0.0.1:${port}`); return;
  }
  try {
    const env = { ...process.env }; const envFile = path.join(root, '.env.local');
    const secrets = [env.GDRIVE_CLIENT_ID, env.GDRIVE_CLIENT_SECRET];
    if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) if (/^GDRIVE_CLIENT_(ID|SECRET)=/.test(line)) secrets.push(line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2'));
    const machine = new ReleaseMachine({ root, dataDir: readOnly ? path.join(dataDir, 'preview') : dataDir, runner: createRunner(secrets) });
    const server = createServer(machine, { token, port, readOnly });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    const url = `http://127.0.0.1:${port}/#${token}`;
    atomicJSON(path.join(dataDir, `connection-${port}.json`), { url, readOnly, pid: process.pid });
    console.log(`リリースマシン起動: http://127.0.0.1:${port}\n終了するときはこのウィンドウで Ctrl+C。\nログ保存先: ${machine.dataDir}`);
    if (args.includes('--browser')) openBrowser(url);
    const shutdown = () => {
      if (machine.busy) { console.error('リリース処理中です。処理完了を待ってから終了してください。'); return; }
      server.close(() => { lock.release(); process.exit(0); });
    };
    process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown); process.once('exit', lock.release);
    return { server, machine, url };
  } catch (error) { lock.release(); throw error; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
