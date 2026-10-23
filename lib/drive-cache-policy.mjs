// Keep this predicate self-contained: Workbox serializes it into the worker.
export const driveApiRoute = ({ url }) =>
  ['www.googleapis.com', 'content.googleapis.com'].includes(url.hostname) &&
  (/^\/(?:upload\/|download\/)?drive\/v[23]\//.test(url.pathname) || /^\/oauth2\//.test(url.pathname));

export async function clearDriveCacheEntries(cacheStorage = globalThis.caches) {
  if (!cacheStorage) return 0;
  let removed = 0;
  for (const name of await cacheStorage.keys()) {
    const cache = await cacheStorage.open(name);
    for (const request of await cache.keys()) {
      if (driveApiRoute({ url: new URL(request.url) })) {
        if (await cache.delete(request)) removed += 1;
      }
    }
  }
  return removed;
}
