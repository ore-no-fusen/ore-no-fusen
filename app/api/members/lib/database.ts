import { getFirestoreAccessToken } from '../../feedback/lib/store';

export type Row<T = unknown> = { value: T; version: string };
export type Change = { path: string; value: unknown; version: string | null; expiresAt?: string };
export interface MemberDatabase {
  get<T>(path: string): Promise<Row<T> | null>;
  commit(changes: Change[]): Promise<boolean>;
  list<T>(collection: string): Promise<Array<Row<T> & { path: string }>>;
  deliveryAnnouncements?<T>(): Promise<Array<Row<T> & { path: string }>>;
  remove(paths: string[]): Promise<void>;
}
type Document = { name: string; updateTime: string; fields: { payload: { stringValue: string } } };

type DeliveryRow = Row<{ active: boolean; expiresAt: string }> & { path: string };
// Only authenticated server code consumes this cache. Recipients are filtered per request.
const deliveryCache = new Map<string, { until: number; rows: Promise<DeliveryRow[]> }>();

// The database deliberately has no in-memory fallback.
export class FirestoreMemberDatabase implements MemberDatabase {
  private root: string;
  private prefix: string;
  constructor(private email: string, private key: string, project: string, database: string, environment: string) {
    this.root = `projects/${project}/databases/${database}/documents`;
    this.prefix = `member_environments/${environment}/`;
  }
  private async request(path: string, init: RequestInit = {}) {
    return fetch(`https://firestore.googleapis.com/v1/${this.root}${path}`, {
      ...init, cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${await getFirestoreAccessToken(this.email, this.key)}`, 'Content-Type': 'application/json' },
    });
  }
  async get<T>(path: string): Promise<Row<T> | null> {
    const response = await this.request(`/${this.prefix}${path}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Member database unavailable');
    const doc = await response.json() as Document;
    return { value: JSON.parse(doc.fields.payload.stringValue) as T, version: doc.updateTime };
  }
  async commit(changes: Change[]): Promise<boolean> {
    const writes = changes.map(({ path, value, version, expiresAt }) => ({
      update: { name: `${this.root}/${this.prefix}${path}`, fields: {
        payload: { stringValue: JSON.stringify(value) },
        ...(expiresAt ? { expires_at: { timestampValue: expiresAt } } : {}),
      } },
      currentDocument: version === null ? { exists: false } : { updateTime: version },
    }));
    const response = await this.request(':commit', { method: 'POST', body: JSON.stringify({ writes }) });
    if ([409, 412].includes(response.status)) return false;
    // Firestore FAILED_PRECONDITION can be returned as HTTP 400.
    if (response.status === 400) {
      const error = await response.json() as { error?: { status?: string } };
      if (error.error?.status === 'FAILED_PRECONDITION') return false;
    }
    if (!response.ok) throw new Error('Member database write failed');
    return true;
  }
  async list<T>(collection: string): Promise<Array<Row<T> & { path: string }>> {
    const result: Array<Row<T> & { path: string }> = [];
    let token = '';
    do {
      const response = await this.request(`/${this.prefix}${collection}?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`);
      if (!response.ok) throw new Error('Member database read failed');
      const body = await response.json() as { documents?: Document[]; nextPageToken?: string };
      for (const doc of body.documents ?? []) result.push({ path: `${collection}/${doc.name.split('/').pop()}`, value: JSON.parse(doc.fields.payload.stringValue) as T, version: doc.updateTime });
      token = body.nextPageToken ?? '';
      if (result.length > 30_000) throw new Error('Report exceeds supported size');
    } while (token);
    return result;
  }
  async remove(paths: string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += 400) {
      const response = await this.request(':commit', { method: 'POST', body: JSON.stringify({ writes: paths.slice(i, i + 400).map(path => ({ delete: `${this.root}/${this.prefix}${path}` })) }) });
      if (!response.ok) throw new Error('Member data deletion failed');
    }
  }
  async deliveryAnnouncements<T>(): Promise<Array<Row<T> & { path: string }>> {
    const key = `${this.root}/${this.prefix}`;
    const now = Date.now();
    let entry = deliveryCache.get(key);
    if (!entry || entry.until <= now) {
      if (deliveryCache.size >= 32) deliveryCache.clear();
      const rows = this.list<{ active: boolean; expiresAt: string }>('announcements')
        .then(rows => rows.filter(row => row.value.active && Date.parse(row.value.expiresAt) > Date.now()));
      entry = { until: now + 5 * 60 * 1000, rows };
      deliveryCache.set(key, entry);
      rows.catch(() => { if (deliveryCache.get(key)?.rows === rows) deliveryCache.delete(key); });
    }
    return await entry.rows as Array<Row<T> & { path: string }>;
  }
}

export function memberDatabase(): MemberDatabase {
  const { FIREBASE_PROJECT_ID: project, FIREBASE_CLIENT_EMAIL: email, FIREBASE_PRIVATE_KEY: key, MEMBER_ENVIRONMENT: environment } = process.env;
  if (process.env.MEMBER_API_ENABLED !== 'true' || !project || !email || !key || !['production', 'development', 'test'].includes(environment ?? '')) throw new Error('Member service is not configured');
  if (environment === 'production' && process.env.VERCEL_ENV !== 'production') throw new Error('Production membership requires production deployment');
  return new FirestoreMemberDatabase(email, key, project, process.env.FIREBASE_DATABASE_ID || '(default)', environment!);
}
