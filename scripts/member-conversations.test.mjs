import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listRecentConversations, loadConversation, replyConversation } from './member-conversations.mjs';

const id = '207705bd-64b9-4f8f-a458-287fdfd94ca5';
const memberId = '11111111-1111-4111-8111-111111111111';
const root = 'projects/test/databases/(default)/documents';

function documentFor(url) {
  if (url.includes('/member_environments/development/conversations/')) {
    return { fields: { payload: { stringValue: JSON.stringify({ memberId }) } } };
  }
  if (url.includes('/member_environments/production/conversations/')) return null;
  if (url.includes(`/member_environments/development/members/${memberId}`)) {
    return { fields: { payload: { stringValue: JSON.stringify({ generalNumber: 10001 }) } } };
  }
  if (url.endsWith(`/feedback_conversations/${id}`)) return { fields: {
    updated_at: { stringValue: '2026-09-28T00:00:00Z' },
    delivery_enabled: { booleanValue: true },
  } };
  return null;
}

test('開発環境に紐づいた会話だけを最近の一覧に表示する', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes('feedback_conversations?')) return { ok: true, json: async () => ({ documents: [
      { name: `${root}/feedback_conversations/${id}`, fields: { updated_at: { stringValue: '2026-09-28T00:00:00Z' } } },
    ] }) };
    const doc = documentFor(target);
    return doc ? { ok: true, json: async () => doc } : { status: 404 };
  };
  try {
    assert.deepEqual(await listRecentConversations('token', 'test', 'development'), [{ id, memberNumber: 10001, updatedAt: '2026-09-28T00:00:00Z' }]);
    assert.deepEqual(await listRecentConversations('token', 'test', 'production'), []);
  } finally { globalThis.fetch = originalFetch; }
});

test('会話本文を時刻順で読み、開発者の返信を同じ会話へ直接保存する', async () => {
  const originalFetch = globalThis.fetch;
  let write;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.endsWith('/messages?pageSize=300')) return { ok: true, json: async () => ({ documents: [
      { name: `${root}/feedback_conversations/${id}/messages/old`, fields: { message_id: { stringValue: 'old' }, author_type: { stringValue: 'user' }, body: { stringValue: 'こんにちは' }, created_at: { stringValue: '2026-09-27T00:00:00Z' } } },
    ] }) };
    if (target.includes('documents:commit')) { write = JSON.parse(init.body).writes; return { ok: true }; }
    const doc = documentFor(target);
    return doc ? { ok: true, json: async () => doc } : { status: 404 };
  };
  try {
    const conversation = await loadConversation('token', 'test', 'development', id);
    assert.equal(conversation.memberNumber, 10001);
    assert.deepEqual(conversation.messages.map(message => message.body), ['こんにちは']);
    await assert.rejects(replyConversation('token', 'test', 'production', id, '返事'), /紐づく会話がありません/);
    await assert.rejects(replyConversation('token', 'test', 'development', '../other', '返事'), /会話IDが不正/);
    assert.equal(write, undefined);
    await replyConversation('token', 'test', 'development', id, ' 返事 ');
    assert.equal(write.length, 2);
    assert.equal(write[0].update.fields.author_type.stringValue, 'developer');
    assert.equal(write[0].update.fields.body.stringValue, '返事');
    assert.equal(write[0].update.fields.read_by_user.booleanValue, false);
    assert.equal(write[0].currentDocument.exists, false);
    assert.deepEqual(write[1].updateMask.fieldPaths, ['updated_at']);
    assert.equal(write[1].currentDocument.exists, true);
  } finally { globalThis.fetch = originalFetch; }
});
