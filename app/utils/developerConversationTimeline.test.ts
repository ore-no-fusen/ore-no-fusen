import { describe, expect, it } from 'vitest';
import { buildConversationTimeline, parseAnnouncementReply } from './developerConversationTimeline';

describe('developer conversation timeline', () => {
  it('お便りと会話を時刻順に混ぜ、最新を末尾に置く', () => {
    const timeline = buildConversationTimeline(
      [{ id: 'new', title: '新', body: '', createdAt: '2026-09-26T10:00:00Z' }, { id: 'old', title: '旧', body: '', createdAt: '2026-09-25T10:00:00Z' }],
      [{ messageId: 'reply', authorType: 'user', body: '返信', createdAt: '2026-09-26T11:00:00Z', readByUser: true }, { messageId: 'between', authorType: 'developer', body: '途中', createdAt: '2026-09-25T11:00:00Z', readByUser: true }],
    );
    expect(timeline.map((item) => item.key)).toEqual(['announcement-old', 'message-between', 'announcement-new', 'message-reply']);
  });

  it('返信先を表示するためのIDと本文を分離する', () => {
    expect(parseAnnouncementReply('お便り「テスト」（ID: mail-1）への返信:\nこんにちは'))
      .toEqual({ title: 'テスト', announcementId: 'mail-1', reply: 'こんにちは' });
    expect(parseAnnouncementReply('普通の会話')).toBeNull();
  });
});
