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
