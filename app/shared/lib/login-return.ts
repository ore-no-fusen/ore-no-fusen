const sharedReturnKey = 'viewer_return_to';

/** Keep the shared-page return hint within the tab that started OAuth. */
export function markSharedLoginReturn(): void {
  sessionStorage.setItem(sharedReturnKey, '/shared');
}

export function clearSharedLoginReturn(): void {
  sessionStorage.removeItem(sharedReturnKey);
}

/** A stale hint is valid only on the OAuth callback, never on a normal viewer visit. */
export function isSharedLoginAttempt(search: string): boolean {
  const params = new URLSearchParams(search);
  if (params.get('shared') === '1') return true;
  if (params.has('code') || params.has('error')) return sessionStorage.getItem(sharedReturnKey) === '/shared';
  clearSharedLoginReturn();
  return false;
}

/** Consume the hint once, and only when a shared OAuth callback completes. */
export function consumeSharedLoginReturn(search: string): boolean {
  if (!new URLSearchParams(search).has('code') || sessionStorage.getItem(sharedReturnKey) !== '/shared') return false;
  clearSharedLoginReturn();
  return true;
}
