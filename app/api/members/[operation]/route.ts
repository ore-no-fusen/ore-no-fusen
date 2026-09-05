import { NextResponse } from 'next/server';
import { FeedbackRequestError, readFeedbackJson } from '../../feedback/lib/security';
import { memberDatabase } from '../lib/database';
import { requireReportToken } from '../lib/report-auth';
import { credentials, MemberService, publicMember } from '../lib/service';

export async function GET() { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }); }
export async function POST(req: Request) {
  try {
    const operation = new URL(req.url).pathname.split('/').pop();
    const body = await readFeedbackJson(req);
    if (body.environment !== process.env.MEMBER_ENVIRONMENT) throw new FeedbackRequestError('Wrong environment', 400);
    const service = new MemberService(memberDatabase());
    let result: unknown;
    if (operation === 'lookup') {
      requireReportToken(req);
      result = await service.lookupByGeneralNumber(body.generalNumber);
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }
    const auth = credentials(body);
    switch (operation) {
      case 'register': result = await service.register(auth); break;
      case 'status': result = publicMember((await service.authenticate(auth)).value); break;
      case 'link-conversation': result = await service.linkConversation(auth,body.conversationId,body.conversationSecret); break;
      default: throw new FeedbackRequestError('Not found', 404);
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof FeedbackRequestError ? error.status : 503;
    return NextResponse.json({ error: error instanceof FeedbackRequestError ? error.message : 'Member service unavailable' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
