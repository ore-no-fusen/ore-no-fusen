import type { DiscordCandidateMessage } from '../../lib/types';
import { fetchWithDeadline } from '@/app/api/feedback/lib/request-budget';
import { feedbackEnvironment } from '../../lib/environment';
import { feedbackTimeRemaining, withFeedbackBudget } from '../../lib/request-budget';
import {
  evaluateDeveloperReplyEligibility,
  parseAllowedDiscordUserIds,
} from '../../lib/security';
import { createFeedbackConversationStore } from '../../lib/store';
import { resolveDiscordConversationIdForMessage } from './resolve';
import type { DiscordMessage } from './resolve';

export type DiscordIngestResult = {
  ingested: number;
  rejected: Array<{ discordMessageId: string; reason: string }>;
  lastSeenId?: string;
  continuation?: DiscordScan;
};

export type DiscordIngestFailure = {
  error: string;
  status: number;
};

export function isDiscordIngestFailure(result: DiscordIngestResult | DiscordIngestFailure): result is DiscordIngestFailure {
  return 'error' in result;
}

export type DiscordScan = { beforeId: string; highWaterId: string; floorId: string; channelId: string; environment: string };
export function validDiscordScan(value: unknown): value is DiscordScan {
  if (!value || typeof value !== 'object') return false;
  const c = value as DiscordScan;
  return [c.beforeId,c.highWaterId,c.floorId].every(id=>typeof id==='string' && /^\d{1,25}$/.test(id))
    && BigInt(c.floorId)<BigInt(c.beforeId) && BigInt(c.beforeId)<=BigInt(c.highWaterId)
    && typeof c.channelId==='string' && ['production','development'].includes(c.environment);
}
export async function runDiscordIngest(afterId?: string, continuation?: DiscordScan): Promise<DiscordIngestResult | DiscordIngestFailure> {
  return withFeedbackBudget(12_000,()=>ingestBatch(afterId,continuation));
}
async function ingestBatch(afterId?: string, continuation?: DiscordScan): Promise<DiscordIngestResult | DiscordIngestFailure> {
  if (process.env.FEEDBACK_CONVERSATION_ENABLED === 'false') return { ingested:0,rejected:[] };
  const botToken=process.env.DISCORD_BOT_TOKEN, channelId=process.env.DISCORD_FEEDBACK_CHANNEL_ID;
  if(!botToken||!channelId)return {error:'Missing Discord configuration',status:500};
  if(continuation && (!validDiscordScan(continuation)||continuation.channelId!==channelId||continuation.environment!==feedbackEnvironment()||(afterId&&continuation.floorId!==afterId))) return {error:'Discord scan does not match this environment or checkpoint',status:400};
  const limit=continuation||afterId?100:50;
  const params=new URLSearchParams({limit:String(limit)});
  if(continuation)params.set('before',continuation.beforeId);else if(afterId)params.set('after',afterId);
  const response=await fetchWithDeadline('https://discord.com/api/v10/channels/'+channelId+'/messages?'+params,{headers:{Authorization:'Bot '+botToken}});
  if(!response.ok)return {error:'Discord API error: '+response.status,status:502};
  const page=await response.json() as DiscordMessage[];
  if(!Array.isArray(page)||page.some(m=>!/^\d{15,25}$/.test(m.id)))return {error:'Invalid Discord message page',status:502};
  page.sort((a,b)=>BigInt(a.id)>BigInt(b.id)?-1:1);
  if(!page.length)return {ingested:0,rejected:[],...(continuation?{lastSeenId:continuation.highWaterId}:afterId?{lastSeenId:afterId}:{})};
  const highWaterId=continuation?.highWaterId??page[0].id;
  const floorId=continuation?.floorId??afterId??String(BigInt(page.at(-1)!.id)-BigInt(1));
  const messages=page.filter(m=>BigInt(m.id)>BigInt(floorId)&&BigInt(m.id)<=BigInt(highWaterId));
  const store=createFeedbackConversationStore(), allowed=parseAllowedDiscordUserIds(process.env.ALLOWED_DISCORD_USER_IDS);
  let ingested=0, beforeId=continuation?.beforeId, processed=0;
  const rejected:Array<{discordMessageId:string;reason:string}>=[];
  for(const message of messages) {
    if(processed>=20||feedbackTimeRemaining()<1500)break;
    try {
      const bot=message.author?.bot===true;
      if(bot||!allowed.includes(message.author?.id??'')) rejected.push({discordMessageId:message.id,reason:bot?'bot_message':'author_not_allowed'});
      else {
        const mapping=await resolveDiscordConversationIdForMessage(message,botToken,store);
        const result=evaluateDeveloperReplyEligibility({message:{id:message.id,channelId:message.channel_id,authorId:message.author?.id??'',authorIsBot:bot,content:message.content,referencedMessageId:mapping.referencedMessageId,threadId:message.thread?.id??null},allowedDiscordUserIds:allowed,mappedConversationId:mapping.conversationId,alreadyIngested:await store.hasDiscordMessage(message.id)});
        if(!result.ok)rejected.push({discordMessageId:message.id,reason:result.reason});
        else if(await store.appendMessage({messageId:'discord_'+message.id,conversationId:result.conversationId,authorType:'developer',body:message.content.trim(),discordMessageId:message.id,createdAt:message.timestamp&&Number.isFinite(Date.parse(message.timestamp))?message.timestamp:new Date().toISOString(),readByUser:false,shadowOnly:process.env.FEEDBACK_CONVERSATION_SHADOW_MODE==='true'}))ingested++;
      }
      beforeId=message.id;processed++;
    } catch {
      // A failed message stays outside the completed prefix and is retried idempotently.
      if(!processed)return {error:'Discord batch could not make progress',status:503};
      break;
    }
  }
  const complete=processed===messages.length && (page.length<limit || page.some(m=>BigInt(m.id)<=BigInt(floorId)) || (!continuation&&!afterId));
  if(complete)return {ingested,rejected,lastSeenId:highWaterId};
  if(!beforeId)return {error:'Discord batch deadline exceeded',status:503};
  return {ingested,rejected,...(afterId?{lastSeenId:afterId}:{}),continuation:{beforeId,highWaterId,floorId,channelId,environment:feedbackEnvironment()}};
}

