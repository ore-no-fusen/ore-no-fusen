import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANALYSIS_FEATURES, buildUsageComparison } from './member-usage-analysis.mjs';

function sample(subject,{initial=[],recent=[],consent=true}={}) {
  const first='2026-10-01T10:00:00.000Z', start='2026-10-01';
  const report={week:'2026-W40',schema:3,appVersion:'5.8.0',measurementStartedAt:first,supportedFeatures:Object.keys(ANALYSIS_FEATURES),features:{},days:{}};
  for(let i=0;i<=13;i++){
    const date=new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10),names=[];
    if(i===0)names.push(...initial);
    if(recent.includes(i))names.push('note_edited');
    report.days[date]={observedAt:date+'T12:00:00.000Z',observedThrough:date+'T13:00:00.000Z',features:{}};
    for(const name of names){const stamp=date+'T13:00:00.000Z';report.days[date].features[name]={count:1,activeDays:[date],lastUsedDay:date,firstUsedAt:stamp,lastUsedAt:stamp};report.features[name]={count:(report.features[name]?.count??0)+1,activeDays:[...(report.features[name]?.activeDays??[]),date],lastUsedDay:date,firstUsedAt:report.features[name]?.firstUsedAt??stamp,lastUsedAt:stamp};}
  }
  return {member:{analyticsSubject:subject,registeredAt:first,usageConsent:consent,firstRealUseAt:first,measurementStartedAt:first},history:consent?[{analyticsSubject:subject,reports:{reporter:report}}]:[]};
}

test('初回7日間の比較は日別観測と完全な計測対応を要求し、率とppを算出する',()=>{
  const active=sample('a',{initial:['note_created'],recent:[10]}),churn=sample('b',{initial:[]}),result=buildUsageComparison([active.member,churn.member],[...active.history,...churn.history],new Date('2026-10-14T00:00:00Z'),Buffer.alloc(32,7));
  assert.equal(result.classificationCounts.active,1);assert.equal(result.classificationCounts.churn_candidate,1);
  const created=result.features.find(f=>f.name==='note_created');
  assert.equal(created.active.rate,100);assert.equal(created.churn_candidate.rate,0);assert.equal(created.differencePp,100);
  assert.equal(result.candidates[0].name,'note_created');
  assert.equal(result.records[0].anonymousMemberId,result.records.find(r=>r.anonymousMemberId)?.anonymousMemberId);
  assert.match(result.records[0].anonymousMemberId,/^m_[a-f0-9]{32}$/);
});

test('欠測・同意拒否・初回7日未満は非アクティブの0扱いにせず別分類にする',()=>{
  const denied=sample('denied',{initial:['note_created'],consent:false}),newMember=sample('new',{initial:['note_created']});
  const result=buildUsageComparison([denied.member,newMember.member],[...denied.history,...newMember.history],new Date('2026-10-03T00:00:00Z'));
  assert.equal(result.classificationCounts.consent_denied,1);assert.equal(result.classificationCounts.new,1);assert.equal(result.classificationCounts.churn_candidate,0);
  assert.equal(result.features.find(f=>f.name==='note_created').active.rate,null);
});

test('観測日の欠落があれば離脱候補ではなく観測不足にする',()=>{
  const item=sample('partial',{initial:['note_created'],recent:[]});delete item.history[0].reports.reporter.days['2026-10-10'];
  const result=buildUsageComparison([item.member],[...item.history],new Date('2026-10-14T00:00:00Z'));
  assert.equal(result.classificationCounts.observation_insufficient,1);assert.equal(result.classificationCounts.churn_candidate,0);
});

test('直近の実利用が確認できれば、観測日の欠落だけで観測不足にしない',()=>{
  const item=sample('intermittent',{initial:['note_created'],recent:[10]});
  delete item.history[0].reports.reporter.days['2026-10-10'];
  const result=buildUsageComparison([item.member],item.history,new Date('2026-10-14T00:00:00Z'));
  assert.equal(result.classificationCounts.active,1);
  assert.equal(result.classificationCounts.observation_insufficient,0);
  assert.equal(result.classificationCounts.churn_candidate,0);
});

test('実利用があっても初回観測不足を比較率の分母へ混ぜない',()=>{
  const item=sample('baseline-missing',{initial:['note_created'],recent:[10]});
  delete item.history[0].reports.reporter.days['2026-10-03'];
  const result=buildUsageComparison([item.member],item.history,new Date('2026-10-14T00:00:00Z'));
  assert.equal(result.classificationCounts.active,1);
  assert.equal(result.records[0].baselineEligible,false);
  assert.equal(result.features.find(f=>f.name==='note_created').active.denominator,0);
});

