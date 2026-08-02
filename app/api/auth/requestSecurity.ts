const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

export class RequestValidationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function readLimitedJson(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestValidationError('request body too large', 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RequestValidationError('request body too large', 413);
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RequestValidationError('invalid JSON body', 400);
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError('invalid JSON body', 400);
  }
  return value as Record<string, unknown>;
}

export function requireString(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string {
  const value = body[field];
  if (typeof value !== 'string' || !value || value.length > maxLength) {
    throw new RequestValidationError(`invalid ${field}`, 400);
  }
  return value;
}

export function oauthFetchSignal(): AbortSignal {
  return AbortSignal.timeout(10_000);
}
