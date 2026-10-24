export type WebSyncProgress={stage:string;completed:number;total:number};
export function formatWebSyncProgress(value:unknown,english=false):string|null {
 const labels:Record<string,[string,string]>={history:['共有状態を確認中','Checking shared notes'],migration:['共有状態を準備中','Preparing shared notes'],cleanup:['不要な記録を整理中','Cleaning obsolete records'],apply:['付箋を同期中','Syncing notes']};
 if(typeof value==='string')return value==='history'?(english?'Reading shared history…':'共有記録を取得しています…'):value==='apply'?(english?'Checking and syncing notes…':'付箋を確認して同期しています…'):null;
 if(!value||typeof value!=='object')return null;
 const p=value as WebSyncProgress,label=labels[p.stage];
 if(!label||!Number.isSafeInteger(p.completed)||!Number.isSafeInteger(p.total)||p.completed<0||p.total<0||p.completed>p.total)return null;
 return label[english?1:0]+' '+p.completed+' / '+p.total;
}
