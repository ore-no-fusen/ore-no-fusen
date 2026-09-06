'use client';

import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { safeUnlisten } from '../utils/safeUnlisten';

const GA_ID = 'G-MGPKF0MQH4';
type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; __FUSEN_ANALYTICS_GRANTED__?: boolean; 'ga-disable-G-MGPKF0MQH4'?: boolean };
type MemberView = { analyticsSubject: string | null; consent: boolean | null };
type WeeklyUsage = { week: string; schema: number; appVersion: string; features: Record<string,{ count: number; activeDays: string[]; lastUsedDay: string }> };

function loadGa4(sendPageView: boolean) {
  const w=window as AnalyticsWindow;
  if(w.gtag)return;
  w.dataLayer=w.dataLayer??[];
  w.gtag=function gtag(..._args:unknown[]){w.dataLayer?.push(arguments);};
  w.gtag('js',new Date()); w.gtag('config',GA_ID,{send_page_view:sendPageView});
  const script=document.createElement('script');script.async=true;script.src=`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;script.dataset.fusenAnalytics='ga4';document.head.appendChild(script);
}

async function runDesktopBackground(cancelled:()=>boolean) {
  const settings=await invoke<{analytics_consent?:string}>('get_settings');
  if(cancelled())return;
  const granted=settings.analytics_consent==='granted';
  const w=window as AnalyticsWindow; w.__FUSEN_ANALYTICS_GRANTED__=granted; w['ga-disable-G-MGPKF0MQH4']=true;
  if(await invoke<boolean>('member_needs_sync')) await invoke('member_sync').catch(()=>undefined);
  const member=await invoke<MemberView>('member_get');
  if(!granted||member.consent!==true||!member.analyticsSubject||cancelled())return;
  loadGa4(false); w['ga-disable-G-MGPKF0MQH4']=false;
  w.gtag?.('config',GA_ID,{send_page_view:false,user_id:member.analyticsSubject});
  const summaries=await invoke<WeeklyUsage[]>('member_closed_summaries');
  for(const summary of summaries){
    for(const [featureName,value] of Object.entries(summary.features)){
      w.gtag?.('event','weekly_feature_usage',{event_category:'usage',summary_week:summary.week,feature_name:featureName,usage_count:value.count,active_days:value.activeDays.length,last_used_day:value.lastUsedDay,app_version:summary.appVersion,distribution:'desktop_app'});
    }
    w.gtag?.('event','weekly_usage_complete',{event_category:'usage',summary_week:summary.week,measurement_schema:summary.schema,app_version:summary.appVersion,distribution:'desktop_app'});
    await invoke('member_mark_summary_sent',{week:summary.week}).catch(()=>undefined);
  }
}

export default function AnalyticsLoader({isTauriBuild}:{isTauriBuild:boolean}){
  useEffect(()=>{
    if(!isTauriBuild){loadGa4(true);return;}
    if(getCurrentWindow().label!=='main')return;
    let cancelled=false;
    let unlisten:(()=>void)|undefined;
    // This local asynchronous read does not delay rendering or note input.
    void invoke<{analytics_consent?:string}>('get_settings').then(settings=>{
      if(!cancelled)(window as AnalyticsWindow).__FUSEN_ANALYTICS_GRANTED__=settings.analytics_consent==='granted';
    }).catch(()=>undefined);
    void listen<{analytics_consent?:string}>('settings_updated',event=>{
      (window as AnalyticsWindow).__FUSEN_ANALYTICS_GRANTED__=event.payload.analytics_consent==='granted';
    }).then(dispose=>{if(cancelled)dispose();else unlisten=dispose;}).catch(()=>undefined);
    const start=window.setTimeout(()=>void runDesktopBackground(()=>cancelled).catch(()=>undefined),60_000);
    const flush=window.setInterval(()=>void invoke('member_flush').catch(()=>undefined),300_000);
    return()=>{cancelled=true;safeUnlisten(unlisten);window.clearTimeout(start);window.clearInterval(flush);};
  },[isTauriBuild]);
  return null;
}
