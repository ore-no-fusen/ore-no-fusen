import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushWebFeatures, trackWebFeature } from './usage';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function browser(extra = {}) {
  const target = { location: { hostname: 'ore-no-fusen.vercel.app' }, ...extra };
  vi.stubGlobal('window', target); vi.stubEnv('NODE_ENV', 'production');
  return target;
}
describe('Web usage', () => {
  it('sends only a fixed feature name without note or account data', () => {
    const gtag = vi.fn(); browser({ gtag }); trackWebFeature('web_edit');
    expect(gtag).toHaveBeenCalledExactlyOnceWith('event', 'web_feature_used', { feature_name: 'web_edit' });
  });
  it('queues the initial read before AnalyticsLoader mounts', () => {
    const target = browser() as ReturnType<typeof browser> & { gtag: ReturnType<typeof vi.fn> };
    trackWebFeature('web_view');
    target.gtag = vi.fn(); flushWebFeatures(); flushWebFeatures();
    expect(target.gtag).toHaveBeenCalledExactlyOnceWith('event', 'web_feature_used', { feature_name: 'web_view' });
  });
  it('respects opt out, excludes desktop, preview and development', () => {
    const gtag = vi.fn();
    for (const extra of [{ 'ga-disable-G-MGPKF0MQH4': true }, { __TAURI__: {} }, { location: { hostname: 'preview.vercel.app' } }]) {
      browser({ gtag, ...extra }); trackWebFeature('web_view');
    }
    browser({ gtag }); vi.stubEnv('NODE_ENV', 'development'); trackWebFeature('web_view');
    expect(gtag).not.toHaveBeenCalled();
  });
  it('analytics failures do not fail a saved operation', () => {
    browser({ gtag: () => { throw new Error('blocked'); } });
    expect(() => trackWebFeature('web_create')).not.toThrow();
  });
});
