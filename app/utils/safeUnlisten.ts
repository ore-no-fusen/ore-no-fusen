export type TauriUnlisten = (() => void | Promise<void>) | null | undefined;

export function safeUnlisten(unlisten: TauriUnlisten): void {
  try {
    const result = unlisten?.();
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  } catch (_) {
    // Listener cleanup can race with window teardown in Tauri/WebView.
  }
}

export function safeUnlistenWhenResolved(
  unlistenPromise: Promise<TauriUnlisten> | null | undefined
): void {
  unlistenPromise?.then(safeUnlisten).catch(() => {});
}
