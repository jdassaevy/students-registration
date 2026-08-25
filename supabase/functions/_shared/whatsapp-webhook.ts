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

export function extractStatuses(payload: any): WebhookStatus[] {
  const result: WebhookStatus[] = [];
  if (payload?.object !== "whatsapp_business_account") return result;

  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const statuses = Array.isArray(change?.value?.statuses) ? change.value.statuses : [];
      for (const item of statuses) {
        const status = mapProviderStatus(item?.status);
        const id = typeof item?.id === "string" ? item.id.trim() : "";
        if (!status || !id) continue;
        const firstError = Array.isArray(item?.errors) ? item.errors[0] : null;
        result.push({
          id,
          status,
          timestamp: item?.timestamp ? String(item.timestamp) : null,
          errorCode: firstError?.code != null ? String(firstError.code) : null,
          errorMessage: firstError?.title || firstError?.message || firstError?.error_data?.details || null,
        });
      }
    }
  }

  return result;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!rawBody || !signatureHeader?.startsWith("sha256=") || !appSecret) return false;

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
  return constantTimeEqual(expected, signatureHeader);
}
