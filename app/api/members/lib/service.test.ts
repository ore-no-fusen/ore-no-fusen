import { describe, expect, it } from 'vitest';
import type { Change, MemberDatabase, Row } from './database';
import { MemberService } from './service';

class MemoryDb implements MemberDatabase {
  rows=new Map<string,Row>(); version=0;
  async get<T>(path:string){return (this.rows.get(path) as Row<T>|undefined)??null;}
  async commit(changes:Change[]){
    if(changes.some(c=>c.version===null&&this.rows.has(c.path)))return false;
    for(const c of changes)this.rows.set(c.path,{value:c.value,version:String(++this.version)}); return true;
  }
  async list<T>(collection:string){return [...this.rows].filter(([p])=>p.startsWith(`${collection}/`)).map(([path,row])=>({path,...row as Row<T>}));}
  async remove(paths:string[]){for(const path of paths)this.rows.delete(path);}
}
const auth={memberId:'123e4567-e89b-42d3-a456-426614174000',secretToken:'a'.repeat(43)};

describe('member registration',()=>{
  it('assigns a sequential public number and a separate stable analysis id',async()=>{
    const service=new MemberService(new MemoryDb(),()=>new Date('2026-09-05T00:00:00Z'));
    const first=await service.register(auth); const retry=await service.register(auth);
    expect(first.generalNumber).toBe(10000); expect(first.analyticsSubject).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(retry.analyticsSubject).toBe(first.analyticsSubject); expect(first).not.toHaveProperty('secretHash');
  });
  it('looks up only the analysis mapping for one general member number',async()=>{
    const service=new MemberService(new MemoryDb(),()=>new Date('2026-09-05T00:00:00Z'));
    const registered=await service.register(auth);
    await expect(service.lookupByGeneralNumber(registered.generalNumber)).resolves.toEqual({
      generalNumber:10000,
      analyticsSubject:registered.analyticsSubject,
      registeredAt:'2026-09-05T00:00:00.000Z',
      paidNumber:null,
    });
    await expect(service.lookupByGeneralNumber(9999)).rejects.toMatchObject({status:400});
    await expect(service.lookupByGeneralNumber(10001)).rejects.toMatchObject({status:404});
  });
});

describe('member heartbeat', () => {
  it('updates lastSeenAt and returns active announcements', async () => {
    const db = new MemoryDb();
    const service = new MemberService(db, () => new Date('2026-09-23T12:00:00Z'));

    // まず会員登録
    await service.register(auth);

    // お便りを追加
    db.rows.set('announcements/test1', {
      value: {
        title: 'テスト', body: 'こんにちは', segment: 'all',
        active: true, createdAt: '2026-09-23T00:00:00Z',
        expiresAt: '2026-12-31T23:59:59Z',
      },
      version: '1',
    });

    const result = await service.heartbeat(auth);
    expect(result.lastSeenAt).toBe('2026-09-23');
    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0]).toMatchObject({
      id: 'test1', title: 'テスト', segment: 'all',
    });
  });

  it('excludes expired and inactive announcements', async () => {
    const db = new MemoryDb();
    const service = new MemberService(db, () => new Date('2026-09-23T12:00:00Z'));
    await service.register(auth);

    db.rows.set('announcements/expired', {
      value: {
        title: '期限切れ', body: '', segment: 'all',
        active: true, createdAt: '2026-01-01T00:00:00Z',
        expiresAt: '2026-01-31T23:59:59Z', // 過去
      },
      version: '1',
    });
    db.rows.set('announcements/inactive', {
      value: {
        title: '無効', body: '', segment: 'all',
        active: false, createdAt: '2026-09-01T00:00:00Z',
        expiresAt: '2026-12-31T23:59:59Z',
      },
      version: '1',
    });

    const result = await service.heartbeat(auth);
    expect(result.announcements).toHaveLength(0);
  });
});
