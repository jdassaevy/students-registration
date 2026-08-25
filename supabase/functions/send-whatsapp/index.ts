import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildDocumentPayload,
  buildTemplatePayload,
  isWhatsappEligible,
  normalizeRecipientPhone,
  sanitizeMetaError,
  sendMetaPayload,
  TEMPLATE_NAMES,
} from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const templateByType: Record<string, string> = {
  reminder_before_due: TEMPLATE_NAMES.reminderBeforeDue,
  due_today: TEMPLATE_NAMES.dueToday,
  overdue: TEMPLATE_NAMES.overdue,
  payment_confirmation: TEMPLATE_NAMES.paymentConfirmation,
  payment_voided: TEMPLATE_NAMES.paymentVoided,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const body = await req.json().catch(() => ({}));
  const studentId = String(body?.student_id || "").trim();
  const person = body?.person === "person2" ? "person2" : "person1";
  const automationType = String(body?.automation_type || "").trim();
  const receiptId = body?.receipt_id ? String(body.receipt_id) : null;
  const bodyParameters = Array.isArray(body?.body_parameters) ? body.body_parameters.slice(0, 12) : [];
  const idempotencyKey = body?.idempotency_key ? String(body.idempotency_key).slice(0, 240) : null;

  if (!studentId || (!templateByType[automationType] && automationType !== "receipt_document")) {
    return json({ error: "Invalid request" }, 400);
  }

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id,user_id,class_id,person1,person2,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent")
    .eq("id", studentId)
    .single();
  if (studentError || !student) return json({ error: "Student not found" }, 404);
  if (student.user_id !== user.id) return json({ error: "Forbidden" }, 403);
  if (person === "person2" && !student.person2) return json({ error: "Person not found" }, 404);

  const phone = person === "person2" ? student.person2_phone : student.person1_phone;
  const consent = person === "person2" ? student.person2_whatsapp_consent : student.person1_whatsapp_consent;
  const normalizedPhone = normalizeRecipientPhone(phone);

  let logId: string | null = null;
  const logInsert = await admin
    .from("automation_messages")
    .insert({
      user_id: user.id,
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
      return json({ status: "duplicate", idempotency_key: idempotencyKey }, 200);
    }
    console.error("automation log insert failed", logInsert.error.message);
    return json({ error: "Could not create message log" }, 500);
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
    return json({ status: "skipped" }, 200);
  }

  const accessToken = Deno.env.get("META_ACCESS_TOKEN") || "";
  const phoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID") || "";
  const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v25.0";
  if (!accessToken || !phoneNumberId) {
    await finish("failed", {
      error_code: "meta_not_configured",
      error_message: "Credenciais da Meta ainda não configuradas no Supabase",
    });
    return json({ error: "Meta credentials not configured" }, 503);
  }

  try {
    let payload: unknown;
    if (automationType === "receipt_document") {
      if (!receiptId) throw new Error("Receipt required");
      const { data: receipt, error: receiptError } = await admin
        .from("receipts")
        .select("id,user_id,receipt_number,storage_path,status")
        .eq("id", receiptId)
        .single();
      if (receiptError || !receipt || receipt.user_id !== user.id || !receipt.storage_path) {
        throw new Error("Receipt PDF unavailable");
      }
      const { data: signed, error: signedError } = await admin.storage
        .from("receipts")
        .createSignedUrl(receipt.storage_path, 60 * 60);
      if (signedError || !signed?.signedUrl) throw new Error("Receipt URL unavailable");
      payload = buildDocumentPayload({
        to: normalizedPhone!,
        link: signed.signedUrl,
        filename: `recibo-${receipt.receipt_number}.pdf`,
        caption: receipt.status === "voided" ? "Recibo estornado" : "Recibo de pagamento",
      });
    } else {
      payload = buildTemplatePayload({
        to: normalizedPhone!,
        templateName: templateByType[automationType],
        languageCode: "pt_BR",
        bodyParameters,
      });
    }

    const provider = await sendMetaPayload({
      phoneNumberId,
      accessToken,
      graphVersion,
      payload,
    });
    const providerMessageId = provider?.messages?.[0]?.id ? String(provider.messages[0].id) : null;
    await finish("sent", { provider_message_id: providerMessageId });
    return json({ status: "sent", message_id: providerMessageId });
  } catch (error: any) {
    const safe = error?.meta || sanitizeMetaError(error);
    await finish("failed", {
      error_code: safe.code ? String(safe.code) : "send_failed",
      error_message: safe.message || "Falha ao enviar mensagem",
    });
    console.error("send-whatsapp failed", safe);
    return json({ error: "Could not send WhatsApp message", provider: safe }, 502);
  }
});
