const RETRYABLE = new Set(["payment_confirmation", "receipt_document", "payment_voided"]);

const META_CONFIGURATION_FIX_CODES = new Set([
  "100",
  "190",
  "131008",
  "131009",
  "132000",
  "132001",
  "132005",
  "132007",
  "132012",
]);

export function canRetryAutomationType(type: string): boolean {
  return RETRYABLE.has(type);
}

export function requiresMetaConfigurationFix(errorCode?: string | null): boolean {
  return META_CONFIGURATION_FIX_CODES.has(String(errorCode || "").trim());
}

export function buildRetryIdempotencyKey(sourceMessageId: string, requestId: string): string {
  return `retry:${sourceMessageId}:${requestId}`;
}

export type RetryEligibilityInput = {
  ownerMatches: boolean;
  hasPhone: boolean;
  hasConsent: boolean;
  type: string;
  hasRequiredReceipt: boolean;
  sourceStatus?: string | null;
  errorCode?: string | null;
  configurationFixAcknowledged?: boolean;
};

export type RetryEligibility =
  | "eligible"
  | "forbidden"
  | "unsupported"
  | "not_failed"
  | "configuration_fix_required"
  | "missing_phone"
  | "missing_consent"
  | "missing_receipt";

export function retryEligibility({
  ownerMatches,
  hasPhone,
  hasConsent,
  type,
  hasRequiredReceipt,
  sourceStatus = "failed",
  errorCode = null,
  configurationFixAcknowledged = false,
}: RetryEligibilityInput): RetryEligibility {
  if (!ownerMatches) return "forbidden";
  if (!canRetryAutomationType(type)) return "unsupported";
  if (sourceStatus !== "failed") return "not_failed";
  if (requiresMetaConfigurationFix(errorCode) && !configurationFixAcknowledged) {
    return "configuration_fix_required";
  }
  if (!hasPhone) return "missing_phone";
  if (!hasConsent) return "missing_consent";
  if (type === "receipt_document" && !hasRequiredReceipt) return "missing_receipt";
  return "eligible";
}
