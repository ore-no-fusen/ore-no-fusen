import { FeedbackRequestError, hashSecretToken, safeEqualHash } from '../../feedback/lib/security';
import type { MemberDatabase, Row } from './database';
import { createFeedbackConversationStore } from '../../feedback/lib/store';
import { randomBytes } from 'node:crypto';

export type Member = { memberId: string; generalNumber: number; analyticsSubject: string; paidNumber: number | null; billingLinkStatus: 'not_connected'; registeredAt: string; secretHash: string; lastSeenAt?: string; lastSeenTimestamp?: string; firstRealUseAt?: string; measurementStartedAt?: string; appVersion?: string; usageSchema?: number; usageWeek?: string; usageFeatures?: string[]; usageConsent?: boolean | null; usageConsentStatus?: 'unknown' | 'not_presented' | 'unanswered' | 'postponed' | 'granted' | 'denied'; usageOpenMinutes?: number; partnerStars?: number; partnerLastStarWeek?: string };
type UsageFeatureCount = {count:number;activeDays:string[];lastUsedDay:string;firstUsedAt?:string|null;lastUsedAt?:string|null};
type UsageHistoryWeek = { week: string; schema: number; appVersion: string; features: Record<string,UsageFeatureCount>; days: Record<string,{observedAt?:string|null;observedThrough?:string|null;supportedFeatures?:string[];features:Record<string,UsageFeatureCount>}>; measurementStartedAt?: string|null; supportedFeatures: string[] };

const featureNames = new Set(['note_created', 'note_edited', 'tag_add', 'alarm_set', 'iphone_send', 'iphone_receive', 'search_open', 'note_duplicate', 'note_archive', 'launcher_store', 'outline_toggle', 'image_attach', 'web_sync']);
const isoInstant = (value: unknown): value is string => typeof value==='string' && Number.isFinite(Date.parse(value));
const isoDay = (value: unknown): value is string => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
function minInstant(...values:(string|null|undefined)[]) {return values.filter(isoInstant).sort((a,b)=>Date.parse(a!)-Date.parse(b!))[0]??undefined;}
function maxInstant(...values:(string|null|undefined)[]) {return values.filter(isoInstant).sort((a,b)=>Date.parse(b!)-Date.parse(a!))[0]??undefined;}
function isoWeek(date:Date) { const day=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())); day.setUTCDate(day.getUTCDate()+4-(day.getUTCDay()||7)); const year=day.getUTCFullYear(),yearStart=new Date(Date.UTC(year,0,1)); return `${year}-W${String(Math.ceil(((day.getTime()-yearStart.getTime())/86400000+1)/7)).padStart(2,'0')}`; }
function recentPartnerWeeks(now:Date) { const monday=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())); monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7)); return new Set([isoWeek(monday),isoWeek(new Date(monday.getTime()-7*86400000))]); }
function safePartnerStars(value: unknown): number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 999999 ? value as number : 0; }
function validPartnerWeek(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(value); }
function validFeatureCount(feature:UsageFeatureCount) {
  return !!feature&&Number.isSafeInteger(feature.count)&&feature.count>0&&feature.count<=1000000&&Array.isArray(feature.activeDays)&&feature.activeDays.length>0&&feature.activeDays.length<=8&&feature.activeDays.every(isoDay)&&isoDay(feature.lastUsedDay)&&feature.activeDays.includes(feature.lastUsedDay)&&isoInstant(feature.firstUsedAt)&&isoInstant(feature.lastUsedAt)&&Date.parse(feature.firstUsedAt!)<=Date.parse(feature.lastUsedAt!);
}
function validHistory(item: UsageHistoryWeek) {
  if(!item||item.schema!==3||!/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(item.week)||typeof item.appVersion!=='string'||!Array.isArray(item.supportedFeatures)||item.supportedFeatures.length>featureNames.size||item.supportedFeatures.some(x=>!featureNames.has(x))||!item.features||Object.keys(item.features).some(x=>!featureNames.has(x)||!item.supportedFeatures.includes(x))||Object.values(item.features).some(x=>!validFeatureCount(x))||!item.days||Object.keys(item.days).length>8)return false;
  for(const [day,value] of Object.entries(item.days)) {
    if(!isoDay(day)||!value||!isoInstant(value.observedAt)||!isoInstant(value.observedThrough)||Date.parse(value.observedThrough)<Date.parse(value.observedAt)||!Array.isArray(value.supportedFeatures)||value.supportedFeatures.length>featureNames.size||value.supportedFeatures.some(x=>!featureNames.has(x)||!item.supportedFeatures.includes(x))||!value.features||Object.keys(value.features).some(x=>!featureNames.has(x)||!value.supportedFeatures!.includes(x))||Object.values(value.features).some(x=>!validFeatureCount(x)))return false;
  }
  return true;
}

