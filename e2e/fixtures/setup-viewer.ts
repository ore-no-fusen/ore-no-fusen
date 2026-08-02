import type { Page } from '@playwright/test';

type ViewerNote = {
  id: string;
  [key: string]: unknown;
};

export async function setupViewerWithNotes(
  page: Page,
  notes: ViewerNote[],
  options: { captureNotifications?: boolean } = {},
) {
  await page.addInitScript(({ captureNotifications }) => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    Object.defineProperty(Notification, 'permission', {
      configurable: true,
      get: () => 'granted',
    });

    localStorage.setItem('viewer_access_token', 'dummy-token');
    localStorage.setItem('viewer_push_done', 'true');

    const calls: Array<{ title: string; options: NotificationOptions }> = [];
    (window as unknown as { __swNotifCalls: typeof calls }).__swNotifCalls = calls;
    const registration = {
      active: { postMessage: () => {} },
      unregister: async () => true,
      getNotifications: async () => [],
      showNotification: async (title: string, notificationOptions?: NotificationOptions) => {
        if (captureNotifications) {
          calls.push({ title, options: notificationOptions ?? {} });
        }
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve(registration),
        controller: registration.active,
        getRegistration: async () => registration,
        getRegistrations: async () => [registration],
        register: async () => registration,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
  }, options);

  await page.route('**/sw.js', (route) =>
    route.fulfill({ body: '', contentType: 'application/javascript' }),
  );
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));

  await page.goto('/viewer');
  await page.evaluate(async (notesToSave) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('fusen-drafts', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('drafts')) {
          request.result.createObjectStore('drafts');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readwrite');
      const store = transaction.objectStore('drafts');
      store.clear();
      for (const note of notesToSave) store.put(note, note.id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, notes);

  await page.reload();
  await page.getByRole('button', { name: '一覧', exact: true }).waitFor();
}
