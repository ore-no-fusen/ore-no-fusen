import type { ShareScope } from './web-share-contract';

export type LauncherOrder = { schemaVersion: 1; accountSubject: string; pcId: string; name: string; entries: {noteId: string; generation: number}[] };
export function parseLauncherOrder(value: unknown, filename: string, account: string): LauncherOrder {
  const r = value as LauncherOrder;
  if (!r || r.schemaVersion !== 1 || r.accountSubject !== account || typeof r.pcId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(r.pcId) || filename !== `web-order-${r.pcId}.json` ||
      typeof r.name !== 'string' || !r.name.trim() || new TextEncoder().encode(r.name).length > 512 || /\p{Cc}/u.test(r.name) ||
      !Array.isArray(r.entries) || r.entries.length > 10_000 || r.entries.some(e => !e || typeof e.noteId !== 'string' || !e.noteId ||
        new TextEncoder().encode(e.noteId).length > 256 || /[\p{Cc}/\\]/u.test(e.noteId) || !Number.isInteger(e.generation) || e.generation < 1 || e.generation > 0xffff_ffff) ||
      new Set(r.entries.map(e => e.noteId)).size !== r.entries.length) throw new Error('PCの表示順を確認できません。前回の一覧を保持しました。');
  return r;
}

/** Sort a projection, preserving selection indexes and every note. Unknown/new
 * generations follow ranked notes; missing/revoked entries create no rows. */
export function applyLauncherOrder<T extends {scope: ShareScope}>(notes: T[], order?: LauncherOrder): T[] {
  if (!order) return [...notes];
  const ranks = new Map(order.entries.map((e, i) => [JSON.stringify([e.noteId,e.generation]), i]));
  return notes.map((note, i) => ({note,i,rank:note.scope.accountSubject === order.accountSubject
    ? ranks.get(JSON.stringify([note.scope.noteId,note.scope.generation])) ?? Infinity : Infinity}))
    .sort((a,b) => a.rank-b.rank || a.i-b.i).map(e=>e.note);
}
