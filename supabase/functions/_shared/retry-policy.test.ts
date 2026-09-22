import { assertEquals } from "jsr:@std/assert";
import {
  buildRetryIdempotencyKey,
  canRetryAutomationType,
  requiresMetaConfigurationFix,
  retryEligibility,
} from "./retry-policy.ts";

Deno.test("only transactional message types are retryable", () => {
  assertEquals(canRetryAutomationType("payment_confirmation"), true);
  assertEquals(canRetryAutomationType("receipt_document"), true);
  assertEquals(canRetryAutomationType("payment_voided"), true);
  assertEquals(canRetryAutomationType("overdue"), false);
});

Deno.test("retry identity changes by request id", () => {
  assertEquals(buildRetryIdempotencyKey("msg-1", "req-1"), "retry:msg-1:req-1");
  assertEquals(buildRetryIdempotencyKey("msg-1", "req-2"), "retry:msg-1:req-2");
});

Deno.test("known Meta configuration/request failures require an explicit fix acknowledgement", () => {
  for (const code of ["190", "132000", "132001", "132012"]) {
    assertEquals(requiresMetaConfigurationFix(code), true);
    assertEquals(
      retryEligibility({
        ownerMatches: true,
        hasPhone: true,
        hasConsent: true,
        type: "payment_voided",
        hasRequiredReceipt: true,
        sourceStatus: "failed",
        errorCode: code,
      }),
      "configuration_fix_required",
    );
    assertEquals(
      retryEligibility({
        ownerMatches: true,
        hasPhone: true,
        hasConsent: true,
        type: "payment_voided",
        hasRequiredReceipt: true,
        sourceStatus: "failed",
        errorCode: code,
        configurationFixAcknowledged: true,
      }),
      "eligible",
    );
  }
});

Deno.test("retry requires a failed source message", () => {
  assertEquals(
    retryEligibility({
      ownerMatches: true,
      hasPhone: true,
      hasConsent: true,
      type: "payment_confirmation",
      hasRequiredReceipt: true,
      sourceStatus: "sent",
    }),
    "not_failed",
  );
});

Deno.test("retry eligibility rejects another academy", () => {
  assertEquals(retryEligibility({ ownerMatches: false, hasPhone: true, hasConsent: true, type: "payment_confirmation", hasRequiredReceipt: true }), "forbidden");
});

Deno.test("retry eligibility requires phone and consent", () => {
  assertEquals(retryEligibility({ ownerMatches: true, hasPhone: false, hasConsent: true, type: "payment_confirmation", hasRequiredReceipt: true }), "missing_phone");
  assertEquals(retryEligibility({ ownerMatches: true, hasPhone: true, hasConsent: false, type: "payment_confirmation", hasRequiredReceipt: true }), "missing_consent");
});

Deno.test("receipt retry requires receipt data", () => {
  assertEquals(retryEligibility({ ownerMatches: true, hasPhone: true, hasConsent: true, type: "receipt_document", hasRequiredReceipt: false }), "missing_receipt");
  assertEquals(retryEligibility({ ownerMatches: true, hasPhone: true, hasConsent: true, type: "receipt_document", hasRequiredReceipt: true }), "eligible");
});
