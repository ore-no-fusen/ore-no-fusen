import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

export function spawnOwned(file, args, options = {}) {
  return spawn(process.execPath, [fileURLToPath(new URL('./process-host.mjs', import.meta.url)), file, ...args], {
    ...options, windowsHide: true, shell: false, detached: process.platform !== 'win32',
  });
}

// Only accept our ChildProcess handle, never a port or an executable name.
export async function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close');
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    const [code] = await Promise.race([once(killer, 'close'), new Promise((_, reject) => setTimeout(() => reject(new Error('子処理の停止に失敗しました。PIDを保全して確認してください。')), 5000).unref())]);
    if (code !== 0 && child.exitCode === null) throw new Error('子処理を停止できません。PIDを保全して確認してください。');
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
  await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('子処理の終了を確認できません。')), 5000).unref())]);
}

export function redact(text, secrets = []) {
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) text = text.split(secret).join('[REDACTED]');
  return text.replace(/(GDRIVE_CLIENT_(?:SECRET|ID)\s*[=:]\s*)\S+/gi, '$1[REDACTED]');
}

// Arguments are passed directly to the executable; no cmd /c or shell interpolation.
export function createRunner(secrets = []) {
  return (file, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawnOwned(file, args, { cwd: options.cwd,
      env: { ...(options.env ?? process.env), GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', GH_PROMPT_DISABLED: '1' },
      windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    options.onPid?.(child.pid);
    let expired = false;
    const timer = setTimeout(() => { expired = true; stopProcessTree(child).then(() => reject(new Error(`${file} が制限時間を超えました。保存済み工程から再開してください。`)), reject); }, options.timeoutMs ?? 120_000);
    const heartbeat = setInterval(() => options.onOutput?.('処理を継続しています。保存済み工程は再実行しません。\n'), 60_000);
    timer.unref(); heartbeat.unref();
    let output = '', errors = '';
    function consume(stream, collect) {
      const decoder = new StringDecoder('utf8'); let pending = '';
      function flush(final = false) {
        if (final && !pending) return;
        const lines = pending.split(/\r?\n/); pending = final ? '' : lines.pop();
        for (const line of lines) {
          const safe = redact(line, secrets); if (collect) output += `${safe}\n`; else errors = `${errors}${safe}\n`.slice(-3000); options.onOutput?.(`${safe}\n`);
        }
      }
      stream.on('data', data => { pending += decoder.write(data); flush(); });
      stream.on('end', () => { pending += decoder.end(); flush(true); });
    }
    consume(child.stdout, true); consume(child.stderr, false);
    child.on('error', error => { clearTimeout(timer); clearInterval(heartbeat); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer); clearInterval(heartbeat);
      options.onPid?.(null);
      if (expired) reject(new Error(`${file} が制限時間を超えました。ログと保存済み工程を確認し、同じ操作から再開してください。`));
      else if (code !== 0) reject(new Error(`${file} が終了コード ${code ?? signal} で停止しました。${errors.trim() ? `\n${errors.trim()}` : '上のログを確認してください。'}`));
      else resolve(output.trimEnd());
    });
  });
}
