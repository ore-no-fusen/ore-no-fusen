import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class Channel {
  port1 = { onmessage: null as ((event:{data:unknown})=>void)|null, close: vi.fn() };
  port2 = { postMessage: (data:unknown) => queueMicrotask(()=>this.port1.onmessage?.({data})), close: vi.fn() };
}
const worker=(policy:number)=>({postMessage:vi.fn((_:unknown,ports:{postMessage:(data:unknown)=>void}[])=>ports[0].postMessage({type:'ONF_DRIVE_CACHE_POLICY',driveCachePolicy:policy}))});
beforeEach(()=>{vi.resetModules();vi.stubGlobal('MessageChannel',Channel);vi.stubGlobal('caches',undefined);});
afterEach(()=>{vi.unstubAllGlobals();});

describe('Drive access waits for cache policy',()=>{
  it('does not authorize a different controller that took over during the reply',async()=>{
    const events=new EventTarget();const replacement=worker(0);
    const sw={controller:null as unknown as ReturnType<typeof worker>,getRegistration:async()=>({update:async()=>{throw new Error('offline');}}),addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
    sw.controller={postMessage:vi.fn((_:unknown,ports:{postMessage:(data:unknown)=>void}[])=>{sw.controller=replacement;ports[0].postMessage({type:'ONF_DRIVE_CACHE_POLICY',driveCachePolicy:1});})};
    vi.stubGlobal('navigator',{serviceWorker:sw});
    const {ensureDriveCachePolicy}=await import('./cache-policy');
    await expect(ensureDriveCachePolicy()).rejects.toThrow('offline');
    await expect(ensureDriveCachePolicy()).rejects.toThrow('offline');
    expect(replacement.postMessage).toHaveBeenCalled();
  });
  it('allows an uncontrolled page without creating a worker or clearing unrelated data',async()=>{
    const registration=vi.fn(async()=>undefined);
    vi.stubGlobal('navigator',{serviceWorker:{controller:null,getRegistration:registration}});
    const {ensureDriveCachePolicy}=await import('./cache-policy');
    await ensureDriveCachePolicy();await ensureDriveCachePolicy();
    expect(registration).toHaveBeenCalledTimes(1);
  });
  it('checks the controlling worker and reuses the verified capability',async()=>{
    const controller=worker(1);
    vi.stubGlobal('navigator',{serviceWorker:{controller,getRegistration:async()=>({})}});
    const {ensureDriveCachePolicy}=await import('./cache-policy');
    await ensureDriveCachePolicy();await ensureDriveCachePolicy();
    expect(controller.postMessage).toHaveBeenCalledTimes(1);
  });
  it('updates an old worker and checks the new capability without reload/unregister',async()=>{
    const old=worker(0),current=worker(1);const events=new EventTarget();
    const sw={controller:old,getRegistration:async()=>({update:async()=>{sw.controller=current;events.dispatchEvent(new Event('controllerchange'));}}),addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
    vi.stubGlobal('navigator',{serviceWorker:sw});
    const {ensureDriveCachePolicy}=await import('./cache-policy');
    await ensureDriveCachePolicy();
    expect(old.postMessage).toHaveBeenCalled();expect(current.postMessage).toHaveBeenCalled();
  });
  it('rejects a failed update and permits a later retry',async()=>{
    const controller=worker(0),events=new EventTarget();
    const update=vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('navigator',{serviceWorker:{controller,getRegistration:async()=>({update}),addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)}});
    const {ensureDriveCachePolicy}=await import('./cache-policy');
    await expect(ensureDriveCachePolicy()).rejects.toThrow('offline');
    await expect(ensureDriveCachePolicy()).rejects.toThrow('offline');
    expect(update).toHaveBeenCalledTimes(2);
  });
});
