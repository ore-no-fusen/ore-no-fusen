const REPO = 'ore-no-fusen/ore-no-fusen';
const wait = message => { throw new Error(`${message}。GitHubで全CI成功を確認してCreate a merge commitでPRをマージ後、同じボタンで再開してください。`); };

export function assertChecks(checks, statuses = []) {
  if (!checks.some(c => c.name === 'CI gate' && c.app?.id === 15368 && c.status === 'completed' && c.conclusion === 'success')) throw new Error('最新コミットのGitHub Actions CI gate成功を確認できません。');
  if (checks.some(c => c.status !== 'completed' || !['success', 'skipped', 'neutral'].includes(c.conclusion)) || statuses.some(s => s.state !== 'success')) throw new Error('最新コミットに未完了・失敗・キャンセルされたチェックがあります。');
}

// PR merges remain explicit operations in GitHub. No admin flag, bypass or protected-branch push.
export class ReleaseGitHub {
  constructor(machine) { this.m = machine; }
  async api(route) { return JSON.parse(await this.m.cmd('gh', ['api', `repos/${REPO}/${route}`])); }
  async assertOrigin() {
    const url = await this.m.git(['remote', 'get-url', 'origin'], this.m.root, false);
    if (!/^(?:https:\/\/github\.com\/|git@github\.com:)ore-no-fusen\/ore-no-fusen(?:\.git)?$/.test(url.trim())) throw new Error('originが正規リポジトリと一致しません。');
  }
  async assertCommitChecks(sha) {
    await this.assertOrigin();
    const checks = await this.api(`commits/${sha}/check-runs?per_page=100`);
    const statuses = await this.api(`commits/${sha}/status?per_page=100`);
    // Do not silently truncate a large result set.
    if (checks.total_count > checks.check_runs.length || statuses.total_count > statuses.statuses.length) throw new Error('CI一覧が100件を超えています。手動確認が必要です。');
    assertChecks(checks.check_runs, statuses.statuses);
    const runs = await this.api(`actions/runs?head_sha=${sha}&event=push&per_page=100`);
    if (runs.total_count > runs.workflow_runs.length || !runs.workflow_runs.some(r => r.name === 'Test' && r.head_sha === sha && r.status === 'completed' && r.conclusion === 'success') || runs.workflow_runs.some(r => r.status !== 'completed' || r.conclusion !== 'success')) throw new Error('統合コミットのpush後CIが全成功していません。完了後に再開してください。');
  }
  async pr(key, head, base, expectedHead) {
    const m = this.m;
    if (!m.state[key]) {
      const list = JSON.parse(await m.cmd('gh', ['pr', 'list', '--repo', REPO, '--head', head, '--base', base, '--state', 'all', '--json', 'number,url,headRefOid', '--limit', '100'])).filter(p => p.headRefOid === expectedHead);
      if (list.length > 1) throw new Error('対応PRが複数あります。手動確認が必要です。');
      if (list.length) m.state[key] = list[0];
      else {
        const url = await m.cmd('gh', ['pr', 'create', '--repo', REPO, '--head', head, '--base', base, '--title', `release: v${m.state.version} ${base}へ検証済みソースを反映`, '--body', 'リリースマシンによる正規PRです。全適用対象CIの成功後に通常のマージを実施してください。保護回避・直接pushは禁止。実機合格exeとソースの一致を再開時に検証します。']);
        const number = Number(url.trim().match(/\/pull\/(\d+)$/)?.[1]);
        if (!number) throw new Error('作成PRの番号を取得できません。');
        m.state[key] = { number, url: url.trim() };
      }
      m.save();
    }
    const pr = await this.api(`pulls/${m.state[key].number}`);
    if (pr.base.ref !== base || pr.head.ref !== head || pr.head.sha !== expectedHead) throw new Error('PRの対象・最新コミットが確認対象と一致しません。');
    if (!pr.merged) {
      if (pr.state !== 'open') throw new Error('リリースPRが未統合のまま閉じられています。');
      wait(`PR確認待ち: ${pr.html_url}`);
    }
    return pr.merge_commit_sha;
  }
  async assertTree(ref) {
    if (await this.m.git(['rev-parse', `${ref}^{tree}`]) !== await this.m.git(['rev-parse', `${this.m.state.candidate}^{tree}`])) throw new Error('統合結果のソースが実機確認した候補と異なります。STEP 0へ戻ってください。');
  }
  async integrate() {
    const m = this.m;
    if (m.state.protocol !== 'protected-pr-v1') throw new Error('旧直接push方式の記録です。手動引継ぎが必要です。');
    await this.assertOrigin(); await m.git(['fetch', 'origin']);
    // Push only the immutable candidate branch. Never overwrite an existing different head.
    const ref = `refs/heads/${m.state.releaseBranch}`;
    const existing = (await m.git(['ls-remote', 'origin', ref])).split(/\s/)[0];
    if (existing && existing !== m.state.candidate) throw new Error('リリース作業ブランチが変更されています。');
    if (!existing) await m.git(['push', 'origin', `${m.state.candidate}:${ref}`]);
    const main = await this.pr('mainPR', m.state.releaseBranch, 'main', m.state.candidate);
    await m.git(['fetch', 'origin']);
    if (await m.git(['rev-parse', 'origin/main']) !== main) throw new Error('mainが統合したリリースから変わっています。');
    await this.assertTree(main);
    try { await m.git(['merge-base', '--is-ancestor', m.state.candidate, main]); }
    catch { throw new Error('mainは候補を含むmerge commit方式で統合する必要があります。履歴を変更せず手動で確認してください。'); }
    await this.assertCommitChecks(main);
    const develop = await this.pr('developPR', 'main', 'develop', main);
    await m.git(['fetch', 'origin']);
    if (await m.git(['rev-parse', 'origin/develop']) !== develop || await m.git(['rev-parse', 'origin/main']) !== main) throw new Error('リリース統合後に共有ブランチが変わっています。');
    await this.assertTree(develop); await this.assertCommitChecks(develop);
    await m.clean();
    await m.git(['merge-base', '--is-ancestor', await m.head(), develop]);
    // Record the accepted local head before the replayable fast-forward.
    m.state.syncedDevelop = develop; m.save();
    await m.git(['merge', '--ff-only', develop]);
    m.state.releaseMain = main; m.save();
  }
}
