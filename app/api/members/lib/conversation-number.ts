import { memberDatabase } from './database';
import type { Member } from './service';

/** Resolve only server-owned mappings; never trust numbers in message bodies. */
export async function conversationMemberNumber(conversationId: string): Promise<string | null> {
  if (process.env.MEMBER_API_ENABLED !== 'true') return null;
  const db = memberDatabase();
  const link = await db.get<{memberId:string}>(`conversations/${conversationId}`);
  if (!link) return null;
  const member = await db.get<Member>(`members/${link.value.memberId}`);
  return member ? `会員番号 ${member.value.generalNumber}` : null;
}
