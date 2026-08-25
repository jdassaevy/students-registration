export const TEMPLATE_NAMES = {
  reminderBeforeDue: "dassaevy_reminder_before_due",
  dueToday: "dassaevy_due_today",
  overdue: "dassaevy_overdue",
  paymentConfirmation: "dassaevy_payment_confirmation",
  paymentVoided: "dassaevy_payment_voided",
} as const;

type EligibilityInput = { phone?: string | null; consent?: boolean | null };

type TemplateInput = {
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParameters?: Array<string | number>;
};

type DocumentInput = {
  to: string;
  link: string;
  filename: string;
  caption?: string;
};

export function normalizeRecipientPhone(value?: string | null): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function isWhatsappEligible({ phone, consent }: EligibilityInput): boolean {
  return Boolean(normalizeRecipientPhone(phone) && consent === true);
}

export function buildTemplatePayload({
  to,
  templateName,
  languageCode = "pt_BR",
  bodyParameters = [],
}: TemplateInput) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeRecipientPhone(to) || to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: bodyParameters.length
        ? [{
            type: "body",
            parameters: bodyParameters.map(value => ({ type: "text", text: String(value) })),
          }]
        : [],
    },
  };
}

export function buildDocumentPayload({ to, link, filename, caption = "" }: DocumentInput) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeRecipientPhone(to) || to,
    type: "document",
    document: {
      link,
      filename,
      ...(caption ? { caption } : {}),
    },
  };
}

export function sanitizeMetaError(error: any) {
  const message = String(error?.message || "Meta API error")
    .replace(/access token[^\s,]*/gi, "access token [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]");
  return {
    message,
    type: error?.type ? String(error.type) : null,
    code: Number.isFinite(Number(error?.code)) ? Number(error.code) : null,
    subcode: Number.isFinite(Number(error?.error_subcode)) ? Number(error.error_subcode) : null,
  };
}

export async function sendMetaPayload({
  phoneNumberId,
  accessToken,
  graphVersion,
  payload,
  fetchImpl = fetch,
}: {
  phoneNumberId: string;
  accessToken: string;
  graphVersion: string;
  payload: unknown;
  fetchImpl?: typeof fetch;
}) {
  const response = await fetchImpl(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const safe = sanitizeMetaError(body?.error || body);
    const err = new Error(safe.message) as Error & { meta?: ReturnType<typeof sanitizeMetaError> };
    err.meta = safe;
    throw err;
  }
  return body;
}
