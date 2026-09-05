import { FeedbackRequestError, hashSecretToken, safeEqualHash } from '../../feedback/lib/security';
import type { MemberDatabase, Row } from './database';
import { createFeedbackConversationStore } from '../../feedback/lib/store';
import { randomBytes } from 'node:crypto';

export type Member = { memberId: string; generalNumber: number; analyticsSubject: string; paidNumber: number | null; billingLinkStatus: 'not_connected'; registeredAt: string; secretHash: string };
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
      const member: Member = { ...auth, generalNumber: number, analyticsSubject: randomBytes(24).toString('base64url'), paidNumber: null, billingLinkStatus: 'not_connected', registeredAt: this.now().toISOString(), secretHash: hashSecretToken(auth.secretToken) };
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
