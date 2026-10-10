let memberPage = 0;
const container = document.querySelector('.max-w-6xl');
const nav = document.createElement('nav');
nav.className = 'flex flex-wrap gap-2 sticky top-0 z-10 bg-slate-950 py-3';
nav.setAttribute('aria-label', 'ダッシュボードの表示');
const groups = { overview: [], members: [], features: [], announcements: [] };
for (const section of [...container.children].slice(1)) {
  const heading = section.querySelector('h2')?.textContent ?? '';
  const group = section.dataset.dashboardGroup ?? (section.id === 'membersPanel' ? 'members' : heading.includes('お便り') ? 'announcements' : heading.includes('機能別') || heading.includes('アクション') || heading.includes('GA4の機能') ? 'features' : 'overview');
  groups[group].push(section);
}
const buttons = {};
function showTab(group) {
  for (const [key, sections] of Object.entries(groups)) {
    for (const section of sections) section.hidden = key !== group;
    buttons[key]?.setAttribute('aria-pressed', String(key === group));
    if (buttons[key]) buttons[key].style.background = key === group ? '#4338ca' : '#161b2c';
  }
}
for (const [key, label] of Object.entries({ overview: '概要', members: '会員一覧', features: '機能利用', announcements: 'お便り' })) {
  if (!groups[key].length) continue;
  const button = document.createElement('button');
  button.textContent = label;
  button.className = 'rounded-lg px-5 py-2 font-semibold';
  button.onclick = () => showTab(key);
  buttons[key] = button;
  nav.appendChild(button);
}
container.insertBefore(nav, container.children[1]);
const versionFilter = document.getElementById('versionFilter');
function inWeek(member) {
  const start = new Date(dashboard.day + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - 6);
  return member.lastSeenAt && member.lastSeenAt >= start.toISOString().slice(0, 10) && member.lastSeenAt <= dashboard.day;
}
function renderMembers() {
  const usageStates = new Map((dashboard.usageStates ?? []).map(m => [m.number, m]));
  const selectedState = document.getElementById('usageStateFilter').value;
  const times = new Map(dashboard.times.map(m => [m.number, m.minutes]));
  const search = document.getElementById('memberSearch').value.trim().replace(/^#/, '');
  const activity = document.getElementById('activityFilter').value;
  const sort = document.getElementById('memberSort').value;
  const members = dashboard.versions.filter(m => String(m.number).includes(search) && (selectedState === 'all' || usageStates.get(m.number)?.state === selectedState) && (versionFilter.value === 'all' || (m.version ?? 'unknown') === versionFilter.value) && (activity === 'all' || (activity === 'week' ? inWeek(m) : activity === 'unknown' ? !m.lastSeenAt || m.lastSeenAt > dashboard.day : m.lastSeenAt && m.lastSeenAt <= dashboard.day && !inWeek(m))));
  members.sort((a,b) => sort === 'recent' ? (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? '') || a.number-b.number : sort === 'minutes' ? (times.get(b.number) ?? -1)-(times.get(a.number) ?? -1) || a.number-b.number : a.number-b.number);
  memberPage = Math.min(memberPage, Math.max(0, Math.ceil(members.length / 25)-1));
  const rows = document.getElementById('memberRows');
  rows.replaceChildren();
  for (const member of members.slice(memberPage*25, memberPage*25+25)) {
    const row = document.createElement('tr');
    row.className = 'border-b border-slate-800';
    const minutes = times.get(member.number);
    for (const value of ['#'+member.number, member.version ?? '版番号未報告', member.lastSeenAt ?? '日本日付未確認', minutes === undefined ? '未集計' : Math.floor(minutes/60)+'時間'+minutes%60+'分', usageStates.get(member.number)?.label ?? '情報がなく、まだ分からない']) {
      const cell = document.createElement('td'); cell.className = 'py-3 pr-4'; cell.textContent = value; row.appendChild(cell);
    }
    rows.appendChild(row);
  }
  if (!members.length) { const row = rows.insertRow(); const cell = row.insertCell(); cell.colSpan = 5; cell.textContent = '該当する会員はいません'; }
  document.getElementById('memberPageStatus').textContent = members.length ? (memberPage*25+1)+'〜'+Math.min(members.length,memberPage*25+25)+'件 / '+members.length+'人' : '0人';
  document.getElementById('memberPrev').disabled = memberPage === 0;
  document.getElementById('memberNext').disabled = (memberPage+1)*25 >= members.length;
}
function renderDashboard() {
  const counts = new Map();
  for (const member of dashboard.versions) { const version = member.version ?? 'unknown'; counts.set(version, (counts.get(version) ?? 0)+1); }
  const selection = versionFilter.value;
  versionFilter.replaceChildren(new Option('すべての版','all'));
  const cards = document.getElementById('versionCards'); cards.replaceChildren();
  const versions = [...counts.keys()].sort((a,b) => a === 'unknown' ? 1 : b === 'unknown' ? -1 : b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const label = version === 'unknown' ? '版番号未報告' : version;
    versionFilter.add(new Option(label,version));
    const card = document.createElement('button');
    card.className = 'text-left rounded-xl border border-slate-600 bg-slate-900 p-4';
    const title = document.createElement('div'); title.textContent = label; title.className = 'text-sm text-slate-300';
    const count = document.createElement('div'); count.textContent = counts.get(version)+'人'; count.className = 'text-2xl font-bold text-emerald-300';
    card.append(title,count); card.onclick = () => { versionFilter.value = version; document.getElementById('memberSearch').value = ''; document.getElementById('activityFilter').value = 'all'; document.getElementById('usageStateFilter').value = 'all'; memberPage = 0; renderMembers(); showTab('members'); }; cards.appendChild(card);
  }
  if (!versions.length) cards.textContent = '会員データはありません';
  if (counts.has(selection)) versionFilter.value = selection;
  const active = dashboard.versions.filter(inWeek);
  const updated = dashboard.target ? active.filter(m => m.version === dashboard.target).length : 0;
  const totalUpdated = dashboard.target ? counts.get(dashboard.target) ?? 0 : 0;
  document.getElementById('updateRate').textContent = '最大報告版 '+(dashboard.target ?? '未報告')+'：全会員 '+totalUpdated+' / '+dashboard.total+'人（'+(dashboard.total ? Math.round(totalUpdated/dashboard.total*100) : 0)+'%）・過去7日の通信会員 '+updated+' / '+active.length+'人'+(active.length ? '（'+Math.round(updated/active.length*100)+'%）' : '（集計対象なし）');
  renderMembers();
}
for (const id of ['memberSearch','versionFilter','activityFilter','memberSort','usageStateFilter']) document.getElementById(id).addEventListener(id === 'memberSearch' ? 'input' : 'change', () => { memberPage = 0; renderMembers(); });
document.getElementById('memberPrev').onclick = () => { memberPage--; renderMembers(); };
document.getElementById('memberNext').onclick = () => { memberPage++; renderMembers(); };
renderDashboard(); showTab('overview');

function renderUsageStates(stats) {
  const cards = document.getElementById('usageStateCards');
  cards.replaceChildren();
  for (const state of stats.usageStates) {
    const card = document.createElement('button');
    card.type = 'button'; card.dataset.usageState = state.key;
    card.className = 'text-left rounded-xl border border-slate-600 bg-slate-900 p-4';
    const label = document.createElement('div'); label.className = 'text-sm '+state.color; label.textContent = state.label;
    const count = document.createElement('div'); count.className = 'text-2xl font-bold mt-1 '+state.color; count.textContent = state.count+'人';
    const description = document.createElement('p'); description.className = 'text-xs text-slate-400 mt-2'; description.textContent = state.description;
    card.append(label,count,description); cards.appendChild(card);
  }
  document.getElementById('featureEvidence').textContent = stats.reporting ? '届いた会員の情報について、機能ごとの使用・未使用を集計しています。全会員の使用状況を確定する値ではありません。' : '今週の利用情報はまだ届いていません。全会員が利用ゼロという意味ではありません。';
  document.getElementById('usageStateUpdated').textContent = '確認日時: '+new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+' (JST)・人数を押すと会員一覧へ移動します。';
  document.getElementById('featureRefreshStatus').textContent = '';
}
document.getElementById('usageStateCards').addEventListener('click', event => {
  const button = event.target.closest('button[data-usage-state]');
  if (!button) return;
  document.getElementById('usageStateFilter').value = button.dataset.usageState;
  document.getElementById('memberSearch').value = '';
  document.getElementById('activityFilter').value = 'all'; versionFilter.value = 'all';
  memberPage = 0; renderMembers(); showTab('members');
});
