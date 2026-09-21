import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { corsHeadersFor, isAllowedCorsRequest } from "../_shared/cors.ts";
import {
  buildDocumentPayload,
  buildTemplatePayload,
  isWhatsappEligible,
  normalizeRecipientPhone,
  sanitizeMetaError,
  sendMetaPayload,
  TEMPLATE_NAMES,
} from "../_shared/whatsapp.ts";
import { requireAcademyAccess } from "../_shared/tenant.ts";
import { receiptMatchesStudent } from "../_shared/tenant-linkage.mjs";
import {
  isApiInputError,
  optionalPrimitiveArray,
  optionalTrimmedString,
  optionalUuid,
  readJsonObject,
  requireEnum,
  requireUuid,
  validationErrorPayload,
} from "../_shared/api-validation.ts";

const templateByType: Record<string, string> = {
  reminder_before_due: TEMPLATE_NAMES.reminderBeforeDue,
  due_today: TEMPLATE_NAMES.dueToday,
  overdue: TEMPLATE_NAMES.overdue,
  payment_confirmation: TEMPLATE_NAMES.paymentConfirmation,
  payment_voided: TEMPLATE_NAMES.paymentVoided,
};

const automationTypes = [
  "reminder_before_due",
  "due_today",
  "overdue",
  "payment_confirmation",
  "receipt_document",
  "payment_voided",
] as const;

function json(req: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json", ...extraHeaders },
  });
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  if (!isAllowedCorsRequest(req)) return json(req, { error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  let rateHeaders: Record<string, string> = {};
  const respond = (body: unknown, status = 200) => json(req, body, status, rateHeaders);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) return json(req, { error: "Unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const rateLimit = await checkRateLimit(admin, user.id, "send-whatsapp");
  if (rateLimit.kind === "limited") {
    return json(req, rateLimit.body, rateLimit.status, rateLimit.headers);
  }
  rateHeaders = rateLimit.kind === "allowed" ? rateLimit.headers : {};

  let studentId: string;
  let person: "person1" | "person2";
  let automationType: typeof automationTypes[number];
  let receiptId: string | null;
  let bodyParameters: Array<string | number>;
  let idempotencyKey: string | null;

  try {
    const body = await readJsonObject(req);
    studentId = requireUuid(body?.student_id, "student_id");
    person = requireEnum(body?.person, "person", ["person1", "person2"] as const);
    automationType = requireEnum(body?.automation_type, "automation_type", automationTypes);
    receiptId = automationType === "receipt_document"
      ? requireUuid(body?.receipt_id, "receipt_id")
      : optionalUuid(body?.receipt_id, "receipt_id");
    bodyParameters = optionalPrimitiveArray(body?.body_parameters, "body_parameters", { maxItems: 12 });
    idempotencyKey = optionalTrimmedString(body?.idempotency_key, "idempotency_key", { maxLength: 240 });
  } catch (error) {
    if (isApiInputError(error)) {
      return respond(validationErrorPayload(error), error.status);
    }
    throw error;
  }

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id,user_id,academy_id,class_id,person1,person2,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent")
    .eq("id", studentId)
    .single();
  if (studentError || !student) return respond({ error: "Student not found" }, 404);
  if (!student.academy_id) return respond({ error: "Student has no academy" }, 409);

  try {
    await requireAcademyAccess(admin, user.id, student.academy_id);
  } catch {
    return respond({ error: "Forbidden" }, 403);
  }

  if (person === "person2" && !student.person2) return respond({ error: "Person not found" }, 404);

  const phone = person === "person2" ? student.person2_phone : student.person1_phone;
  const consent = person === "person2" ? student.person2_whatsapp_consent : student.person1_whatsapp_consent;
  const normalizedPhone = normalizeRecipientPhone(phone);

  let validatedReceipt: any = null;
  if (automationType === "receipt_document") {
    const { data: receipt, error: receiptError } = await admin
      .from("receipts")
      .select("id,academy_id,student_id,receipt_number,storage_path,status")
      .eq("id", receiptId)
      .single();
    if (receiptError || !receipt || !receiptMatchesStudent(receipt, student) || !receipt.storage_path) {
      return respond({ error: "Receipt PDF unavailable" }, 409);
    }
    validatedReceipt = receipt;
  }

  let logId: string | null = null;
  const logInsert = await admin
    .from("automation_messages")
    .insert({
      user_id: user.id,
      academy_id: student.academy_id,
      student_id: student.id,
      class_id: student.class_id,
      receipt_id: receiptId,
      person,
      automation_type: automationType,
      idempotency_key: idempotencyKey,
      status: "pending",
      planned_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (logInsert.error) {
    if (logInsert.error.code === "23505" && idempotencyKey) {
      return respond({ status: "duplicate", idempotency_key: idempotencyKey }, 200);
    }
    console.error("automation log insert failed", logInsert.error.message);
    return respond({ error: "Could not create message log" }, 500);
  }
  logId = logInsert.data.id;

  async function finish(status: string, extra: Record<string, unknown> = {}) {
    await admin.from("automation_messages").update({
      status,
      executed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...extra,
    }).eq("id", logId!);
  }

  if (!isWhatsappEligible({ phone: normalizedPhone, consent })) {
    await finish("skipped", {
      error_code: !normalizedPhone ? "missing_phone" : "missing_consent",
      error_message: !normalizedPhone ? "Aluno sem WhatsApp cadastrado" : "Aluno sem consentimento para WhatsApp",
    });
    return respond({ status: "skipped" }, 200);
  }

  const accessToken = Deno.env.get("META_ACCESS_TOKEN") || "";
  const phoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID") || "";
  const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v25.0";
  if (!accessToken || !phoneNumberId) {
    await finish("failed", {
      error_code: "meta_not_configured",
      error_message: "Credenciais da Meta ainda não configuradas no Supabase",
    });
    return respond({ error: "Meta credentials not configured" }, 503);
  }

  try {
    let payload: unknown;
    if (automationType === "receipt_document") {
      const { data: signed, error: signedError } = await admin.storage
        .from("receipts")
        .createSignedUrl(validatedReceipt.storage_path, 60 * 60);
      if (signedError || !signed?.signedUrl) throw new Error("Receipt URL unavailable");
      payload = buildDocumentPayload({
        to: normalizedPhone!,
        link: signed.signedUrl,
        filename: `recibo-${validatedReceipt.receipt_number}.pdf`,
        caption: validatedReceipt.status === "voided" ? "Recibo estornado" : "Recibo de pagamento",
      });
    } else {
      payload = buildTemplatePayload({
        to: normalizedPhone!,
        templateName: templateByType[automationType],
        languageCode: "pt_BR",
        bodyParameters,
      });
    }

    const provider = await sendMetaPayload({ phoneNumberId, accessToken, graphVersion, payload });
    const providerMessageId = provider?.messages?.[0]?.id ? String(provider.messages[0].id) : null;
    await finish("sent", { provider_message_id: providerMessageId });
    return respond({ status: "sent", message_id: providerMessageId });
  } catch (error: any) {
    const safe = error?.meta || sanitizeMetaError(error);
    await finish("failed", {
      error_code: safe.code ? String(safe.code) : "send_failed",
      error_message: safe.message || "Falha ao enviar mensagem",
    });
    console.error("send-whatsapp failed", safe);
    return respond({ error: "Could not send WhatsApp message", provider: safe }, 502);
  }
});