function usageSnapshot(week: unknown, features: unknown, consent: unknown, openMinutes: unknown, schema: unknown) {
  if ((schema !== undefined && schema !== 1 && schema !== 2 && schema !== 3) || (Array.isArray(features) && features.includes('launcher_store') && schema !== 2 && schema !== 3)
    || typeof week !== 'string' || !/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(week)
    || typeof consent !== 'boolean' || !Array.isArray(features) || features.length > featureNames.size
    || features.some(name => typeof name !== 'string' || !featureNames.has(name))
    || (!consent && features.length > 0)
    || (openMinutes !== undefined && (!Number.isSafeInteger(openMinutes) || (openMinutes as number) < 0))) throw new FeedbackRequestError('Invalid usage snapshot', 400);
  return { schema: (schema ?? 1) as number, week, features: [...new Set(features as string[])].sort(), consent, openMinutes: openMinutes as number | undefined };
}

function matchesServerAudience(segment: string, number: number): boolean {
  if (segment === 'all' || segment === 'feature_active' || segment === 'feature_inactive') return true;
  if (segment === 'iphone_week_unused') return true;
  if (/^feature_week_(used|unused):(note_created|note_edited|tag_add|alarm_set|iphone_send|iphone_receive|search_open|note_duplicate|note_archive|outline_toggle|image_attach|web_sync)$/.test(segment)) return true;
  if (segment === 'veteran') return number < 10050;
  if (segment === 'newcomer') return number >= 10100;
  return segment === `member:${number}`;
}
export type Credentials = { memberId: string; secretToken: string };
const deny = () => new FeedbackRequestError('Invalid member credentials', 403);
export function credentials(body: Record<string, unknown>): Credentials {
  if (typeof body.memberId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.memberId) || typeof body.secretToken !== 'string' || !/^[a-zA-Z0-9_-]{43,128}$/.test(body.secretToken)) throw deny();
  return { memberId: body.memberId.toLowerCase(), secretToken: body.secretToken };
}
export function publicMember(member: Member) {
  const { secretHash: _secret, ...view } = member;
  return view;
}
export class MemberService {
  constructor(private db: MemberDatabase, private now = () => new Date()) {}
  async authenticate(auth: Credentials): Promise<Row<Member>> {
    const row = await this.db.get<Member>(`members/${auth.memberId}`);
    if (!row || !safeEqualHash(row.value.secretHash, hashSecretToken(auth.secretToken))) throw deny();
    return row;
  }
  async register(auth: Credentials) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const existing = await this.db.get<Member>(`members/${auth.memberId}`);
      if (existing) return publicMember((await this.authenticate(auth)).value);
      const counter = await this.db.get<{ next: number }>('counters/general');
      const number = counter?.value.next ?? 10000;
      if (!Number.isSafeInteger(number) || number < 10000 || number === Number.MAX_SAFE_INTEGER) throw new Error('Invalid counter');
      const member: Member = { ...auth, generalNumber: number, analyticsSubject: randomBytes(24).toString('base64url'), paidNumber: null, billingLinkStatus: 'not_connected', registeredAt: this.now().toISOString(), secretHash: hashSecretToken(auth.secretToken), partnerStars: 0 };
      // Do not persist the plaintext credential supplied to registration.
      delete (member as Member & { secretToken?: string }).secretToken;
      if (await this.db.commit([
        { path: `members/${auth.memberId}`, value: member, version: null },
        { path: 'counters/general', value: { next: number + 1 }, version: counter?.version ?? null },
        { path: `numbers/general_${number}`, value: { memberId: auth.memberId }, version: null },
      ])) return publicMember(member);
    }
    throw new FeedbackRequestError('Registration busy; retry with the same identity', 503);
  }
  async lookupByGeneralNumber(generalNumber: unknown) {
    if (!Number.isSafeInteger(generalNumber) || (generalNumber as number) < 10000) {
      throw new FeedbackRequestError('Invalid general member number', 400);
    }
    const number = generalNumber as number;
    const index = await this.db.get<{ memberId: string }>(`numbers/general_${number}`);
    if (!index) throw new FeedbackRequestError('Member not found', 404);
    const member = await this.db.get<Member>(`members/${index.value.memberId}`);
    if (!member || member.value.generalNumber !== number) throw new Error('Member number index is inconsistent');
    return {
      generalNumber: member.value.generalNumber,
      analyticsSubject: member.value.analyticsSubject,
      registeredAt: member.value.registeredAt,
      paidNumber: member.value.paidNumber,
    };
  }
  async heartbeat(auth: Credentials, week?: unknown, features?: unknown, consent?: unknown, openMinutes?: unknown, appVersion?: unknown, usageSchema?: unknown) {
    if (appVersion !== undefined && (typeof appVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(appVersion) || appVersion.length > 32)) {
      throw new FeedbackRequestError('Invalid app version', 400);
    }
    const usage = week === undefined && features === undefined && consent === undefined && openMinutes === undefined
      ? null : usageSnapshot(week, features, consent, openMinutes, usageSchema);
    const lastSeenTimestamp = this.now().toISOString();
    const today = lastSeenTimestamp.slice(0, 10); // "YYYY-MM-DD"
    let member: Row<Member> | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await this.authenticate(auth);
      const keepCurrentWeek=!!usage&&usage.consent&&current.value.usageConsent===true&&!!current.value.usageWeek&&current.value.usageWeek>usage.week;
      const sameConsentedWeek=!!usage&&usage.consent&&current.value.usageConsent===true&&current.value.usageWeek===usage.week;
      const retainedFeatures=keepCurrentWeek?current.value.usageFeatures??[]:sameConsentedWeek?[...new Set([...(current.value.usageFeatures??[]),...usage.features])].sort():usage?.consent?usage.features:[];
      const updated = { ...current.value, lastSeenAt: today, lastSeenTimestamp, appVersion: appVersion as string | undefined,
        ...(usage && { usageSchema: keepCurrentWeek?current.value.usageSchema:sameConsentedWeek?Math.max(current.value.usageSchema??1,usage.schema):usage.schema, usageWeek: keepCurrentWeek?current.value.usageWeek:usage.week, usageFeatures: retainedFeatures, usageConsent: usage.consent, usageConsentStatus: usage.consent ? 'granted' as const : 'denied' as const,
          usageOpenMinutes: usage.consent ? (keepCurrentWeek?current.value.usageOpenMinutes:usage.openMinutes ?? current.value.usageOpenMinutes) : undefined,
          firstRealUseAt: usage.consent ? current.value.firstRealUseAt : undefined, measurementStartedAt: usage.consent ? current.value.measurementStartedAt : undefined }) };
      if (await this.db.commit([{ path: `members/${auth.memberId}`, value: updated, version: current.version }])) {
        if(usage&&!usage.consent) await this.clearUsageHistory(current.value.analyticsSubject);
        member = current;
        break;
      }
    }
    if (!member) throw new FeedbackRequestError('Heartbeat update busy; retry later', 503);

    return { lastSeenAt: today, announcements: await this.announcementsFor(member.value) };
  }
  async announcements(auth: Credentials) {
    const member = await this.authenticate(auth);
    return { announcements: await this.announcementsFor(member.value) };
  }
  private async announcementsFor(member: Pick<Member, 'generalNumber' | 'registeredAt'>) {
    type Announcement = {
      title: string; body: string; segment: string;
      active: boolean; createdAt: string; expiresAt: string;
    };
    const rows = this.db.deliveryAnnouncements
      ? await this.db.deliveryAnnouncements<Announcement>()
      : await this.db.list<Announcement>('announcements');

    const now = this.now().getTime();
    const registeredAt = Date.parse(member.registeredAt);
    const announcements = rows
      .filter(r => r.value.active && Date.parse(r.value.expiresAt) > now
        // Apply after reading the shared delivery list, using the authenticated
        // member's server-side registration time. Never deliver older letters
        // to a new member, including through the legacy heartbeat endpoint.
        && Date.parse(r.value.createdAt) >= registeredAt
        && Date.parse(r.value.createdAt) <= now
        && matchesServerAudience(r.value.segment, member.generalNumber))
      .map(r => ({
        id: r.path.split('/').pop()!,
        title: r.value.title,
        body: r.value.body,
        segment: r.value.segment,
        createdAt: r.value.createdAt,
      }));

    return announcements;
  }
  async recordUsage(auth: Credentials, week: unknown, features: unknown, consent: unknown, openMinutes: unknown, usageSchema?: unknown, history?: unknown, reporterId?: unknown, firstUseAt?: unknown, consentStatus?: unknown) {
    if((consentStatus==='unknown'||consentStatus==='not_presented'||consentStatus==='unanswered'||consentStatus==='postponed')&&week===undefined&&features===undefined&&consent===undefined&&openMinutes===undefined) {
      for(let attempt=0;attempt<4;attempt++) {
        const member=await this.authenticate(auth);
        if(member.value.usageConsent===null&&member.value.usageConsentStatus===consentStatus) { await this.clearUsageHistory(member.value.analyticsSubject); return {saved:true,partnerStars:safePartnerStars(member.value.partnerStars)}; }
        const updated:Member={...member.value,usageConsent:null,usageConsentStatus:consentStatus,usageSchema:undefined,usageWeek:undefined,usageFeatures:undefined,usageOpenMinutes:undefined,firstRealUseAt:undefined,measurementStartedAt:undefined};
        if(await this.db.commit([{path:`members/${auth.memberId}`,value:updated,version:member.version}])) { await this.clearUsageHistory(member.value.analyticsSubject); return {saved:true,partnerStars:safePartnerStars(updated.partnerStars)}; }
      }
      throw new FeedbackRequestError('Usage consent update busy; retry later',503);
    }
    if(consentStatus!==undefined&&consentStatus!=='granted'&&consentStatus!=='denied')throw new FeedbackRequestError('Invalid usage consent status',400);
    if(consentStatus==='granted'&&consent!==true||consentStatus==='denied'&&consent!==false)throw new FeedbackRequestError('Usage consent status mismatch',400);
    const usage = usageSnapshot(week, features, consent, openMinutes, usageSchema);
    const reports = history === undefined ? [] : history;
    if (!Array.isArray(reports) || reports.length > 156 || (reports as UsageHistoryWeek[]).some(item => !validHistory(item))) throw new FeedbackRequestError('Invalid usage history', 400);
    if (usage.consent && reports.length>0 && (typeof reporterId !== 'string' || !/^[0-9a-f-]{36}$/i.test(reporterId))) throw new FeedbackRequestError('Invalid usage reporter', 400);
    if (firstUseAt !== undefined && firstUseAt !== null && (typeof firstUseAt !== 'string' || !Number.isFinite(Date.parse(firstUseAt)))) throw new FeedbackRequestError('Invalid first-use time', 400);
    for (let attempt = 0; attempt < 4; attempt++) {
      const member = await this.authenticate(auth);
      const keepCurrentWeek=usage.consent&&member.value.usageConsent===true&&!!member.value.usageWeek&&member.value.usageWeek>usage.week;
      const sameConsentedWeek=usage.consent&&member.value.usageConsent===true&&member.value.usageWeek===usage.week;
      const retainedFeatures=keepCurrentWeek?member.value.usageFeatures??[]:sameConsentedWeek?[...new Set([...(member.value.usageFeatures??[]),...usage.features])].sort():usage.consent?usage.features:[];
      const partnerStars=safePartnerStars(member.value.partnerStars);
      const lastStarWeek=validPartnerWeek(member.value.partnerLastStarWeek)?member.value.partnerLastStarWeek:undefined;
      const earnsWeeklyStar=usage.consent&&recentPartnerWeeks(this.now()).has(usage.week)&&(!lastStarWeek||usage.week>lastStarWeek)&&partnerStars<999999;
      const updated: Member = { ...member.value, usageSchema: keepCurrentWeek?member.value.usageSchema:sameConsentedWeek?Math.max(member.value.usageSchema??1,usage.schema):usage.schema, usageWeek: keepCurrentWeek?member.value.usageWeek:usage.week, usageFeatures: retainedFeatures, usageConsent: usage.consent, usageConsentStatus: usage.consent ? 'granted' as const : 'denied' as const,
        partnerStars:partnerStars+(earnsWeeklyStar?1:0), partnerLastStarWeek:earnsWeeklyStar?usage.week:lastStarWeek,
        firstRealUseAt: usage.consent ? minInstant(member.value.firstRealUseAt,typeof firstUseAt==='string'?firstUseAt:undefined) : undefined,
        measurementStartedAt: usage.consent ? minInstant(member.value.measurementStartedAt,...(reports as UsageHistoryWeek[]).map(item=>item.measurementStartedAt)) : undefined,
        usageOpenMinutes: usage.consent ? (keepCurrentWeek?member.value.usageOpenMinutes:usage.openMinutes ?? member.value.usageOpenMinutes) : undefined };
      if (await this.db.commit([{ path: `members/${auth.memberId}`, value: updated, version: member.version }])) {
        if (usage.consent) {
          for (const item of reports as UsageHistoryWeek[]) {
            const path = `usage_history/${member.value.analyticsSubject}_${item.week}_${reporterId}`;
            for (let retry=0;retry<4;retry++) {
              const current = await this.db.get<Record<string,unknown>>(path);
              const merged = mergeUsageHistory(current?.value, item, member.value.analyticsSubject, reporterId as string);
              if (await this.db.commit([{path,value:merged,version:current?.version ?? null}])) break;
              if (retry===3) throw new FeedbackRequestError('Usage history update busy; retry later',503);
            }
          }
        } else {
          await this.clearUsageHistory(member.value.analyticsSubject);
        }
        return { saved: true, partnerStars: updated.partnerStars };
      }
    }
    throw new FeedbackRequestError('Usage update busy; retry later', 503);
  }
  private async clearUsageHistory(analyticsSubject:string) {
    const histories=await this.db.list<{analyticsSubject?:string}>('usage_history');
    await this.db.remove(histories.filter(row=>row.path.startsWith(`usage_history/${analyticsSubject}_`)).map(row=>row.path));
  }
  async linkConversation(auth: Credentials, conversationId: unknown, conversationSecret: unknown) {
    if (typeof conversationId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(conversationId) || typeof conversationSecret !== 'string' || !/^[a-zA-Z0-9_-]{32,200}$/.test(conversationSecret)) throw new FeedbackRequestError('Invalid conversation credentials',400);
    const member = await this.authenticate(auth);
    const store = createFeedbackConversationStore();
    const old = await store.getConversation(conversationId);
    await store.createConversation({ ...old, conversationId, secretTokenHash:hashSecretToken(conversationSecret), createdAt:old?.createdAt ?? this.now().toISOString(), updatedAt:this.now().toISOString(), deliveryEnabled:true, shadowOnly:old?.shadowOnly ?? false });
    const path = `conversations/${conversationId}`;
    const current = await this.db.get<{ memberId: string }>(path);
    if (current) {
      if (current.value.memberId !== auth.memberId) throw new FeedbackRequestError('Conversation already linked',409);
      return { linked:true };
    }
    if (!await this.db.commit([{ path, value:{ memberId:auth.memberId }, version:null }, { path:`members/${auth.memberId}`, value:member.value, version:member.version }])) throw new FeedbackRequestError('Retry conversation link',409);
    return { linked:true };
  }
}

