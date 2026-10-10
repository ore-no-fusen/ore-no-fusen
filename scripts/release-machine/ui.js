(() => {
  const $ = id => document.getElementById(id);
  const token = location.hash.slice(1) || sessionStorage.getItem('release-machine-token');
  if (location.hash) { sessionStorage.setItem('release-machine-token', token); history.replaceState(null, '', location.pathname); }
  let info, key, versionInitialized = false, posting = false, networkError = null;
  const stages = [ ['version','版番号設定'], ['commit','5ファイル限定コミット'], ['main','main同期'], ['build','本番ビルド・保全'], ['dev','開発署名MSIX作成'], ['install','導入・起動'], ['store','Store用MSIX作成'], ['validate','形式・exe一致検証'], ['copy','固定提出先へ保存'], ['push-main','main反映'], ['push-develop','develop反映'], ['open','提出フォルダーを開く'] ];
  async function request(url, body) {
    const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type':'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  }
  function render() {
    if (!info) return;
    const s = info.state, pending = Boolean(s.id) && s.status !== 'complete', locked = info.busy || posting;
    if (key !== s.id) { key = s.id; $('confirmed').checked = false; }
    $('branch').textContent = info.branch; $('current-version').textContent = info.version;
    $('clean').textContent = info.changes.length ? '未保存変更あり' : 'クリーン';
    if (!versionInitialized) { $('version').value = pending ? s.version : info.version.split('.').map((v,i)=>i===2?Number(v)+1:v).join('.'); versionInitialized = true; }
    $('version').disabled = pending || locked;
    const ownChanges = pending && s.operation === 'prepare' && s.steps.commit?.status !== 'done' && info.changes.every(f => ['package.json','package-lock.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock','packaging/msix/AppxManifest.xml'].includes(f));
    const blockers = [];
    if (info.readOnly) blockers.push('表示確認モードです。リリース操作は無効です。');
    if (info.branch !== 'develop') blockers.push('基本フォルダーのdevelopから起動してください。');
    if (info.changes.length && !ownChanges) blockers.push(`未保存変更があります：${info.changes.join(', ')}`);
    if (info.mainChanges.length) blockers.push(`正式リリースに未保存変更があります：${info.mainChanges.join(', ')}`);
    $('prepare').disabled = locked || blockers.length > 0 || s.status === 'confirm' || (pending && s.operation === 'package');
    $('prepare').textContent = s.status === 'failed' && s.operation === 'prepare' ? '🔨 止まった工程から再試行' : '確認用MSIXを作って起動';
    const prepared = s.steps.install?.status === 'done';
    $('confirmed').disabled = !prepared || locked || s.status === 'complete';
    $('package').disabled = !prepared || !$('confirmed').checked || locked || blockers.length > 0 || s.status === 'complete';
    $('package').textContent = s.status === 'failed' && s.operation === 'package' ? '🚀 止まった工程から再試行' : 'Store用MSIXを作成・Push';
    $('gate').textContent = prepared && $('confirmed').checked ? '実機確認済み。同じexeから提出用を作ります。' : '準備完了と実機確認のチェックが必要です。';
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
    $('steps').replaceChildren(...stages.map(([id,label]) => {
      const li=document.createElement('li'), status=s.steps[id];
      const text=document.createElement('span'); text.textContent=`${status?.status==='done'?'✓':status?.status==='running'?'▶':status?.status==='failed'?'×':'○'} ${label}`;
      const duration=document.createElement('span'); duration.textContent=status?.seconds!==undefined?`${status.seconds.toFixed(1)}秒`:'';li.append(text,duration); return li;
    }));
    $('log').textContent = info.log || '未開始';
    $('log-path').textContent = s.id ? `${info.dataDir} / runs / ${s.id} / commands.log（timings.jsonl・state.jsonも保存）` : info.dataDir;
    $('destination').textContent = s.destination || `D:\\Users\\uck\\Documents\\俺の付箋-Store提出\\${$('version').value}\\ore-no-fusen.msix`;
    $('complete').hidden=s.status!=='complete';
    const main=s.mainRoot || info.mainRoot || `${info.root}\\.w\\正式リリース`, version=$('version').value || '<版番号>';
    $('prepare-plan').textContent=`PowerShellからNode.js・Git・既存PS1を呼びます。\n\n① ${info.root}（develop）\nnode scripts/set-release-version.mjs ${version}\ngit add -- package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock packaging/msix/AppxManifest.xml\ngit diff --cached --check\ngit commit -m "release: v${version} MSIX release candidate"\n※5ファイルが版番号だけの変更か、専用のコミット検証を実行します。\n\n② ${main}（main）\ngit merge --ff-only ${s.candidate || '<候補コミット>'}\n必要なら正式リリース・ワークツリーを作成\n\n③ windows.ps1 -Action Build\n→ npx.cmd tauri build --no-bundle\n→ 完成exe/resourcesをログの保全先へコピー・SHA256記録\n\n④ test-msix.ps1 -SkipBuild -NoInstall -ReleaseDirectory <保全先>\n→ makeappxで梱包・signtoolで開発署名\n\n⑤ windows.ps1 -Action Install\n→ Add-AppxPackage・導入exe照合・アプリ起動\n\n手作業では、下の実行ログの正確なパスとコマンドを使用してください。成功済みの工程は繰り返しません。`;
    $('package-plan').textContent=`① ${main}（main）\nbuild-msix.ps1 -ReleaseDirectory <保全先>\nvalidate-msix.ps1 -PackagePath <作成MSIX> -ExpectedVersion ${version}.0 -ExpectedReleaseDirectory <保全先>\n→ Store形式5項目と内部exe/resourcesのSHA256一致\n\n② 固定提出先へコピー・SHA256照合\n③ git push origin <候補コミット>:refs/heads/main\n④ git push origin <候補コミット>:refs/heads/develop\n⑤ git ls-remoteで両ブランチの反映確認\n⑥ エクスプローラーで提出先を開く\n\nexeは再ビルドしません。別内容の提出物は上書きしません。片方だけpush済みなら残りだけを再試行します。`;
  }
  async function poll() {
    try { info = await request('/api/state'); networkError = null; render(); }
    catch(error) { networkError = error.message; $('notice').textContent=networkError; $('current').textContent='接続を確認してください';document.querySelector('.overview').classList.add('warning'); $('prepare').disabled=true; $('package').disabled=true; }
    setTimeout(poll, info?.busy ? 1000 : 2500);
  }
  async function start(action) {
    posting=true;render();
    try { await request(`/api/${action}`, { version:$('version').value, confirmed:$('confirmed').checked }); }
    catch(error) { networkError=error.message; }
    finally { posting=false;render(); }
  }
  $('prepare').addEventListener('click',()=>start('prepare')); $('package').addEventListener('click',()=>start('package'));
  $('confirmed').addEventListener('change',render); $('version').addEventListener('input',render);
  poll();
})();
