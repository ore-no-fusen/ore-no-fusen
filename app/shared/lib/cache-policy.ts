import { clearDriveCacheEntries } from '@/lib/drive-cache-policy.mjs';

const POLICY_MESSAGE = 'ONF_DRIVE_CACHE_POLICY';
let verified: ServiceWorker | null = null;
let checkedUncontrolled = false;
let pending: Promise<void> | null = null;

function supportsPolicy(worker: ServiceWorker): Promise<boolean> {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => {
      clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(ready);
    };
    const timer = setTimeout(() => finish(false), 1_500);
    channel.port1.onmessage = event => finish(event.data?.type === POLICY_MESSAGE && event.data?.driveCachePolicy === 1);
    try { worker.postMessage({ type: POLICY_MESSAGE }, [channel.port2]); }
    catch { finish(false); }
  });
}

async function check(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    await clearDriveCacheEntries(); return;
  }
  const workers = navigator.serviceWorker;
  if (workers.controller && workers.controller === verified) return;
  if (!workers.controller && checkedUncontrolled) return;
  const registration = await workers.getRegistration();
  if (!workers.controller && !registration) {
    await clearDriveCacheEntries(); checkedUncontrolled = true; return;
  }
  const initial = workers.controller;
  if (initial && await supportsPolicy(initial) && workers.controller === initial) {
    verified = initial; return;
  }
  if (!registration) throw new Error('Webの更新状態を確認できません。「Webを更新」で再試行してください。');

  let unsubscribe = () => {};
  const changed = new Promise<ServiceWorker>((resolve, reject) => {
    const finish = () => {
      if (workers.controller) { unsubscribe(); resolve(workers.controller); }
    };
    const timer = setTimeout(() => {
      unsubscribe(); reject(new Error('Webの更新を確認できません。接続を確認して「Webを更新」を押してください。'));
    }, 20_000);
    unsubscribe = () => { clearTimeout(timer); workers.removeEventListener('controllerchange', finish); };
    workers.addEventListener('controllerchange', finish);
  });
  // Attach a rejection handler immediately; update() itself may take time.
  void changed.catch(() => undefined);
  try {
    await Promise.race([registration.update(), changed.then(() => undefined)]);
    // An update may finish before update() returns, or a new controller may
    // already have claimed the page. Never force reload or unregister push.
    const candidate = workers.controller;
    if (candidate && await supportsPolicy(candidate) && workers.controller === candidate) {
      unsubscribe(); verified = candidate; return;
    }
    const controller = await changed;
    if (!await supportsPolicy(controller) || workers.controller !== controller) throw new Error('Webの更新が完了していません。「Webを更新」で再試行してください。');
    verified = controller;
  } finally { unsubscribe(); }
}

/** Never send Drive data through an old cache-writing worker. */
export async function ensureDriveCachePolicy(): Promise<void> {
  if (!pending) pending = check().finally(() => { pending = null; });
  return pending;
}
