import { FeedbackRequestError, hashSecretToken, safeEqualHash } from '../../feedback/lib/security';

export function requireReportToken(req: Request) {
  const configured = process.env.MEMBER_REPORT_TOKEN;
  const supplied = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!configured || configured.length < 32) throw new Error('Member report access is not configured');
  if (!supplied || !safeEqualHash(hashSecretToken(supplied), hashSecretToken(configured))) {
    throw new FeedbackRequestError('Invalid report credentials', 403);
  }
}
