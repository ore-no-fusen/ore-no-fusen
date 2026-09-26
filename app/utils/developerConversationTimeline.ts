import type { ReceivedAnnouncement } from '@/app/components/AnnouncementCard';
import type { FeedbackConversationMessage } from './feedbackConversation';

export type ConversationTimelineItem =
  | { kind: 'announcement'; key: string; createdAt: string; announcement: ReceivedAnnouncement; replies: FeedbackConversationMessage[] }
  | { kind: 'message'; key: string; createdAt: string; message: FeedbackConversationMessage };

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

export function buildConversationTimeline(
  announcements: ReceivedAnnouncement[],
  messages: FeedbackConversationMessage[],
): ConversationTimelineItem[] {
  const threads = new Map(announcements.map((announcement) => [announcement.id, {
    kind: 'announcement' as const,
    key: `announcement-${announcement.id}`,
    createdAt: announcement.createdAt,
    announcement,
    replies: [] as FeedbackConversationMessage[],
  }]));
  const entries: ConversationTimelineItem[] = [...threads.values()];
  for (const message of messages) {
    const reply = message.authorType === 'user' ? parseAnnouncementReply(message.body) : null;
    const thread = reply && threads.get(reply.announcementId);
    if (thread) {
      thread.replies.push(message);
      if (timestamp(message.createdAt) > timestamp(thread.createdAt)) thread.createdAt = message.createdAt;
    } else {
      entries.push({ kind: 'message', key: `message-${message.messageId}`, createdAt: message.createdAt, message });
    }
  }
  for (const thread of threads.values()) thread.replies.sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt));
  return entries.sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt));
}

export function parseAnnouncementReply(body: string): { announcementId: string; title: string; reply: string } | null {
  const match = /^お便り「(.+?)」（ID: ([^)]+)）への返信:\n([\s\S]*)$/.exec(body);
  if (!match) return null;
  return { title: match[1], announcementId: match[2], reply: match[3] };
}
