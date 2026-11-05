import crypto from 'node:crypto';

export const ANALYSIS_FEATURES = {
  note_created:'付箋の作成', note_edited:'付箋の編集', tag_add:'タグの追加', alarm_set:'アラームの設定',
  iphone_send:'iPhoneへ送信', iphone_receive:'iPhoneから受信', search_open:'検索画面を開く', note_duplicate:'付箋の複製',
  note_archive:'フォルダーへしまう', launcher_store:'クイックランチャーへしまう', outline_toggle:'付箋の折りたたみ', image_attach:'画像の添付',
};

const dayKey = value => new Date(value).toISOString().slice(0,10);
const utcDay = (date, offset) => new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+offset)).toISOString().slice(0,10);
const pct = (a,n) => n ? Math.round(a/n*1000)/10 : null;

export function mergeUsageHistoryRows(rows) {
  const bySubject=new Map();
  for(const row of rows??[]) {
    const value=row?.value??row;
    if(!value?.analyticsSubject||!value?.reports) continue;
    const reports=bySubject.get(value.analyticsSubject)??[];
    reports.push(...Object.values(value.reports)); bySubject.set(value.analyticsSubject,reports);
  }
  return bySubject;
}

export function buildUsageComparison(members,historyRows,now=new Date(),anonymizationKey=undefined) {
  const history=mergeUsageHistoryRows(historyRows), nowMs=now.getTime();
  const enriched=(members??[]).map(member=>{
    const reports=member.usageConsent===true?history.get(member.analyticsSubject)??[]:[];
    const days=new Map(), featureTimes=new Map(); let firstUseAt=null,lastUseAt=null,measurementStartedAt=null,legacyWeeks=0;
    for(const report of reports) {
      if(report.schema!==3){legacyWeeks++;continue;}
      if(report.measurementStartedAt&&(!measurementStartedAt||Date.parse(report.measurementStartedAt)<Date.parse(measurementStartedAt)))measurementStartedAt=report.measurementStartedAt;
      for(const [date,value] of Object.entries(report.days??{})) {
        const old=days.get(date)??{observedAt:null,observedThrough:null,features:new Set(),supported:new Set()};
        if(value.observedAt&&(!old.observedAt||value.observedAt<old.observedAt))old.observedAt=value.observedAt;
        if(value.observedThrough&&(!old.observedThrough||value.observedThrough>old.observedThrough))old.observedThrough=value.observedThrough;
        for(const name of value.supportedFeatures??report.supportedFeatures??[])old.supported.add(name);
        for(const [name,feature] of Object.entries(value.features??{})) {
          old.features.add(name);
          const stamps=featureTimes.get(name)??[];
          for(const stamp of [feature.firstUsedAt,feature.lastUsedAt])if(stamp)stamps.push(stamp);
          featureTimes.set(name,stamps);
          for(const stamp of [feature.firstUsedAt,feature.lastUsedAt])if(stamp&&(!firstUseAt||Date.parse(stamp)<Date.parse(firstUseAt)))firstUseAt=stamp;
          if(feature.lastUsedAt&&(!lastUseAt||Date.parse(feature.lastUsedAt)>Date.parse(lastUseAt)))lastUseAt=feature.lastUsedAt;
        }
        days.set(date,old);
      }
    }
    if(member.firstRealUseAt&&(!firstUseAt||Date.parse(member.firstRealUseAt)<Date.parse(firstUseAt)))firstUseAt=member.firstRealUseAt;
    if(member.measurementStartedAt&&(!measurementStartedAt||Date.parse(member.measurementStartedAt)<Date.parse(measurementStartedAt)))measurementStartedAt=member.measurementStartedAt;
    const recentStart=new Date(nowMs-7*86400000), recentDates=Array.from({length:8},(_,i)=>utcDay(recentStart,i));
    const recentObserved=recentDates.every(d=>days.has(d));
    const recentActive=[...featureTimes.values()].some(stamps=>stamps.some(stamp=>Date.parse(stamp)>=recentStart.getTime()&&Date.parse(stamp)<=nowMs));
    const baselineEnd=firstUseAt?new Date(Date.parse(firstUseAt)+7*86400000):null;
    const baselineMature=!!baselineEnd&&baselineEnd<=now;
    const baselineDates=firstUseAt?Array.from({length:Math.floor((Date.parse(baselineEnd.toISOString().slice(0,10)+'T00:00:00Z')-Date.parse(dayKey(new Date(firstUseAt))+'T00:00:00Z'))/86400000)+1},(_,i)=>utcDay(new Date(firstUseAt),i)):[];
    const baselineObserved=baselineDates.length>0&&baselineDates.every(d=>days.has(d));
    const supportsFeature=name=>baselineDates.length>0&&baselineDates.every(d=>days.get(d)?.supported.has(name));
    const baselineSupported=baselineDates.length>0&&Object.keys(ANALYSIS_FEATURES).every(supportsFeature);
    const baselineFeatures=new Set();
    if(firstUseAt&&baselineEnd) for(const [name,stamps] of featureTimes) if(stamps.some(stamp=>Date.parse(stamp)>=Date.parse(firstUseAt)&&Date.parse(stamp)<baselineEnd.getTime()))baselineFeatures.add(name);
    let classification;
    if(member.usageConsent!==true)classification=member.usageConsent===false?'consent_denied':'consent_unknown';
    else if(!firstUseAt)classification=reports.length?'legacy_unmeasured':'unmeasured';
    else if(!baselineMature)classification='new';
    else if(recentActive)classification='active';
    else if(!recentObserved)classification='observation_insufficient';
    else classification='churn_candidate';
    const isBaselineEligible=member.usageConsent===true&&baselineMature&&baselineObserved&&baselineSupported;
    const reason=member.usageConsent!==true?(member.usageConsent===false?'同意拒否。機能利用は保存していません':'同意状態不明。機能利用を収集していません')
      :!firstUseAt?'新計測スキーマの初回実利用なし。旧週次情報では初回7日間を復元できません'
      :!baselineMature?'初回利用から7日未満'
      :!baselineObserved?'初回7日間の観測日が不足'
      :!baselineSupported?'初回7日間を全機能対応スキーマで観測できていません'
      :classification==='observation_insufficient'?'直近7日間の観測日が不足':null;
    return {member,days,firstUseAt,lastUseAt,measurementStartedAt,baselineFeatures,baselineMature,baselineObserved,baselineSupported,baselineDates,supportsFeature,isBaselineEligible,classification,reason,legacyWeeks,recentObserved};
  });
  const features=Object.entries(ANALYSIS_FEATURES).map(([name,label])=>{
    const rates={};
    for(const group of ['active','churn_candidate']) {
      const cohort=enriched.filter(x=>x.member.usageConsent===true&&x.baselineMature&&x.baselineObserved&&x.supportsFeature(name)&&x.classification===group);
      const eligible=cohort.length,users=cohort.filter(x=>x.baselineFeatures.has(name)).length;
      rates[group]={users,denominator:eligible,rate:pct(users,eligible)};
    }
    return {name,label,...rates,differencePp:rates.active.rate===null||rates.churn_candidate.rate===null?null:Math.round((rates.active.rate-rates.churn_candidate.rate)*10)/10};
  });
  const candidates=features.filter(x=>x.differencePp>0).sort((a,b)=>b.differencePp-a.differencePp||b.active.users-a.active.users);
  const classificationCounts=Object.fromEntries(['active','churn_candidate','new','legacy_unmeasured','unmeasured','observation_insufficient','consent_denied','consent_unknown'].map(k=>[k,enriched.filter(x=>x.classification===k).length]));
  const anonymousId=subject=>subject?`m_${(anonymizationKey?crypto.createHmac('sha256',anonymizationKey).update(subject).digest():crypto.createHash('sha256').update(subject).digest()).toString('hex').slice(0,32)}`:null;
  return {generatedAt:now.toISOString(),timezone:'UTC',recentWindow:{start:new Date(nowMs-7*86400000).toISOString(),end:now.toISOString(),definition:'直近168時間。activeは同意済み・計測対応機能の実利用記録がある会員'},classificationCounts,baseline:{definition:'初回実利用時刻から168時間。期間内の各UTC日で観測があり、全対象機能の計測対応が確認でき、168時間を経過した会員のみ対象。日内の観測点は連続稼働を意味しない。',activeDenominator:features[0]?.active.denominator??0,churnCandidateDenominator:features[0]?.churn_candidate.denominator??0,smallSampleWarning:'各群の分母が20人未満の場合は参考値'},features,candidates,records:enriched.map(x=>{const dates=[...x.days.keys()].sort();let start=x.member.usageConsent===true?(x.measurementStartedAt?dayKey(x.measurementStartedAt):dates[0]):null;const end=x.member.usageConsent===true?dayKey(now):null;const allDates=[];if(start&&end){let cursor=new Date(start+'T00:00:00.000Z');for(let i=0;i<7300&&cursor.toISOString().slice(0,10)<=end;i++){allDates.push(cursor.toISOString().slice(0,10));cursor.setUTCDate(cursor.getUTCDate()+1);}}else allDates.push(...dates);return {anonymousMemberId:anonymousId(x.member.analyticsSubject),consent:x.member.usageConsent===true?'granted':x.member.usageConsent===false?'denied':'unknown',measurementStatus:x.classification,measurementStartedAt:x.measurementStartedAt??null,firstRealUseAt:x.firstUseAt,lastRealUseAt:x.lastUseAt,classification:x.classification,baselineEligible:x.isBaselineEligible,reason:x.reason,periods:[...new Set(allDates)].map(date=>{const d=x.days.get(date);return {date,observedFrom:d?.observedAt??null,observedThrough:d?.observedThrough??null,supportedFeatures:[...(d?.supported??[])].sort(),usedFeatures:[...(d?.features??[])].sort(),missingReason:d?.observedAt?null:'no_observation'};})};})};
}
