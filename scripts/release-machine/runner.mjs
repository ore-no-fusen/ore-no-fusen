import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

export function redact(text, secrets = []) {
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) text = text.split(secret).join('[REDACTED]');
  return text.replace(/(GDRIVE_CLIENT_(?:SECRET|ID)\s*[=:]\s*)\S+/gi, '$1[REDACTED]');
}

// Arguments are passed directly to the executable; no cmd /c or shell interpolation.
export function createRunner(secrets = []) {
  return (file, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: options.cwd, env: options.env ?? process.env, windowsHide: true, shell: false });
    options.onPid?.(child.pid);
    let output = '';
    function consume(stream, collect) {
      const decoder = new StringDecoder('utf8'); let pending = '';
      function flush(final = false) {
        if (final && !pending) return;
        const lines = pending.split(/\r?\n/); pending = final ? '' : lines.pop();
        for (const line of lines) {
          const safe = redact(line, secrets); if (collect) output += `${safe}\n`; options.onOutput?.(`${safe}\n`);
        }
      }
      stream.on('data', data => { pending += decoder.write(data); flush(); });
      stream.on('end', () => { pending += decoder.end(); flush(true); });
    }
    consume(child.stdout, true); consume(child.stderr, false);
    child.on('error', reject);
    child.on('close', (code, signal) => {
      options.onPid?.(null);
      if (code !== 0) reject(new Error(`${file} が終了コード ${code ?? signal} で停止しました。上のログを確認してください。`));
      else resolve(output.trimEnd());
    });
  });
}