export type DiscordGatewayIngestResult = {
  outcome: 'saved' | 'duplicate' | 'ignored';
};

export function runDiscordGatewayIngest(event: { messageId: string; channelId: string; guildId: string }) {
  return withFeedbackBudget(4_000,()=>ingestGateway(event));
}

/** Fetch and validate one Gateway-notified message through the same trust boundary as REST recovery. */
async function ingestGateway(
  event: { messageId: string; channelId: string; guildId: string },
): Promise<DiscordGatewayIngestResult | DiscordIngestFailure> {
  if (process.env.FEEDBACK_CONVERSATION_ENABLED === 'false') {
    return { error: 'Feedback conversation is disabled', status: 503 };
  }
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_FEEDBACK_CHANNEL_ID;
  const configuredGuildId = process.env.DISCORD_FEEDBACK_GUILD_ID;
  if (!botToken || !channelId) return { error: 'Missing Discord configuration', status: 500 };
  if (event.channelId !== channelId || (configuredGuildId && event.guildId !== configuredGuildId)) {
    return { outcome: 'ignored' };
  }

  const response = await fetchWithDeadline(
    `https://discord.com/api/v10/channels/${channelId}/messages/${event.messageId}`,
    { headers: { Authorization: `Bot ${botToken}` }, signal: AbortSignal.timeout(10_000) },
  );
  if (response.status === 404) return { outcome: 'ignored' };
  if (!response.ok) return { error: `Discord API error: ${response.status}`, status: 503 };
  const message = await response.json() as DiscordMessage;
  if (message.id !== event.messageId || message.channel_id !== channelId) return { outcome: 'ignored' };

  const allowedDiscordUserIds = parseAllowedDiscordUserIds(process.env.ALLOWED_DISCORD_USER_IDS);
  if (message.author?.bot || !allowedDiscordUserIds.includes(message.author?.id ?? '')) {
    return { outcome: 'ignored' };
  }
  const hasReplyReference = Boolean(message.message_reference?.message_id ?? message.referenced_message?.id);
  if (hasReplyReference && !message.content.trim()) {
    return { error: 'Discord reply content is unavailable; check Message Content access', status: 503 };
  }

  const store = createFeedbackConversationStore();
  const { conversationId: mappedConversationId, referencedMessageId } =
    await resolveDiscordConversationIdForMessage(message, botToken, store);
  const candidate: DiscordCandidateMessage = {
    id: message.id,
    channelId: message.channel_id,
    authorId: message.author?.id ?? '',
    authorIsBot: message.author?.bot === true,
    content: message.content,
    referencedMessageId,
    threadId: message.thread?.id ?? null,
  };
  const eligibility = evaluateDeveloperReplyEligibility({
    message: candidate,
    allowedDiscordUserIds,
    mappedConversationId,
    alreadyIngested: await store.hasDiscordMessage(message.id),
  });
  if (!eligibility.ok) {
    if (eligibility.reason === 'duplicate') return { outcome: 'duplicate' };
    return { outcome: 'ignored' };
  }

  const saved = await store.appendMessage({
    messageId: `discord_${message.id}`,
    conversationId: eligibility.conversationId,
    authorType: 'developer',
    body: message.content.trim(),
    discordMessageId: message.id,
    createdAt: message.timestamp && Number.isFinite(Date.parse(message.timestamp))
      ? message.timestamp
      : new Date().toISOString(),
    readByUser: false,
    shadowOnly: process.env.FEEDBACK_CONVERSATION_SHADOW_MODE === 'true',
  });
  return { outcome: saved ? 'saved' : 'duplicate' };
}
