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
  it('案内前・未回答・保留を別々に保存し、同意や機能履歴を作らない',async()=>{
    const db=new MemoryDb(),service=new MemberService(db);
    await service.register(auth);
    for(const status of ['not_presented','unanswered','postponed'] as const){
      await service.recordUsage(auth,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,status);
      const member=(await db.get<any>(`members/${auth.memberId}`))!.value;
      expect(member.usageConsent).toBeNull();
      expect(member.usageConsentStatus).toBe(status);
      expect(member.partnerStars).toBe(0);
      expect(member.usageFeatures).toBeUndefined();
      expect(await db.list('usage_history')).toHaveLength(0);
    }
    await service.recordUsage(auth,'2026-W43',[],false,0,3);
    expect((await db.get<any>(`members/${auth.memberId}`))!.value).toMatchObject({usageConsent:false,usageConsentStatus:'denied'});
  });
  it('assigns a sequential public number and a separate stable analysis id',async()=>{
    const service=new MemberService(new MemoryDb(),()=>new Date('2026-09-05T00:00:00Z'));
    const first=await service.register(auth); const retry=await service.register(auth);
    expect(first.generalNumber).toBe(10000); expect(first.analyticsSubject).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(retry.analyticsSubject).toBe(first.analyticsSubject); expect(first).not.toHaveProperty('secretHash');
  });
  it('starts every member with zero partner stars',async()=>{
    const service=new MemberService(new MemoryDb(),()=>new Date('2026-09-05T00:00:00Z'));
    expect((await service.register(auth)).partnerStars).toBe(0);
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
  it('登録前のお便りを新規会員へ返さず、共有一覧でも既存会員の配信を維持する', async () => {
    const db = new MemoryDb();
    let now = new Date('2026-09-01T00:00:00Z');
    const service = new MemberService(db, () => now);
    await service.register(auth);
    const newer = { memberId: '123e4567-e89b-42d3-a456-426614174001', secretToken: 'b'.repeat(43) };
    now = new Date('2026-10-21T00:00:00Z');
    await service.register(newer);
    for (const [id, createdAt] of [
      ['old', '2026-09-27T00:00:00Z'],
      ['before', '2026-10-20T23:59:59.999Z'],
      ['boundary', '2026-10-21T09:00:00+09:00'],
      ['after', '2026-10-21T00:00:00.001Z'],
      ['invalid', 'unknown'],
      ['future', '2026-10-23T00:00:00Z'],
    ]) db.rows.set(`announcements/${id}`, { version: '1', value: {
      title: id, body: id, segment: 'all', active: true, createdAt, expiresAt: '2026-12-01T00:00:00Z',
    } });
    now = new Date('2026-10-22T00:00:00Z');
    // Exercise the same shared-list path as Firestore's delivery cache.
    const cachedDb: MemberDatabase = {
      get: db.get.bind(db), commit: db.commit.bind(db), list: db.list.bind(db), remove: db.remove.bind(db),
      deliveryAnnouncements: <T,>() => db.list<T>('announcements'),
    };
    const cachedService = new MemberService(cachedDb, () => now);
    for (const source of [service, cachedService]) {
      for (const read of [source.announcements.bind(source), source.heartbeat.bind(source)]) {
        expect((await read(newer)).announcements.map(a => a.title)).toEqual(['boundary', 'after']);
        expect((await read(auth)).announcements.map(a => a.title)).toEqual(['old', 'before', 'boundary', 'after']);
      }
    }
    const before = JSON.stringify([...db.rows]);
    await service.register(newer); // Re-registration must not move the original cutoff.
    expect((await service.announcements(newer)).announcements.map(a => a.title)).toEqual(['boundary', 'after']);
    expect(JSON.stringify([...db.rows])).toBe(before);
  });

  it('checks letters without changing the daily member report and authenticates before reading', async () => {
    const db = new MemoryDb();
    const service = new MemberService(db, () => new Date('2026-10-12T12:00:00Z'));
    await service.register(auth);
    await service.heartbeat(auth);
    for (const [id, segment, active, expiresAt] of [
      ['personal', 'member:10000', true, '2026-11-01T00:00:00Z'],
      ['other', 'member:10001', true, '2026-11-01T00:00:00Z'],
      ['stopped', 'all', false, '2026-11-01T00:00:00Z'],
      ['expired', 'all', true, '2026-10-12T12:00:00Z'],
    ] as const) db.rows.set(`announcements/${id}`, { version: '1', value: {
      title: id, body: id, segment, active, expiresAt, createdAt: '2026-10-12T12:00:00Z',
    } });
    const before = JSON.stringify([...db.rows]);
    expect((await service.announcements(auth)).announcements.map(a => a.title)).toEqual(['personal']);
    expect(JSON.stringify([...db.rows])).toBe(before);
    await expect(service.announcements({ ...auth, secretToken: 'b'.repeat(43) })).rejects.toMatchObject({ status: 403 });
  });
  it('accepts launcher usage only from the measured schema and resets support for old reports', async () => {
    const db = new MemoryDb();
    const service = new MemberService(db, () => new Date('2026-10-11T00:00:00Z'));
    await service.register(auth);
    await service.heartbeat(auth, '2026-W41', ['launcher_store'], true, 10, '5.7.0', 2);
    expect((await db.get<any>(`members/${auth.memberId}`))!.value).toMatchObject({ usageSchema: 2, usageFeatures: ['launcher_store'] });
    await expect(service.recordUsage(auth, '2026-W41', ['launcher_store'], true, 10)).rejects.toMatchObject({ status: 400 });
    await expect(service.recordUsage(auth, '2026-W41', [], true, 10, 99)).rejects.toMatchObject({ status: 400 });
    await service.recordUsage(auth, '2026-W41', [], true, 10, 2);
    expect((await db.get<any>(`members/${auth.memberId}`))!.value).toMatchObject({ usageSchema: 2, usageFeatures: ['launcher_store'] });
    await service.recordUsage(auth, '2026-W41', [], false, 10);
    expect((await db.get<any>(`members/${auth.memberId}`))!.value).toMatchObject({ usageSchema: 1, usageConsent: false });
  });

  it('does not let a second same-week heartbeat overwrite features or measurement support',async()=>{
    const db=new MemoryDb(),service=new MemberService(db,()=>new Date('2026-10-12T12:00:00Z'));
    await service.register(auth);
    await service.heartbeat(auth,'2026-W41',['launcher_store'],true,0,'5.8.0',3);
    await service.heartbeat(auth,'2026-W41',['note_edited'],true,0,'5.7.0',2);
    expect((await db.get<any>(`members/${auth.memberId}`))!.value).toMatchObject({usageSchema:3,usageWeek:'2026-W41',usageFeatures:['launcher_store','note_edited']});
  });
  it('preserves the communication instant across Japan midnight', async () => {
    const db = new MemoryDb();
    let instant = new Date('2026-10-10T14:59:59Z');
    const service = new MemberService(db, () => instant);
    await service.register(auth);
    await service.heartbeat(auth);
    expect((await db.get<any>(`members/${auth.memberId}`))!.value.lastSeenTimestamp).toBe('2026-10-10T14:59:59.000Z');
    instant = new Date('2026-10-10T15:00:00Z');
    await service.heartbeat(auth);
    expect((await db.get<any>(`members/${auth.memberId}`))!.value).toMatchObject({ lastSeenAt: '2026-10-10', lastSeenTimestamp: '2026-10-10T15:00:00.000Z' });
  });
  it('stores the consented usage snapshot with the heartbeat in one member update', async () => {
    const db = new MemoryDb();
    const service = new MemberService(db, () => new Date('2026-09-23T12:00:00Z'));
    await service.register(auth);
    await service.heartbeat(auth, '2026-W39', ['note_edited', 'note_edited'], true, 1440, '5.5.1');
    expect((await db.get<any>(`members/${auth.memberId}`))!.value).toMatchObject({
      lastSeenAt: '2026-09-23', appVersion: '5.5.1', usageWeek: '2026-W39', usageFeatures: ['note_edited'], usageConsent: true, usageOpenMinutes: 1440,
    });
    await expect(service.heartbeat(auth, '2026-W39', ['invalid'], true, 1440)).rejects.toMatchObject({ status: 400 });
  });

  it('does not let a delayed previous-week device report roll back the latest compatible snapshot',async()=>{
    const db=new MemoryDb(),service=new MemberService(db,()=>new Date('2026-10-20T12:00:00Z'));
    await service.register(auth);
    await service.recordUsage(auth,'2026-W42',['tag_add'],true,10,3);
    await service.recordUsage(auth,'2026-W41',['note_edited'],true,5,2);
    expect((await db.get<any>(`members/${auth.memberId}`))!.value).toMatchObject({usageWeek:'2026-W42',usageFeatures:['tag_add'],usageSchema:3});
  });

  it('archives consented daily history idempotently per installation and retains same-week features', async()=>{
    const db=new MemoryDb(),service=new MemberService(db,()=>new Date('2026-10-12T12:00:00Z'));
    await service.register(auth);
    const history={week:'2026-W41',schema:3,appVersion:'5.8.0',supportedFeatures:['note_edited','tag_add'],measurementStartedAt:'2026-10-01T10:00:00Z',features:{note_edited:{count:1,activeDays:['2026-10-12'],lastUsedDay:'2026-10-12',firstUsedAt:'2026-10-12T11:00:00Z',lastUsedAt:'2026-10-12T11:00:00Z'}},days:{'2026-10-12':{observedAt:'2026-10-12T10:00:00Z',observedThrough:'2026-10-12T12:00:00Z',supportedFeatures:['note_edited','tag_add'],features:{note_edited:{count:1,activeDays:['2026-10-12'],lastUsedDay:'2026-10-12',firstUsedAt:'2026-10-12T11:00:00Z',lastUsedAt:'2026-10-12T11:00:00Z'}}}}};
    const reporter='123e4567-e89b-42d3-a456-426614174000';
    await service.recordUsage(auth,'2026-W41',['note_edited'],true,1,3,[history],reporter,'2026-10-12T11:00:00Z');
    await service.recordUsage(auth,'2026-W41',['tag_add'],true,1,3,[{...history,features:{tag_add:{count:1,activeDays:['2026-10-12'],lastUsedDay:'2026-10-12',firstUsedAt:'2026-10-12T11:30:00Z',lastUsedAt:'2026-10-12T11:30:00Z'}},days:{'2026-10-12':{...history.days['2026-10-12'],features:{tag_add:{count:1,activeDays:['2026-10-12'],lastUsedDay:'2026-10-12',firstUsedAt:'2026-10-12T11:30:00Z',lastUsedAt:'2026-10-12T11:30:00Z'}}}}}],reporter,'2026-10-12T11:00:00Z');
    const subject=(await db.get<any>(`members/${auth.memberId}`))!.value.analyticsSubject;
    const rows=await db.list<any>('usage_history');
    expect(rows).toHaveLength(1);
    expect(rows[0].value.analyticsSubject).toBe(subject);
    expect(rows[0].value.reports[reporter].days['2026-10-12'].features).toHaveProperty('note_edited');
    expect(rows[0].value.reports[reporter].days['2026-10-12'].features).toHaveProperty('tag_add');
    expect(rows[0].value.reports[reporter].features).toHaveProperty('note_edited');
    expect(rows[0].value.reports[reporter].features).toHaveProperty('tag_add');
    expect((await db.get<any>(`members/${auth.memberId}`))!.value.usageFeatures).toEqual(['note_edited','tag_add']);
    await service.recordUsage(auth,'2026-W41',[],false,0,3);
    expect(await db.list<any>('usage_history')).toHaveLength(0);
    expect((await db.get<any>(`members/${auth.memberId}`))!.value).toMatchObject({usageConsent:false,usageFeatures:[]});
    expect((await db.get<any>(`members/${auth.memberId}`))!.value.firstRealUseAt).toBeUndefined();
  });

  it('keeps reports from multiple installations separate and rejects malformed or unsupported history',async()=>{
    const db=new MemoryDb(),service=new MemberService(db,()=>new Date('2026-10-12T12:00:00Z'));
    await service.register(auth);
    const report={week:'2026-W41',schema:3,appVersion:'5.8.0',supportedFeatures:['note_edited'],features:{},days:{'2026-10-12':{observedAt:'2026-10-12T10:00:00Z',observedThrough:'2026-10-12T12:00:00Z',supportedFeatures:['note_edited'],features:{}}}};
    await service.recordUsage(auth,'2026-W41',[],true,0,3,[report],'123e4567-e89b-42d3-a456-426614174000',null);
    await service.recordUsage(auth,'2026-W41',[],true,0,3,[report],'123e4567-e89b-42d3-a456-426614174001',null);
    const stored=await db.list<any>('usage_history'); expect(stored).toHaveLength(2);
    await expect(service.recordUsage(auth,'2026-W41',[],true,0,3,[{...report,days:{'2026-10-12':{observedAt:'2026-10-12T10:00:00Z',observedThrough:'2026-10-12T12:00:00Z',supportedFeatures:['note_edited'],features:{private_note:{count:1}}}}}],'123e4567-e89b-42d3-a456-426614174002',null)).rejects.toMatchObject({status:400});
  });

  it('stores unknown consent separately from refusal and clears previously consented reports without usage fields',async()=>{
    const db=new MemoryDb(),service=new MemberService(db,()=>new Date('2026-10-12T12:00:00Z'));
    await service.register(auth);
    const report={week:'2026-W41',schema:3,appVersion:'5.8.0',supportedFeatures:['note_edited'],features:{},days:{'2026-10-12':{observedAt:'2026-10-12T10:00:00Z',observedThrough:'2026-10-12T12:00:00Z',supportedFeatures:['note_edited'],features:{}}}};
    await service.recordUsage(auth,'2026-W41',[],true,0,3,[report],'123e4567-e89b-42d3-a456-426614174000',null,'granted');
    expect(await db.list<any>('usage_history')).toHaveLength(1);
    await service.recordUsage(auth,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,'unknown');
    expect(await db.list<any>('usage_history')).toHaveLength(0);
    expect((await db.get<any>(`members/${auth.memberId}`))!.value).toMatchObject({usageConsent:null});
    expect((await db.get<any>(`members/${auth.memberId}`))!.value.usageFeatures).toBeUndefined();
  });

  it('deletes saved history when a heartbeat carries an explicit refusal',async()=>{
    const db=new MemoryDb(),service=new MemberService(db,()=>new Date('2026-10-12T12:00:00Z'));
    await service.register(auth);
    const report={week:'2026-W41',schema:3,appVersion:'5.8.0',supportedFeatures:['note_edited'],features:{},days:{'2026-10-12':{observedAt:'2026-10-12T10:00:00Z',observedThrough:'2026-10-12T12:00:00Z',supportedFeatures:['note_edited'],features:{}}}};
    await service.recordUsage(auth,'2026-W41',[],true,0,3,[report],'123e4567-e89b-42d3-a456-426614174000',null);
    expect(await db.list<any>('usage_history')).toHaveLength(1);
    await service.heartbeat(auth,'2026-W41',[],false,0,'5.8.0',3);
    expect(await db.list<any>('usage_history')).toHaveLength(0);
    expect((await db.get<any>(`members/${auth.memberId}`))!.value).toMatchObject({usageConsent:false,usageFeatures:[]});
  });

  it('records the version without analytics consent and treats old clients as unreported', async () => {
    const db = new MemoryDb();
    const service = new MemberService(db, () => new Date('2026-09-23T12:00:00Z'));
    await service.register(auth);
    await service.heartbeat(auth, '2026-W39', [], false, 0, '5.5.1');
    expect((await db.get<any>(`members/${auth.memberId}`))!.value.appVersion).toBe('5.5.1');
    await expect(service.heartbeat(auth, '2026-W39', [], false, 0, '<script>')).rejects.toMatchObject({ status: 400 });
    await service.heartbeat(auth, '2026-W39', [], false, 0);
    expect((await db.get<any>(`members/${auth.memberId}`))!.value.appVersion).toBeUndefined();
  });

  it('updates lastSeenAt and returns active announcements', async () => {
    const db = new MemoryDb();
    const service = new MemberService(db, () => new Date('2026-09-23T12:00:00Z'));

    // まず会員登録
    await service.register(auth);

    // お便りを追加
    db.rows.set('announcements/test1', {
      value: {
        title: 'テスト', body: 'こんにちは', segment: 'all',
        active: true, createdAt: '2026-09-23T12:00:00Z',
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
        active: true, createdAt: '2026-09-23T12:00:00Z',
        expiresAt: '2026-01-31T23:59:59Z', // 過去
      },
      version: '1',
    });
    db.rows.set('announcements/inactive', {
      value: {
        title: '無効', body: '', segment: 'all',
        active: false, createdAt: '2026-09-23T12:00:00Z',
        expiresAt: '2026-12-31T23:59:59Z',
      },
      version: '1',
    });

    const result = await service.heartbeat(auth);
    expect(result.announcements).toHaveLength(0);
  });

  it('returns a member-number message only to its authenticated recipient', async () => {
    const db = new MemoryDb();
    const service = new MemberService(db, () => new Date('2026-09-23T12:00:00Z'));
    const otherAuth = { memberId: '123e4567-e89b-42d3-a456-426614174001', secretToken: 'b'.repeat(43) };
    const first = await service.register(auth);
    await service.register(otherAuth);
    db.rows.set('announcements/personal', { value: {
      title: '個別', body: '個別の本文', segment: `member:${first.generalNumber}`,
      active: true, createdAt: '2026-09-23T12:00:00Z', expiresAt: '2026-12-31T23:59:59Z',
    }, version: '1' });
    db.rows.set('announcements/newcomers', { value: {
      title: '新規向け', body: '対象外', segment: 'newcomer',
      active: true, createdAt: '2026-09-23T12:00:00Z', expiresAt: '2026-12-31T23:59:59Z',
    }, version: '1' });
    db.rows.set('announcements/unknown', { value: {
      title: '不明な宛先', body: '対象外', segment: 'not-a-segment',
      active: true, createdAt: '2026-09-23T12:00:00Z', expiresAt: '2026-12-31T23:59:59Z',
    }, version: '1' });
    expect((await service.heartbeat(auth)).announcements.map(a => a.title)).toEqual(['個別']);
    expect((await service.heartbeat(otherAuth)).announcements).toEqual([]);
  });

  it('passes valid local feature audiences to the app and rejects unknown feature names', async () => {
    const db = new MemoryDb();
    const service = new MemberService(db, () => new Date('2026-09-23T12:00:00Z'));
    await service.register(auth);
    for (const [id, segment] of [
      ['weekly', 'feature_week_unused:iphone_send'],
      ['iphone-week', 'iphone_week_unused'],
      ['unknown', 'feature_week_unused:not_a_feature'],
    ]) {
      db.rows.set(`announcements/${id}`, { value: {
        title: id, body: 'body', segment, active: true,
        createdAt: '2026-09-23T12:00:00Z', expiresAt: '2026-12-31T23:59:59Z',
      }, version: '1' });
    }
    expect((await service.heartbeat(auth)).announcements.map(a => a.title)).toEqual(['weekly', 'iphone-week']);
  });
});

