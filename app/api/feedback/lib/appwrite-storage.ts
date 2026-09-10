const APPWRITE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

export class FeedbackImageStorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly upstreamType?: string,
  ) {
    super(message);
  }
}

type AppwriteStorageConfig = {
  endpoint: string;
  projectId: string;
  bucketId: string;
  apiKey: string;
};

function readConfig(): AppwriteStorageConfig {
  const endpoint = process.env.APPWRITE_ENDPOINT?.replace(/\/$/, '');
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const bucketId = process.env.APPWRITE_BUCKET_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  if (!endpoint || !projectId || !bucketId || !apiKey) {
    throw new FeedbackImageStorageError('Image storage is unavailable', 503);
  }
  if (!endpoint.startsWith('https://') || !APPWRITE_ID_PATTERN.test(projectId) || !APPWRITE_ID_PATTERN.test(bucketId)) {
    throw new FeedbackImageStorageError('Image storage configuration is invalid', 503);
  }
  return { endpoint, projectId, bucketId, apiKey };
}

function assertFileId(fileId: string): void {
  if (!APPWRITE_ID_PATTERN.test(fileId)) {
    throw new FeedbackImageStorageError('Invalid image file id', 400);
  }
}

async function appwriteRequest(path: string, init?: RequestInit): Promise<Response> {
  const config = readConfig();
  const response = await fetch(`${config.endpoint}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'X-Appwrite-Project': config.projectId,
      'X-Appwrite-Key': config.apiKey,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const upstreamType = await readUpstreamErrorType(response);
    throw new FeedbackImageStorageError(
      'Image storage request failed',
      response.status >= 500 ? 503 : response.status,
      upstreamType,
    );
  }
  return response;
}

async function readUpstreamErrorType(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('type' in body)) return undefined;
    const type = body.type;
    return typeof type === 'string' && /^[a-z_]{1,80}$/.test(type) ? type : undefined;
  } catch {
    return undefined;
  }
}

function filePath(fileId: string): string {
  const { bucketId } = readConfig();
  return `/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(fileId)}`;
}

export async function createPrivateImageFile(fileId: string, bytes: Uint8Array): Promise<void> {
  assertFileId(fileId);
  const { bucketId } = readConfig();
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  const form = new FormData();
  form.set('fileId', fileId);
  form.set('file', new Blob([body.buffer], { type: 'application/octet-stream' }), `${fileId}.bin`);
  await appwriteRequest(`/storage/buckets/${encodeURIComponent(bucketId)}/files`, {
    method: 'POST',
    body: form,
  });
}

export async function readPrivateImageFile(fileId: string): Promise<Uint8Array> {
  assertFileId(fileId);
  const response = await appwriteRequest(`${filePath(fileId)}/download`, { method: 'GET' });
  return new Uint8Array(await response.arrayBuffer());
}

export async function deletePrivateImageFile(fileId: string): Promise<void> {
  assertFileId(fileId);
  await appwriteRequest(filePath(fileId), { method: 'DELETE' });
}
