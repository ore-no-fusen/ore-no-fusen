export type DiagnosticLogRecord = { t: string; msg: string };

function sanitizeField(value: string | number | boolean): string {
  return String(value).replace(/[\r\n\t]/g, ' ').slice(0, 160);
}

export function safeErrorName(error: unknown): string {
  if (error instanceof DOMException) return error.name || 'DOMException';
  if (error instanceof Error) return error.name || 'Error';
  return typeof error === 'string' ? 'StringError' : 'UnknownError';
}

export function formatNavigationLog(
  event: string,
  fields: Record<string, string | number | boolean | undefined> = {},
): string {
  const details = Object.entries(fields)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${sanitizeField(value)}`)
    .join(' ');
  return `[NAV] event=${sanitizeField(event)}${details ? ` ${details}` : ''}`;
}

export function appendDiagnosticLog(message: string): void {
  try {
    const request = indexedDB.open('fusen-logs', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('logs', { autoIncrement: true });
    request.onsuccess = () => {
      const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const transaction = request.result.transaction('logs', 'readwrite');
      transaction.objectStore('logs').add({
        t: jst.toISOString().replace('Z', '+09:00'),
        msg: message,
      });
    };
  } catch {
    // 診断ログ自体の失敗で画面処理を止めない。
  }
}

export function buildNotificationDiagnosticReport(
  logs: DiagnosticLogRecord[],
  swVersion: string | null,
): string {
  const navigationLogs = logs
    .filter(({ msg }) => msg.startsWith('[NAV]') || msg.startsWith('SW起動 version='))
    .map(({ t, msg }) => `${t} ${msg}`);
  return [
    '俺の付箋 PWA 通知診断ログ',
    `exported_at=${new Date().toISOString()}`,
    `sw_version=${swVersion ?? 'unknown'}`,
    ...navigationLogs,
  ].join('\n');
}
