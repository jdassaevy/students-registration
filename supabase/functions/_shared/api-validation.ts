export const MAX_JSON_BYTES = 64 * 1024;

export type ApiInputCode = 'INVALID_JSON' | 'PAYLOAD_TOO_LARGE' | 'INVALID_INPUT';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ApiInputError extends Error {
  code: ApiInputCode;
  status: number;
  field: string | null;

  constructor(code: ApiInputCode, status: number, field: string | null = null) {
    super(code);
    this.name = 'ApiInputError';
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

export function isApiInputError(error: unknown): error is ApiInputError {
  return error instanceof ApiInputError;
}

export function validationErrorPayload(error: ApiInputError): {
  error: string;
  code: ApiInputCode;
  field?: string;
} {
  const body: { error: string; code: ApiInputCode; field?: string } = {
    error: error.code === 'PAYLOAD_TOO_LARGE' ? 'Payload too large' : 'Invalid request',
    code: error.code,
  };
  if (error.field) body.field = error.field;
  return body;
}

function invalid(field: string | null): never {
  throw new ApiInputError('INVALID_INPUT', 400, field);
}

async function readBoundedBody(req: Request, maxBytes: number): Promise<string> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiInputError("PAYLOAD_TOO_LARGE", 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function readBoundedText(
  req: Request,
  maxBytes: number,
): Promise<string> {
  const length = req.headers.get('content-length');
  if (length && Number.isFinite(Number(length)) && Number(length) > maxBytes) {
    throw new ApiInputError('PAYLOAD_TOO_LARGE', 413);
  }

  return readBoundedBody(req, maxBytes);
}

export async function readJsonObject(
  req: Request,
  maxBytes: number = MAX_JSON_BYTES,
): Promise<Record<string, unknown>> {
  const raw = await readBoundedText(req, maxBytes);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiInputError('INVALID_JSON', 400);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    invalid(null);
  }

  return parsed as Record<string, unknown>;
}

export function requireUuid(value: unknown, field: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!UUID_RE.test(normalized)) invalid(field);
  return normalized;
}

export function optionalUuid(value: unknown, field: string): string | null {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return null;
  }
  return requireUuid(value, field);
}

export function requireEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!allowed.includes(normalized as T)) invalid(field);
  return normalized as T;
}

export function requireInteger(
  value: unknown,
  field: string,
  { min, max }: { min: number; max: number },
): number {
  const normalized = typeof value === 'string' && value.trim() !== ''
    ? Number(value.trim())
    : value;

  if (
    typeof normalized !== 'number' ||
    !Number.isInteger(normalized) ||
    normalized < min ||
    normalized > max
  ) {
    invalid(field);
  }

  return normalized;
}

export function requireTrimmedString(
  value: unknown,
  field: string,
  { maxLength }: { maxLength: number },
): string {
  if (typeof value !== 'string') invalid(field);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) invalid(field);
  return normalized;
}

export function optionalTrimmedString(
  value: unknown,
  field: string,
  { maxLength }: { maxLength: number },
): string | null {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return null;
  }
  return requireTrimmedString(value, field, { maxLength });
}

export function optionalPrimitiveArray(
  value: unknown,
  field: string,
  { maxItems }: { maxItems: number },
): Array<string | number> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) invalid(field);
  if (value.some(item => typeof item !== 'string' && typeof item !== 'number')) {
    invalid(field);
  }
  return [...value] as Array<string | number>;
}