test('直近168時間の境界だけを実利用として扱い、未来・期間外は欠測のまま残す',()=>{
  for(const [stamp,expected] of [
    ['2026-10-07T00:00:00.000Z','active'],
    ['2026-10-14T00:00:00.000Z','active'],
    ['2026-10-06T23:59:59.999Z','observation_insufficient'],
    ['2026-10-14T00:00:00.001Z','observation_insufficient'],
  ]) {
    const item=sample('boundary',{initial:['note_created'],recent:[]});
    delete item.history[0].reports.reporter.days['2026-10-10'];
    item.history[0].reports.reporter.days['2026-10-11'].features.note_edited={firstUsedAt:stamp,lastUsedAt:stamp};
    const result=buildUsageComparison([item.member],item.history,new Date('2026-10-14T00:00:00Z'));
    assert.equal(result.records[0].classification,expected,stamp);
  }
});

test('利用が記録されていても同意拒否・不明・新規会員の区分を優先する',()=>{
  for(const [consent,now,expected] of [
    [false,'2026-10-14T00:00:00Z','consent_denied'],
    [undefined,'2026-10-14T00:00:00Z','consent_unknown'],
    [true,'2026-10-03T00:00:00Z','new'],
  ]) {
    const item=sample('privacy',{initial:['note_created'],recent:[1,10]});
    item.member.usageConsent=consent;
    const result=buildUsageComparison([item.member],item.history,new Date(now));
    assert.equal(result.records[0].classification,expected);
    assert.equal(result.classificationCounts.active,0);
  }
});

test('初回7日間の半開区間では境界時刻の利用を含めない',()=>{
  const item=sample('boundary',{initial:['note_created'],recent:[]});
  item.history[0].reports.reporter.days['2026-10-08']={observedAt:'2026-10-08T12:00:00.000Z',observedThrough:'2026-10-08T13:00:00.000Z',features:{note_edited:{count:1,activeDays:['2026-10-08'],lastUsedDay:'2026-10-08',firstUsedAt:'2026-10-08T10:00:00.000Z',lastUsedAt:'2026-10-08T10:00:00.000Z'}}};
  const result=buildUsageComparison([item.member],item.history,new Date('2026-10-14T00:00:00Z'));
  assert.equal(result.features.find(f=>f.name==='note_edited').churn_candidate.users,0);
});

test('機能ごとに対応がそろった会員だけをその機能の分母にする',()=>{
  const active=sample('supported',{initial:['note_created'],recent:[10]}),churn=sample('missing',{initial:[]});
  for(const report of churn.history[0].reports.reporter?[churn.history[0].reports.reporter]:[])report.supportedFeatures=report.supportedFeatures.filter(x=>x!=='image_attach');
  const result=buildUsageComparison([active.member,churn.member],[...active.history,...churn.history],new Date('2026-10-14T00:00:00Z'));
  assert.equal(result.features.find(f=>f.name==='note_created').churn_candidate.denominator,1);
  assert.equal(result.features.find(f=>f.name==='image_attach').churn_candidate.denominator,0);
});

test('stable local HMAC key keeps pseudonymous IDs comparable across exports',()=>{
  const item=sample('stable'),key=Buffer.alloc(32,9),now=new Date('2026-10-14T00:00:00Z');
  const a=buildUsageComparison([item.member],item.history,now,key).records[0].anonymousMemberId;
  const b=buildUsageComparison([item.member],item.history,now,key).records[0].anonymousMemberId;
  const c=buildUsageComparison([item.member],item.history,now,Buffer.alloc(32,10)).records[0].anonymousMemberId;
  assert.equal(a,b);assert.notEqual(a,c);
});

test('reports from multiple devices merge into one member-level feature rate without duplicate users',()=>{
  const item=sample('multi',{initial:['note_created'],recent:[10]}),other={...item.history[0],reports:{other_device:{...item.history[0].reports.reporter,days:{...item.history[0].reports.reporter.days,'2026-10-03':{observedAt:'2026-10-03T08:00:00Z',observedThrough:'2026-10-03T10:00:00Z',features:{tag_add:{count:1,activeDays:['2026-10-03'],lastUsedDay:'2026-10-03',firstUsedAt:'2026-10-03T09:00:00Z',lastUsedAt:'2026-10-03T09:00:00Z'}}}}}}};
  const result=buildUsageComparison([item.member],[item.history[0],other],new Date('2026-10-14T00:00:00Z'));
  assert.equal(result.features.find(f=>f.name==='tag_add').active.users,1);
  assert.equal(result.records.length,1);
  assert.doesNotMatch(JSON.stringify(result),/multi|secretToken|memberId|analyticsSubject/);
});

