import { describe, expect, it } from 'vitest';
import { buildConversationTimeline, parseAnnouncementReply } from './developerConversationTimeline';

describe('developer conversation timeline', () => {
  it('お便りへの返信を同じスレッドに置き、最後に動いたスレッドを末尾に置く', () => {
    const timeline = buildConversationTimeline(
      [{ id: 'new', title: '新', body: '', createdAt: '2026-09-26T10:00:00Z' }, { id: 'old', title: '旧', body: '', createdAt: '2026-09-25T10:00:00Z' }],
      [{ messageId: 'reply', authorType: 'user', body: 'お便り「新」（ID: new）への返信:\n返信', createdAt: '2026-09-26T11:00:00Z', readByUser: true }, { messageId: 'between', authorType: 'developer', body: '途中', createdAt: '2026-09-25T11:00:00Z', readByUser: true }],
    );
    expect(timeline.map((item) => item.key)).toEqual(['announcement-old', 'message-between', 'announcement-new']);
    expect(timeline[2].kind === 'announcement' && timeline[2].replies.map((reply) => reply.messageId)).toEqual(['reply']);
  });

  it('新しい返信が付いた古いお便りを下へ移し、返信先のない発言は独立させる', () => {
    const timeline = buildConversationTimeline(
      [{ id: 'old', title: '旧', body: '', createdAt: '2026-09-25T10:00:00Z' }, { id: 'new', title: '新', body: '', createdAt: '2026-09-26T10:00:00Z' }],
      [{ messageId: 'late', authorType: 'user', body: 'お便り「旧」（ID: old）への返信:\n遅い返信', createdAt: '2026-09-26T20:00:00Z', readByUser: true }, { messageId: 'plain', authorType: 'user', body: '普通の会話', createdAt: '2026-09-26T11:00:00Z', readByUser: true }],
    );
    expect(timeline.map((item) => item.key)).toEqual(['announcement-new', 'message-plain', 'announcement-old']);
  });

  it('返信先を表示するためのIDと本文を分離する', () => {
    expect(parseAnnouncementReply('お便り「テスト」（ID: mail-1）への返信:\nこんにちは'))
      .toEqual({ title: 'テスト', announcementId: 'mail-1', reply: 'こんにちは' });
    expect(parseAnnouncementReply('普通の会話')).toBeNull();
  });
});
