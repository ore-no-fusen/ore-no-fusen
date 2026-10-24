import {expect,it} from 'vitest';
import {formatWebSyncProgress} from './webSyncProgress';
it('shows real completed/total counts and the processing stage',()=>{
 expect(formatWebSyncProgress({stage:'history',completed:8,total:22})).toBe('共有状態を確認中 8 / 22');
 expect(formatWebSyncProgress({stage:'apply',completed:3,total:12},true)).toBe('Syncing notes 3 / 12');
 expect(formatWebSyncProgress({stage:'cleanup',completed:0,total:0})).toBe('不要な記録を整理中 0 / 0');
});
it('ignores malformed or impossible progress and accepts earlier app events',()=>{
 for(const p of [null,{}, {stage:'apply',completed:2,total:1},{stage:'apply',completed:-1,total:2},{stage:'apply',completed:1.2,total:2}])expect(formatWebSyncProgress(p)).toBeNull();
 expect(formatWebSyncProgress('history')).toContain('共有記録');
});
