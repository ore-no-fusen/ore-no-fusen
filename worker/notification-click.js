export function buildNotificationTargetUrl(origin, id) {
  return `${origin}/viewer?note=${encodeURIComponent(id || 'unknown')}`;
}

export function closeClickedNotification(notification) {
  const data = notification.data || {};
  notification.close();
  return data;
}

export async function focusViewerOrOpenTarget({ clientList, id, origin, openWindow, log }) {
  try {
    for (const client of clientList) {
      if (client.url.includes('/viewer') && 'focus' in client) {
        log?.(`[NAV] event=route_selected source=open_note id=${id}`);
        client.postMessage({ type: 'OPEN_NOTE', id });
        const result = await client.focus();
        log?.(`[NAV] event=client_focused id=${id}`);
        return result;
      }
    }
    const targetUrl = buildNotificationTargetUrl(origin, id);
    log?.(`[NAV] event=route_selected source=url id=${id}`);
    const result = await openWindow(targetUrl);
    log?.(`[NAV] event=window_opened id=${id}`);
    return result;
  } catch (error) {
    const errorName = error && typeof error === 'object' && error.name
      ? String(error.name)
      : 'UnknownError';
    log?.(`[NAV] event=route_failed id=${id} error=${errorName}`);
    throw error;
  }
}
