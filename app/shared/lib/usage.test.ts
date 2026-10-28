import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushWebFeatures, isWebUsageExcluded, setWebUsageExcluded, trackWebFeature } from './usage';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function browser(extra = {}) {
  const target = { location: { hostname: 'ore-no-fusen.vercel.app' }, localStorage: { getItem: () => null, setItem: vi.fn() }, ...extra };
  vi.stubGlobal('window', target); vi.stubEnv('NODE_ENV', 'production');
  return target;
}
describe('Web usage', () => {
  it('excludes future events and queued events when test-browser exclusion is saved', () => {
    let value: string | null = null;
    const target = browser({localStorage:{getItem:()=>value,setItem:(_key:string,next:string)=>{value=next;}}}) as ReturnType<typeof browser> & {gtag:ReturnType<typeof vi.fn>};
    trackWebFeature('web_view'); setWebUsageExcluded(true);
    target.gtag=vi.fn(); flushWebFeatures(); trackWebFeature('web_login_start');
    expect(isWebUsageExcluded()).toBe(true); expect(target.gtag).not.toHaveBeenCalled();
    setWebUsageExcluded(false); trackWebFeature('web_list_loaded');
    expect(target.gtag).toHaveBeenCalledExactlyOnceWith('event','web_feature_used',{feature_name:'web_list_loaded'});
  });
  it('does not report a preference as saved when storage fails, and suppresses events when storage cannot be read',()=>{
    browser({localStorage:{getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}}});
    expect(isWebUsageExcluded()).toBe(true); expect(()=>setWebUsageExcluded(true)).toThrow('blocked');
  });
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
