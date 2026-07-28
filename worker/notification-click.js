export function buildNotificationTargetUrl(origin, id) {
  return `${origin}/viewer?note=${encodeURIComponent(id || 'unknown')}`;
}

export function closeClickedNotification(notification) {
  const data = notification.data || {};
  notification.close();
  return data;
}

export async function focusViewerOrOpenTarget({ clientList, id, origin, openWindow, log }) {
  for (const client of clientList) {
    if (client.url.includes('/viewer') && 'focus' in client) {
      log?.(`postMessage OPEN_NOTE id=${id}`);
      client.postMessage({ type: 'OPEN_NOTE', id });
      return client.focus();
    }
  }
  const targetUrl = buildNotificationTargetUrl(origin, id);
  log?.(`openWindow targetUrl=${targetUrl}`);
  return openWindow(targetUrl);
}
