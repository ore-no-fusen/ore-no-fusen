import { NextResponse } from 'next/server';
import { FeedbackRequestError, readFeedbackJson } from '../../feedback/lib/security';
import { memberDatabase } from '../lib/database';
import { requireReportToken } from '../lib/report-auth';
import { credentials, MemberService, publicMember } from '../lib/service';

// Bump this version for each change to the deployed member API.
// 1.0.0 starts tracking with the member-scoped history cleanup from PR #159.
const MEMBER_API_VERSION = '1.0.0';
const responseHeaders = {
  'Cache-Control': 'no-store',
  'X-Member-API-Version': MEMBER_API_VERSION,
};

export async function GET(req: Request) {
  if (new URL(req.url).pathname === '/api/members/version') {
    return NextResponse.json({ version: MEMBER_API_VERSION }, { headers: responseHeaders });
  }
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: responseHeaders });
}
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
      return NextResponse.json(result, { headers: responseHeaders });
    }
    const auth = credentials(body);
    switch (operation) {
      case 'register': result = await service.register(auth); break;
      case 'status': result = publicMember((await service.authenticate(auth)).value); break;
      case 'link-conversation': result = await service.linkConversation(auth,body.conversationId,body.conversationSecret); break;
      case 'heartbeat': result = await service.heartbeat(auth, body.week, body.features, body.consent, body.openMinutes, body.appVersion, body.usageSchema); break;
      case 'announcements': result = await service.announcements(auth); break;
      case 'usage': result = await service.recordUsage(auth, body.week, body.features, body.consent, body.openMinutes, body.usageSchema, body.history, body.reporterId, body.firstUseAt, body.consentStatus); break;
      default: throw new FeedbackRequestError('Not found', 404);
    }
    return NextResponse.json(result, { headers: responseHeaders });
  } catch (error) {
    const status = error instanceof FeedbackRequestError ? error.status : 503;
    return NextResponse.json({ error: error instanceof FeedbackRequestError ? error.message : 'Member service unavailable' }, { status, headers: responseHeaders });
  }
}
