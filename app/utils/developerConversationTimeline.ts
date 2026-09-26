import type { ReceivedAnnouncement } from '@/app/components/AnnouncementCard';
import type { FeedbackConversationMessage } from './feedbackConversation';

export type ConversationTimelineItem =
  | { kind: 'announcement'; key: string; createdAt: string; announcement: ReceivedAnnouncement }
  | { kind: 'message'; key: string; createdAt: string; message: FeedbackConversationMessage };

export function buildConversationTimeline(
  announcements: ReceivedAnnouncement[],
  messages: FeedbackConversationMessage[],
): ConversationTimelineItem[] {
  const entries: ConversationTimelineItem[] = [
    ...announcements.map((announcement) => ({ kind: 'announcement' as const, key: `announcement-${announcement.id}`, createdAt: announcement.createdAt, announcement })),
    ...messages.map((message) => ({ kind: 'message' as const, key: `message-${message.messageId}`, createdAt: message.createdAt, message })),
  ];
  return entries.sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    return (Number.isFinite(aTime) ? aTime : -Infinity) - (Number.isFinite(bTime) ? bTime : -Infinity);
  });
}

export function parseAnnouncementReply(body: string): { announcementId: string; title: string; reply: string } | null {
  const match = /^お便り「(.+?)」（ID: ([^)]+)）への返信:\n([\s\S]*)$/.exec(body);
  if (!match) return null;
  return { title: match[1], announcementId: match[2], reply: match[3] };
}
