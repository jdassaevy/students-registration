import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildRetryIdempotencyKey, canRetryAutomationType, retryEligibility } from "../_shared/retry-policy.ts";
import { buildDocumentPayload, buildTemplatePayload, normalizeRecipientPhone, sanitizeMetaError, sendMetaPayload, TEMPLATE_NAMES } from "../_shared/whatsapp.ts";
import { loadAcademyIdentity, requireAcademyAccess } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function money(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function paymentLabel(kind: string, installment: number) {
  return kind === "entry" ? "Inscrição" : `${Number(installment)}ª Mensalidade`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const sourceMessageId = String(body?.source_message_id || "").trim();
  const requestId = String(body?.request_id || "").trim().slice(0, 160);
  if (!sourceMessageId || !requestId) return json({ error: "Invalid request" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: source, error: sourceError } = await admin.from("automation_messages")
    .select("id,user_id,academy_id,student_id,class_id,receipt_id,person,automation_type,status")
    .eq("id", sourceMessageId)
    .single();
  if (sourceError || !source) return json({ error: "Source message not found" }, 404);
  if (!source.academy_id) return json({ error: "Message is not linked to an academy" }, 409);
  try {
    await requireAcademyAccess(admin, user.id, source.academy_id);
  } catch (error) {
    if (String(error?.message || error).includes("Forbidden")) return json({ error: "Forbidden" }, 403);
    throw error;
  }
  if (!canRetryAutomationType(source.automation_type)) return json({ error: "Message type cannot be retried" }, 400);
  if (!source.student_id) return json({ error: "Student unavailable" }, 409);

  const academyId = source.academy_id;
  const { data: student, error: studentError } = await admin.from("students")
    .select("id,user_id,academy_id,class_id,person1,person2,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent")
    .eq("id", source.student_id)
    .single();
  if (studentError || !student || student.academy_id !== academyId) return json({ error: "Student unavailable" }, 409);

  const person = source.person === "person2" ? "person2" : "person1";
  const phone = person === "person2" ? student.person2_phone : student.person1_phone;
  const consent = person === "person2" ? student.person2_whatsapp_consent : student.person1_whatsapp_consent;
  const studentName = person === "person2" ? student.person2 : student.person1;

  let receipt: any = null;
  if (source.receipt_id) {
    const { data } = await admin.from("receipts")
      .select("id,academy_id,receipt_number,storage_path,status,kind,installment,amount,paid_at")
      .eq("id", source.receipt_id)
      .eq("academy_id", academyId)
      .maybeSingle();
    receipt = data || null;
  }

  const eligibility = retryEligibility({
    ownerMatches: true,
    hasPhone: Boolean(normalizeRecipientPhone(phone)),
    hasConsent: consent === true,
    type: source.automation_type,
    hasRequiredReceipt: Boolean(receipt?.storage_path),
  });
  if (eligibility !== "eligible") return json({ error: eligibility }, eligibility === "forbidden" ? 403 : 409);

  if (["payment_confirmation", "payment_voided"].includes(source.automation_type) && !receipt) {
    return json({ error: "missing_receipt" }, 409);
  }

  const accessToken = Deno.env.get("META_ACCESS_TOKEN") || "";
  const phoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID") || "";
  const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v25.0";
  if (!accessToken || !phoneNumberId) return json({ error: "Meta credentials not configured" }, 503);

  const idempotencyKey = buildRetryIdempotencyKey(source.id, requestId);
  const { data: existing } = await admin.from("automation_messages")
    .select("id,status,provider_message_id")
    .eq("academy_id", academyId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) return json({ status: "duplicate", retry: existing }, 200);

  const [identity, { data: clazz }] = await Promise.all([
    loadAcademyIdentity(admin, academyId),
    student.class_id ? admin.from("classes").select("name,academy_id").eq("id", student.class_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const academyName = identity.name || "Academia";
  const to = normalizeRecipientPhone(phone)!;
  let payload: unknown;

  if (source.automation_type === "receipt_document") {
    const { data: signed, error: signedError } = await admin.storage.from("receipts").createSignedUrl(receipt.storage_path, 3600);
    if (signedError || !signed?.signedUrl) return json({ error: "Receipt PDF unavailable" }, 409);
    payload = buildDocumentPayload({
      to,
      link: signed.signedUrl,
      filename: `recibo-${receipt.receipt_number}.pdf`,
      caption: receipt.status === "voided" ? "Recibo estornado" : "Recibo de pagamento",
    });
  } else {
    const label = paymentLabel(receipt.kind, receipt.installment);
    const templateName = source.automation_type === "payment_voided"
      ? TEMPLATE_NAMES.paymentVoided
      : TEMPLATE_NAMES.paymentConfirmation;
    payload = buildTemplatePayload({
      to,
      templateName,
      languageCode: "pt_BR",
      bodyParameters: [
        studentName || "Aluno",
        academyName,
        label,
        money(receipt.amount),
        receipt.receipt_number,
        identity.responsibleName || "responsável da academia",
        identity.contactPhone || "contato da academia",
      ],
    });
  }

  const { data: retryLog, error: logError } = await admin.from("automation_messages").insert({
    user_id: user.id,
    academy_id: academyId,
    student_id: source.student_id,
    class_id: clazz?.academy_id === academyId ? source.class_id : null,
    receipt_id: source.receipt_id,
    person,
    automation_type: source.automation_type,
    idempotency_key: idempotencyKey,
    planned_at: new Date().toISOString(),
    status: "pending",
  }).select("id").single();
  if (logError) {
    if (logError.code === "23505") {
      const { data: duplicate } = await admin.from("automation_messages")
        .select("id,status,provider_message_id")
        .eq("academy_id", academyId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      return json({ status: "duplicate", retry: duplicate }, 200);
    }
    return json({ error: "Could not create retry log" }, 500);
  }

  try {
    const provider = await sendMetaPayload({ phoneNumberId, accessToken, graphVersion, payload });
    const providerMessageId = provider?.messages?.[0]?.id ? String(provider.messages[0].id) : null;
    await admin.from("automation_messages").update({
      status: "sent",
      provider_message_id: providerMessageId,
      executed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", retryLog.id).eq("academy_id", academyId);
    return json({ status: "sent", retry_message_id: retryLog.id, provider_message_id: providerMessageId });
  } catch (error: any) {
    const safe = error?.meta || sanitizeMetaError(error);
    await admin.from("automation_messages").update({
      status: "failed",
      error_code: safe.code ? String(safe.code) : "send_failed",
      error_message: safe.message || "Falha ao reenviar mensagem",
      executed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", retryLog.id).eq("academy_id", academyId);
    return json({ error: "Could not resend WhatsApp message", retry_message_id: retryLog.id }, 502);
  }
});
