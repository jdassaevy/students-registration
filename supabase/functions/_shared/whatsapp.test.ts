import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDocumentPayload,
  buildTemplatePayload,
  isWhatsappEligible,
  normalizeRecipientPhone,
  sanitizeMetaError,
  TEMPLATE_NAMES,
} from "./whatsapp.ts";

test("normalizes brazilian mobile phones to E.164 digits", () => {
  assert.equal(normalizeRecipientPhone("(48) 99978-4892"), "5548999784892");
  assert.equal(normalizeRecipientPhone("+55 48 99978-4892"), "5548999784892");
  assert.equal(normalizeRecipientPhone(""), null);
});

test("requires both phone and consent before sending", () => {
  assert.equal(isWhatsappEligible({ phone: "5548999784892", consent: true }), true);
  assert.equal(isWhatsappEligible({ phone: null, consent: true }), false);
  assert.equal(isWhatsappEligible({ phone: "5548999784892", consent: false }), false);
});

test("builds approved template payload shape", () => {
  const payload = buildTemplatePayload({
    to: "5548999784892",
    templateName: TEMPLATE_NAMES.dueToday,
    languageCode: "pt_BR",
    bodyParameters: ["João", "Academia X", "10/09/2026", "R$ 250,00", "Professor Carlos", "5548999999999"],
  });
  assert.equal(payload.messaging_product, "whatsapp");
  assert.equal(payload.to, "5548999784892");
  assert.equal(payload.type, "template");
  assert.equal(payload.template.name, TEMPLATE_NAMES.dueToday);
  assert.equal(payload.template.language.code, "pt_BR");
  assert.equal(payload.template.components[0].type, "body");
  assert.equal(payload.template.components[0].parameters.length, 6);
});

test("builds document message payload", () => {
  const payload = buildDocumentPayload({
    to: "5548999784892",
    link: "https://example.com/receipt.pdf",
    filename: "recibo-DL-123.pdf",
    caption: "Recibo de pagamento",
  });
  assert.equal(payload.type, "document");
  assert.equal(payload.document.link, "https://example.com/receipt.pdf");
  assert.equal(payload.document.filename, "recibo-DL-123.pdf");
});

test("sanitizes provider errors without credentials", () => {
  const error = sanitizeMetaError({
    message: "Invalid OAuth access token ABCSECRET",
    type: "OAuthException",
    code: 190,
    error_subcode: 463,
    fbtrace_id: "trace",
  });
  assert.equal(error.code, 190);
  assert.equal(error.subcode, 463);
  assert.equal(error.type, "OAuthException");
  assert.equal(error.message.includes("ABCSECRET"), false);
});
