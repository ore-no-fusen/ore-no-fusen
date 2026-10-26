(() => {
  const $ = id => document.getElementById(id);
  const token = location.hash.slice(1) || sessionStorage.getItem('release-machine-token');
  if (location.hash) { sessionStorage.setItem('release-machine-token', token); history.replaceState(null, '', location.pathname); }
  let info, key, versionInitialized = false, posting = false, networkError = null, startedAt = null;
  const stages = [ ['main','検証済み候補の準備'], ['build','本番ビルド・保全'], ['dev','開発署名MSIX作成'], ['install','導入・起動'], ['store','Store用MSIX作成'], ['validate','形式・exe一致検証'], ['copy','固定提出先へ保存'], ['open','提出フォルダーを開く'] ];
  async function request(url, body) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000), method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type':'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  }
  function render() {
    if (!info) return;
    const s = info.state, pending = Boolean(s.id) && s.status !== 'complete', locked = info.busy || posting;
    if (key !== s.id) { key = s.id; $('confirmed').checked = false; }
    $('branch').textContent = info.branch; $('current-version').textContent = info.version;
    $('clean').textContent = info.changes.length ? '未保存変更あり' : 'クリーン';
    if (!versionInitialized) { $('version').value = pending ? s.version : info.version.split('.').map((v,i)=>i===2?Number(v)+1:v).join('.'); versionInitialized = true; }
    const complete = s.status === 'complete';
    if (complete) $('version').value = s.version;
    $('version').disabled = pending || locked || complete;
    const blockers = [];
    if (info.readOnly) blockers.push('表示確認モードです。リリース操作は無効です。');
    if (info.branch !== 'develop') blockers.push('基本フォルダーのdevelopから起動してください。');
    if (info.changes.length) blockers.push(`未保存変更があります：${info.changes.join(', ')}`);
    if (info.mainChanges.length) blockers.push(`正式リリースに未保存変更があります：${info.mainChanges.join(', ')}`);
    $('prepare').disabled = complete || locked || blockers.length > 0 || s.status === 'confirm' || (pending && s.operation === 'package');
    $('prepare').textContent = complete ? '✓ 確認用MSIX・実機確認 完了' : s.status === 'failed' && s.operation === 'prepare' ? '🔨 止まった工程から再試行' : '確認用MSIXを作って起動';
    const prepared = s.steps.install?.status === 'done';
    $('confirmed').disabled = !prepared || locked || s.status === 'complete';
    $('package').disabled = !prepared || !$('confirmed').checked || locked || blockers.length > 0 || s.status === 'complete';
    $('package').textContent = complete ? '✓ Store提出準備 完了' : s.status === 'failed' && s.operation === 'package' ? '🚀 止まった工程から再試行' : 'Store用MSIX作成・PR確認';
    if (complete) $('confirmed').checked = true;
    $('gate').textContent = complete ? '次はMicrosoft Store（Partner Center）へ提出します。' : prepared && $('confirmed').checked ? '実機確認済み。同じexeから提出用を作ります。' : '準備完了と実機確認のチェックが必要です。';
    const blocked = Boolean(networkError || s.error || blockers.length);
    $('current').textContent = networkError ? '接続を確認してください' : s.error || s.status === 'failed' ? '処理が止まりました' : info.busy || posting ? (s.current || '処理を開始しています…') : blockers.length ? '今は開始できません' : s.status === 'confirm' ? 'アプリを実機で確認してください' : s.status === 'complete' ? '提出準備ができました' : '準備を開始できます';
    $('notice').textContent = networkError ? '詳しい理由をご確認ください。' : s.error ? (s.current || '開始前の確認で停止しました。') : blockers.length ? (info.readOnly ? '表示確認モードです。' : '未保存の変更や作業環境を確認してください。') : info.busy || posting ? '起動用ウィンドウを閉じずにお待ちください。' : s.status === 'confirm' ? '確認が済んだら、下のチェックを入れてください。' : s.status === 'complete' ? '次はPartner Centerで提出します。' : '①のボタンから進めてください。';
    $('reason').hidden = !blocked;
    $('reason-text').textContent = networkError || s.error || blockers.join('\n');
    document.querySelector('.overview').classList.toggle('warning', blocked);
    document.querySelector('.confirmation').classList.toggle('ready', s.status === 'confirm');
    $('result').hidden = s.status !== 'complete';
    const running = Object.values(s.steps).find(step => step.status === 'running');
    $('elapsed').textContent = running ? `経過 ${Math.floor((Date.now()-new Date(running.started).getTime())/1000)}秒` : '';
    const working = !networkError && (info.busy || posting);
    document.querySelector('.overview').classList.toggle('running', working);
    if (working) {
      startedAt ??= Date.now();
      document.querySelector('.overview').classList.remove('warning');
      $('current').textContent = posting ? '再開要求を送っています…' : `処理中：${s.current || '開始条件を確認しています…'}`;
      $('notice').textContent = '処理は進行中です。起動用ウィンドウを閉じずにお待ちください。';
      $('reason').hidden = true;
      $('elapsed').textContent = `経過 ${Math.floor((Date.now() - (running ? new Date(running.started).getTime() : startedAt))/1000)}秒`;
      $(s.operation === 'package' ? 'package' : 'prepare').textContent = '処理中…';
    } else { startedAt = null; }
    $('steps').replaceChildren(...stages.map(([id,label]) => {
      const li=document.createElement('li'), status=s.steps[id];
      const text=document.createElement('span'); text.textContent=`${status?.status==='done'?'✓':status?.status==='running'?'▶':status?.status==='failed'?'×':'○'} ${label}`;
      const duration=document.createElement('span'); duration.textContent=status?.seconds!==undefined?`${status.seconds.toFixed(1)}秒`:'';li.append(text,duration); return li;
    }));
    const pr = s.developPR || s.mainPR;
    $('pr-link').hidden = !pr;
    if (pr) { $('pr-link').href = pr.url; $('pr-link').textContent = 'GitHubでPRとCIを確認する'; }
    $('log').textContent = info.log || '未開始';
    $('log-path').textContent = s.id ? `${info.dataDir} / runs / ${s.id} / commands.log（timings.jsonl・state.jsonも保存）` : info.dataDir;
    $('destination').textContent = s.destination || `D:\\Users\\uck\\Documents\\俺の付箋-Store提出\\${$('version').value}\\ore-no-fusen.msix`;
    $('complete').hidden=s.status!=='complete';
    const main=s.mainRoot || info.mainRoot || `${info.root}\\.w\\正式リリース`, version=$('version').value || '<版番号>';
    $('prepare-plan').textContent=`① 版番号は先に独立ブランチで更新し、develop宛てPR・CI成功・統合まで完了してください。
② 最新developのCI成功と、版番号5ファイルを検査します。
③ 正式リリース-${version}ワークツリーの作業ブランチで本番exeを1回ビルド・保全します。mainは変更しません。
④ 同じexeから開発署名MSIXを作成・導入・起動します。
実際のパス・コマンドは実行ログを確認してください。`;
    $('package-plan').textContent=`① 合格済みexeからStore用MSIXを作成し、形式・内部exe/resourcesのSHA256を検証します。
② 固定提出先へ保存します。
③ リリース作業ブランチだけpushし、main宛てPRを作成します。表示されたURLで全CI成功後にCreate a merge commitでマージし、このボタンで再開してください。
④ main統合後CIと候補ソースの一致を確認し、main→developの同期PRを作成します。同様にCI成功・マージ後に再開してください。
⑤ 同期後CIとソース一致を確認し、基本フォルダーdevelopをfast-forwardして提出先を開きます。
保護解除・直接push・強制pushは行いません。待機中もMSIX・exe・実機合格記録を保持し、再ビルドしません。`;

  }
  async function poll() {
    try { info = await request('/api/state'); networkError = null; render(); }
    catch(error) { networkError = error.message; $('notice').textContent=networkError; $('current').textContent='接続を確認してください';document.querySelector('.overview').classList.add('warning'); $('prepare').disabled=true; $('package').disabled=true; }
    setTimeout(poll, info?.busy ? 1000 : 2500);
  }
  async function start(action) {
    posting=true;render();
    try { await request(`/api/${action}`, { version:$('version').value, confirmed:$('confirmed').checked }); info = await request('/api/state'); networkError = null; }
    catch(error) { networkError=error.message; }
    finally { posting=false;render(); }
  }
  $('prepare').addEventListener('click',()=>start('prepare')); $('package').addEventListener('click',()=>start('package'));
  $('confirmed').addEventListener('change',render); $('version').addEventListener('input',render);
  poll();
})();
