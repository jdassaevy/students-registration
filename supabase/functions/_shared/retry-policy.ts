const RETRYABLE = new Set(["payment_confirmation", "receipt_document", "payment_voided"]);

export function canRetryAutomationType(type: string): boolean {
  return RETRYABLE.has(type);
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
};

export type RetryEligibility =
  | "eligible"
  | "forbidden"
  | "unsupported"
  | "missing_phone"
  | "missing_consent"
  | "missing_receipt";

export function retryEligibility({
  ownerMatches,
  hasPhone,
  hasConsent,
  type,
  hasRequiredReceipt,
}: RetryEligibilityInput): RetryEligibility {
  if (!ownerMatches) return "forbidden";
  if (!canRetryAutomationType(type)) return "unsupported";
  if (!hasPhone) return "missing_phone";
  if (!hasConsent) return "missing_consent";
  if (type === "receipt_document" && !hasRequiredReceipt) return "missing_receipt";
  return "eligible";
}
