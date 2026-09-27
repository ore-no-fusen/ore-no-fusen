import crypto from 'node:crypto';

const CONVERSATION_ID = /^[a-zA-Z0-9_-]{1,100}$/;
const ROOT = projectId => `projects/${projectId}/databases/(default)/documents`;
function assertEnvironment(environment) {
  if (environment !== 'development' && environment !== 'production') throw new Error('環境が不正です');
}

function assertConversationId(id) {
  if (typeof id !== 'string' || !CONVERSATION_ID.test(id)) throw new Error('会話IDが不正です');
}

async function readDocument(token, name) {
  const response = await fetch(`https://firestore.googleapis.com/v1/${name}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`会話の取得に失敗しました (${response.status})`);
  return response.json();
}

async function linkedConversation(token, projectId, environment, id) {
  assertEnvironment(environment);
  assertConversationId(id);
  const root = ROOT(projectId);
  const link = await readDocument(token, `${root}/member_environments/${environment}/conversations/${id}`);
  if (!link?.fields?.payload?.stringValue) throw new Error('この環境に紐づく会話がありません');
  const { memberId } = JSON.parse(link.fields.payload.stringValue);
  if (typeof memberId !== 'string' || !CONVERSATION_ID.test(memberId)) throw new Error('会員との紐づけが不正です');
  const conversation = await readDocument(token, `${root}/feedback_conversations/${id}`);
  if (!conversation?.fields) throw new Error('会話が見つかりません');
  return { root, conversation, memberId };
}

export async function listRecentConversations(token, projectId, environment) {
  assertEnvironment(environment);
  const root = ROOT(projectId);
  const query = new URLSearchParams({ pageSize: '50', orderBy: 'updated_at desc' });
  const response = await fetch(`https://firestore.googleapis.com/v1/${root}/feedback_conversations?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`会話一覧の取得に失敗しました (${response.status})`);
  const data = await response.json();
  const recent = [];
  for (const doc of data.documents || []) {
    const id = doc.name?.split('/').at(-1);
    if (!id || !CONVERSATION_ID.test(id)) continue;
    const link = await readDocument(token, `${root}/member_environments/${environment}/conversations/${id}`);
    if (!link?.fields?.payload?.stringValue) continue;
    const memberId = JSON.parse(link.fields.payload.stringValue).memberId;
    if (typeof memberId !== 'string' || !CONVERSATION_ID.test(memberId)) continue;
    const member = await readDocument(token, `${root}/member_environments/${environment}/members/${memberId}`);
    const number = member?.fields?.payload?.stringValue && JSON.parse(member.fields.payload.stringValue).generalNumber;
    recent.push({ id, memberNumber: Number.isSafeInteger(number) ? number : null, updatedAt: doc.fields?.updated_at?.stringValue || '' });
  }
  return recent;
}

export async function loadConversation(token, projectId, environment, id) {
  const { root, conversation, memberId } = await linkedConversation(token, projectId, environment, id);
  const member = await readDocument(token, `${root}/member_environments/${environment}/members/${memberId}`);
  const number = member?.fields?.payload?.stringValue && JSON.parse(member.fields.payload.stringValue).generalNumber;
  const messages = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '300' });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await fetch(`https://firestore.googleapis.com/v1/${root}/feedback_conversations/${id}/messages?${query}`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) break;
    if (!response.ok) throw new Error(`会話本文の取得に失敗しました (${response.status})`);
    const data = await response.json();
    for (const doc of data.documents || []) {
      const fields = doc.fields || {};
      if (fields.shadow_only?.booleanValue === true) continue;
      messages.push({
        id: fields.message_id?.stringValue || doc.name.split('/').at(-1),
        authorType: fields.author_type?.stringValue,
        body: fields.body?.stringValue || '',
        createdAt: fields.created_at?.stringValue || '',
      });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { id, memberNumber: Number.isSafeInteger(number) ? number : null, updatedAt: conversation.fields.updated_at?.stringValue || '', messages };
}

export async function replyConversation(token, projectId, environment, id, body) {
  if (typeof body !== 'string' || !body.trim() || body.length > 1000) throw new Error('返信本文を1〜1000文字で入力してください');
  const { root, conversation } = await linkedConversation(token, projectId, environment, id);
  if (conversation.fields.delivery_enabled?.booleanValue === false || conversation.fields.shadow_only?.booleanValue === true) {
    throw new Error('この会話には返信を配信できません');
  }
  const messageId = crypto.randomUUID();
  const now = new Date().toISOString();
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [
      { update: { name: `${root}/feedback_conversations/${id}/messages/${messageId}`, fields: {
        message_id: { stringValue: messageId }, conversation_id: { stringValue: id }, author_type: { stringValue: 'developer' },
        body: { stringValue: body.trim() }, created_at: { stringValue: now }, read_by_user: { booleanValue: false }, shadow_only: { booleanValue: false },
      } }, currentDocument: { exists: false } },
      { update: { name: `${root}/feedback_conversations/${id}`, fields: { updated_at: { stringValue: now } } },
        updateMask: { fieldPaths: ['updated_at'] }, currentDocument: { exists: true } },
    ] }),
  });
  if (!response.ok) throw new Error(`返信の保存に失敗しました (${response.status})`);
  return messageId;
}
