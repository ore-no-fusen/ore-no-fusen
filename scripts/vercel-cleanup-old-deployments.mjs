// Vercel の古いデプロイを一括削除するスクリプト
// 残すのは「最新の Production デプロイ」だけ。それ以外（古い Production と全 Preview）を消す。
// 消えるのは「昔の版に戻すための控え」だけ。GitHub のソースや、今の本番データには影響しない。
//
// 使い方（PCのターミナルで、Node が入っている場所ならどこでも）:
//   1. Vercel のトークンを作る: https://vercel.com/account/tokens → Create Token（有効期限は短めでOK）
//   2. まず確認だけ（何も消えない）:
//        Windows PowerShell:  $env:VERCEL_TOKEN="作ったトークン"; node vercel-cleanup-old-deployments.mjs
//        Mac/Linux:           VERCEL_TOKEN=作ったトークン node vercel-cleanup-old-deployments.mjs
//   3. 本当に消す:
//        同じコマンドの末尾に --delete を付ける
//
// チームID・プロジェクトIDは自動で探す（プロジェクト名 ore-no-fusen）。

const token = process.env.VERCEL_TOKEN;
if (!token) { console.error('VERCEL_TOKEN が未設定です'); process.exit(1); }
const doDelete = process.argv.includes('--delete');
const PROJECT_NAME = 'ore-no-fusen';

async function api(path, init = {}) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// チーム（個人アカウントなら teamId なしでも動くよう、まずチーム一覧を引く）
let teamId = '';
const teams = await api('/v2/teams').catch(() => ({ teams: [] }));
if (teams.teams?.length) teamId = teams.teams[0].id;
const q = teamId ? `?teamId=${teamId}` : '';
const sep = teamId ? '&' : '?';

// プロジェクト特定
const projects = await api(`/v9/projects${q}`);
const project = (projects.projects || []).find(p => p.name === PROJECT_NAME);
if (!project) { console.error(`プロジェクト ${PROJECT_NAME} が見つかりません`); process.exit(1); }
console.log(`プロジェクト: ${project.name} (${project.id})`);

// 全デプロイを取得（ページング）
let deployments = [], until = '';
while (true) {
  const page = await api(`/v6/deployments${q}${sep}projectId=${project.id}&limit=100${until ? `&until=${until}` : ''}`);
  const list = page.deployments || [];
  deployments.push(...list);
  if (!page.pagination?.next) break;
  until = page.pagination.next;
}
console.log(`デプロイ総数: ${deployments.length}`);

// 残すもの: target=production のうち最新1件
const prod = deployments.filter(d => d.target === 'production')
  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
const keep = prod[0];
const targets = deployments.filter(d => d !== keep);
console.log(`残す: ${keep ? `${keep.url} (${new Date(keep.createdAt).toISOString()})` : 'なし'}`);
console.log(`削除対象: ${targets.length} 件`);

if (!doDelete) {
  console.log('\nこれは確認モードです。実際には消していません。消すには --delete を付けて再実行してください。');
  process.exit(0);
}
let ok = 0, ng = 0;
for (const d of targets) {
  try { await api(`/v13/deployments/${d.uid || d.id}${q}`, { method: 'DELETE' }); ok++; }
  catch (e) { ng++; console.error(`失敗: ${d.url} ${e.message}`); }
}
console.log(`削除完了: ${ok} 件 / 失敗: ${ng} 件`);