function mergeUsageHistory(previous: unknown, next: UsageHistoryWeek, analyticsSubject: string, reporterId: string) {
  const old = previous as { reports?: Record<string, unknown>; week?: string; schema?: number } | null;
  const previousReport=old?.reports?.[reporterId] as UsageHistoryWeek|undefined;
  const reports = { ...(old?.reports ?? {}), [reporterId]: previousReport?mergeReporterReport(previousReport,next):next };
  return { analyticsSubject, week: next.week, schema: 3, consent: true, reports };
}
function mergeReporterReport(old:UsageHistoryWeek,next:UsageHistoryWeek):UsageHistoryWeek {
  const features={...old.features};
  for(const [name,feature] of Object.entries(next.features))features[name]=features[name]?mergeFeatureCount(features[name],feature):feature;
  const days={...old.days};
  for(const [date,value] of Object.entries(next.days)) {
    const previous=days[date]; if(!previous){days[date]=value;continue;}
    const mergedFeatures={...previous.features};
    for(const [name,feature] of Object.entries(value.features))mergedFeatures[name]=mergedFeatures[name]?mergeFeatureCount(mergedFeatures[name],feature):feature;
    days[date]={observedAt:minInstant(previous.observedAt,value.observedAt),observedThrough:maxInstant(previous.observedThrough,value.observedThrough),supportedFeatures:[...new Set([...(previous.supportedFeatures??[]),...(value.supportedFeatures??[])])],features:mergedFeatures};
  }
  return {...next,features,measurementStartedAt:minInstant(old.measurementStartedAt,next.measurementStartedAt),supportedFeatures:[...new Set([...old.supportedFeatures,...next.supportedFeatures])],days};
}
function mergeFeatureCount(old:UsageFeatureCount,next:UsageFeatureCount):UsageFeatureCount {
  const firstUsedAt=minInstant(old.firstUsedAt,next.firstUsedAt),lastUsedAt=maxInstant(old.lastUsedAt,next.lastUsedAt);
  return {...old,...next,count:Math.max(old.count,next.count),activeDays:[...new Set([...old.activeDays,...next.activeDays])].sort(),lastUsedDay:lastUsedAt?new Date(lastUsedAt).toISOString().slice(0,10):next.lastUsedDay,firstUsedAt,lastUsedAt};
}
