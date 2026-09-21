import { constantTimeEqual } from "./request-security.ts";

export const MAX_WEBHOOK_BYTES = 256 * 1024;

type ProviderStatus = "sent" | "delivered" | "read" | "failed";

export type WebhookStatus = {
  id: string;
  status: ProviderStatus;
  timestamp: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export function mapProviderStatus(value: unknown): ProviderStatus | null {
  return value === "sent" || value === "delivered" || value === "read" || value === "failed"
    ? value
    : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}

export function extractStatuses(payload: any): WebhookStatus[] {
  const result: WebhookStatus[] = [];
  if (payload?.object !== "whatsapp_business_account") return result;

  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const statuses = Array.isArray(change?.value?.statuses) ? change.value.statuses : [];
      for (const item of statuses) {
        const status = mapProviderStatus(item?.status);
        const id = boundedString(item?.id, 512);
        if (!status || !id) continue;
        const firstError = Array.isArray(item?.errors) ? item.errors[0] : null;
        const rawTimestamp = boundedString(item?.timestamp, 32);
        result.push({
          id,
          status,
          timestamp: rawTimestamp && /^\d{1,13}$/.test(rawTimestamp) ? rawTimestamp : null,
          errorCode: boundedString(firstError?.code, 64),
          errorMessage: boundedString(
            firstError?.title || firstError?.message || firstError?.error_data?.details,
            1000,
          ),
        });
      }
    }
  }

  return result;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!rawBody || !signatureHeader || !appSecret) return false;
  if (!/^sha256=[0-9a-f]{64}$/i.test(signatureHeader)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)),
  );
  const expected = `sha256=${bytesToHex(signature)}`;
  return constantTimeEqual(expected, signatureHeader.toLowerCase());
}
