const ATTEMPT_KEY = 'shared_web_connection_attempt';
const LOG_KEY = 'shared_web_connection_diagnostics';
const MAX_LOGS = 30;

function formatRecord(event: string, fields: Record<string, string | number | boolean | undefined>): string {
  const details = Object.entries(fields)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${String(value).replace(/[\r\n\t]/g, ' ').slice(0, 120)}`)
    .join(' ');
  return `[WEB接続] event=${event}${details ? ` ${details}` : ''}`;
}

function writeSessionLog(entry: { t: string; msg: string }): void {
  try {
    const previous = JSON.parse(sessionStorage.getItem(LOG_KEY) ?? '[]') as Array<{ t: string; msg: string }>;
    sessionStorage.setItem(LOG_KEY, JSON.stringify([...previous, entry].slice(-MAX_LOGS)));
  } catch { /* 診断ログが通常操作を止めない */ }
}

function swState(): Record<string, string | boolean | undefined> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return { swAvailable: false, swControlled: false };
  const scriptUrl = navigator.serviceWorker.controller?.scriptURL;
  let scriptPath: string | undefined;
  try {
    if (scriptUrl && new URL(scriptUrl).origin === window.location.origin) scriptPath = new URL(scriptUrl).pathname;
  } catch { /* URLは記録しない */ }
  return { swAvailable: true, swControlled: Boolean(scriptUrl), swScriptPath: scriptPath };
}

export function logSharedConnection(event: string, fields: Record<string, string | number | boolean | undefined> = {}): string | null {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return null;
  try {
    let attemptId = sessionStorage.getItem(ATTEMPT_KEY);
    if (event === 'shared_connect_clicked' || !attemptId) {
      attemptId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(ATTEMPT_KEY, attemptId);
    }
    const jst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00');
    writeSessionLog({ t: jst, msg: formatRecord(event, {
      attemptId,
      path: window.location.pathname === '/shared' ? '/shared' : window.location.pathname === '/viewer' ? '/viewer' : 'other',
      ...swState(),
      ...fields,
    }) });
    return attemptId;
  } catch { return null; }
}

export function copySharedConnectionDiagnostics(): string {
  const entries = JSON.parse(sessionStorage.getItem(LOG_KEY) ?? '[]') as Array<{ t?: string; msg?: string }>;
  const lines = entries.slice(-MAX_LOGS).map((entry) => `${entry.t ?? ''} ${entry.msg ?? ''}`);
  return ['接続診断（URL・認証情報・付箋本文は含みません）', ...lines].join('\n');
}