describe('improvement partner stars',()=>{
  it('adds one point per consented week, deduplicates retries, and keeps earned points after stopping',async()=>{
    const db=new MemoryDb(),service=new MemberService(db,()=>new Date('2026-10-12T12:00:00Z'));
    await service.register(auth);
    const first=await service.recordUsage(auth,'2026-W41',[],true,0,3,undefined,undefined,undefined,'granted');
    expect(first).toEqual({saved:true,partnerStars:1});
    expect(await service.recordUsage(auth,'2026-W41',['note_edited'],true,15,3,undefined,undefined,undefined,'granted')).toEqual({saved:true,partnerStars:1});
    expect(await service.recordUsage(auth,'2026-W42',[],true,0,3,undefined,undefined,undefined,'granted')).toEqual({saved:true,partnerStars:2});
    await service.recordUsage(auth,'2026-W50',[],true,0,3,undefined,undefined,undefined,'granted');
    expect((await db.get<any>(`members/${auth.memberId}`))!.value.partnerStars).toBe(2);
    expect(await service.recordUsage(auth,'2026-W42',[],false,0,3,undefined,undefined,undefined,'denied')).toEqual({saved:true,partnerStars:2});
    expect((await db.get<any>(`members/${auth.memberId}`))!.value).toMatchObject({partnerStars:2,partnerLastStarWeek:'2026-W42',usageConsent:false});
  });
  it('does not add stars for unknown consent and returns an already-earned balance',async()=>{
    const db=new MemoryDb(),service=new MemberService(db,()=>new Date('2026-10-12T12:00:00Z'));
    await service.register(auth);
    await service.recordUsage(auth,'2026-W41',[],true,0,3,undefined,undefined,undefined,'granted');
    expect(await service.recordUsage(auth,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,'unknown')).toEqual({saved:true,partnerStars:1});
    expect((await db.get<any>(`members/${auth.memberId}`))!.value.partnerStars).toBe(1);
  });
});

describe('weekly feature usage snapshot', () => {
  it('stores only permitted feature names for a member and clears them after opt out', async () => {
    const db = new MemoryDb();
    const service = new MemberService(db);
    await service.register(auth);
    await service.recordUsage(auth, '2026-W39', ['iphone_send', 'note_edited', 'iphone_send'], true, 480);
    const saved = (await db.get<any>(`members/${auth.memberId}`))!.value;
    expect(saved).toMatchObject({ usageWeek: '2026-W39', usageFeatures: ['iphone_send', 'note_edited'], usageConsent: true, usageOpenMinutes: 480 });
    await expect(service.recordUsage(auth, '2026-W39', ['unknown'], true, 480)).rejects.toMatchObject({ status: 400 });
    await expect(service.recordUsage(auth, '2026-W39', [], true, -1)).rejects.toMatchObject({ status: 400 });
    await service.recordUsage(auth, '2026-W39', ['iphone_send'], true, undefined);
    await service.recordUsage(auth, '2026-W39', [], false, 480);
    const cleared = (await db.get<any>(`members/${auth.memberId}`))!.value;
    expect(cleared).toMatchObject({ usageFeatures: [], usageConsent: false });
    expect(cleared.usageOpenMinutes).toBeUndefined();
  });
});
