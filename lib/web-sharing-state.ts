import type { ShareScope } from './web-share-contract';

export type SharingRecord = {
  schemaVersion: 1;
  scope: ShareScope;
  id: string;
  action: 'pause' | 'resume';
  parents: string[];
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const sharingScopeKey = (scope: ShareScope) => JSON.stringify([scope.accountSubject, scope.noteId, scope.generation]);

export function parseSharingRecord(value: unknown, name: string): SharingRecord {
  const r = value as SharingRecord;
  if (!r || r.schemaVersion !== 1 || !r.scope || typeof r.scope.accountSubject !== 'string' || !r.scope.accountSubject.trim() ||
      typeof r.scope.noteId !== 'string' || !r.scope.noteId.trim() || !Number.isInteger(r.scope.generation) || r.scope.generation < 0 || r.scope.generation > 0xffff_ffff ||
      typeof r.id !== 'string' || !uuid.test(r.id) || name !== `web-sharing-${r.id}.json` ||
      !['pause', 'resume'].includes(r.action) || !Array.isArray(r.parents) || r.parents.some(id => typeof id !== 'string' || !uuid.test(id)) ||
      new Set(r.parents).size !== r.parents.length) throw new Error('Web共有設定を確認できません。安全のため同期を止めました。');
  return r;
}

/** Independent of the content log: concurrent stop wins until explicitly resumed. */
export function sharingState(records: SharingRecord[]): { paused: boolean; heads: string[] } {
  const byId = new Map<string, SharingRecord>();
  for (const r of records) {
    const old = byId.get(r.id);
    if (old && JSON.stringify([old.scope, old.action, [...old.parents].sort()]) !== JSON.stringify([r.scope, r.action, [...r.parents].sort()])) throw new Error('Web共有設定のIDが重複しています。');
    byId.set(r.id, r);
  }
  const parents = new Set<string>(), children = new Map<string, string[]>(), remaining = new Map<string, number>();
  for (const r of byId.values()) {
    remaining.set(r.id, r.parents.length);
    for (const id of r.parents) {
      const parent = byId.get(id);
      if (!parent || sharingScopeKey(parent.scope) !== sharingScopeKey(r.scope)) throw new Error('Web共有設定の履歴が不足しています。');
      parents.add(id);
      children.set(id, [...(children.get(id) ?? []), r.id]);
    }
  }
  const ready = [...remaining.keys()].filter(id => remaining.get(id) === 0);
  let visited = 0;
  while (ready.length) {
    const id = ready.pop()!; visited++;
    for (const child of children.get(id) ?? []) {
      remaining.set(child, remaining.get(child)! - 1);
      if (remaining.get(child) === 0) ready.push(child);
    }
  }
  if (visited !== byId.size) throw new Error('Web共有設定が循環しています。');
  const heads = [...byId.keys()].filter(id => !parents.has(id)).sort();
  return { paused: heads.some(id => byId.get(id)!.action === 'pause'), heads };
}
