import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateReceiptPdf } from "../_shared/receipt.ts";
import { paymentAmount, paymentIsMarked, paymentLabel, receiptActionForState } from "../_shared/payment-lifecycle.ts";
import { normalizeAutomationSettings } from "../_shared/automation-settings.ts";
import { buildDocumentPayload, buildTemplatePayload, isWhatsappEligible, normalizeRecipientPhone, sanitizeMetaError, sendMetaPayload, TEMPLATE_NAMES } from "../_shared/whatsapp.ts";
import { loadAcademyIdentity, requireAcademyAccess } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function money(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function loadLogo(admin: any, logoPath: string | null) {
  if (!logoPath) return { bytes: null, mimeType: null };
  const extension = logoPath.split(".").pop()?.toLowerCase();
  if (extension !== "png" && extension !== "jpg" && extension !== "jpeg") {
    return { bytes: null, mimeType: null };
  }
  const { data, error } = await admin.storage.from("academy-logos").download(logoPath);
  if (error || !data) return { bytes: null, mimeType: null };
  return {
    bytes: new Uint8Array(await data.arrayBuffer()),
    mimeType: extension === "png" ? "image/png" : "image/jpeg",
  };
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
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
  const user = userData.user;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const studentId = String(body?.student_id || "").trim();
    const person = body?.person === "person2" ? "person2" : "person1";
    const kind = body?.kind === "entry" ? "entry" : body?.kind === "monthly" ? "monthly" : null;
    const installment = kind === "monthly" ? Number(body?.installment || 0) : 0;
    if (!studentId || !kind || (kind === "monthly" && (installment < 1 || installment > 3))) {
      return json({ error: "Invalid request" }, 400);
    }

    const { data: student, error: studentError } = await admin.from("students")
      .select("id,user_id,academy_id,class_id,person1,person2,entry_payments,payments,fees,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent")
      .eq("id", studentId).single();
    if (studentError || !student) return json({ error: "Student not found" }, 404);
    if (!student.academy_id) return json({ error: "Student is not linked to an academy" }, 409);
    try {
      await requireAcademyAccess(admin, user.id, student.academy_id);
    } catch (error) {
      if (String(error?.message || error).includes("Forbidden")) return json({ error: "Forbidden" }, 403);
      throw error;
    }
    if (person === "person2" && !student.person2) return json({ error: "Person not found" }, 404);

    const academyId = student.academy_id;
    const identity = await loadAcademyIdentity(admin, academyId);
    const paid = paymentIsMarked(student, person, kind, installment);
    const amount = paymentAmount(student, person, kind);
    const { data: activeReceipt } = await admin.from("receipts").select("*")
      .eq("academy_id", academyId)
      .eq("student_id", studentId).eq("person", person).eq("kind", kind).eq("installment", installment)
      .eq("status", "active").maybeSingle();
    const action = receiptActionForState({ paid, hasActiveReceipt: Boolean(activeReceipt) });

    let paymentEvent: any = null;
    if (paid) {
      const { data: existingEvent } = await admin.from("payment_events").select("*")
        .eq("academy_id", academyId)
        .eq("student_id", studentId).eq("person", person).eq("kind", kind).eq("installment", installment).maybeSingle();
      if (existingEvent) paymentEvent = existingEvent;
      else {
        const { data, error } = await admin.from("payment_events").insert({
          user_id: user.id,
          academy_id: academyId,
          student_id: studentId,
          class_id: student.class_id,
          person,
          kind,
          installment,
          amount,
        }).select().single();
        if (error) throw error;
        paymentEvent = data;
      }
    } else {
      const { error } = await admin.from("payment_events").delete()
        .eq("academy_id", academyId)
        .eq("student_id", studentId).eq("person", person).eq("kind", kind).eq("installment", installment);
      if (error) throw error;
    }

    const [{ data: clazz }, { data: settingsRow }] = await Promise.all([
      student.class_id ? admin.from("classes").select("name,academy_id").eq("id", student.class_id).maybeSingle() : Promise.resolve({ data: null }),
      admin.from("automation_settings").select("reminders_enabled,payment_confirmation_enabled,receipt_delivery_enabled,void_notification_enabled")
        .eq("academy_id", academyId).maybeSingle(),
    ]);
    const settings = normalizeAutomationSettings(settingsRow);
    const studentName = person === "person2" ? student.person2 : student.person1;
    const academyName = identity.name || "Academia";
    const label = paymentLabel(kind, installment);

    let receipt: any = activeReceipt || null;
    if (action === "create") {
      const { data, error } = await admin.from("receipts").insert({
        user_id: user.id,
        academy_id: academyId,
        student_id: studentId,
        class_id: student.class_id,
        person,
        kind,
        installment,
        amount,
        paid_at: paymentEvent?.paid_at || new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      receipt = data;

      const logo = await loadLogo(admin, identity.logoPath);
      const pdfBytes = await generateReceiptPdf({
        receiptNumber: receipt.receipt_number,
        academyName,
        responsibleName: identity.responsibleName,
        supportPhone: identity.contactPhone,
        logoBytes: logo.bytes,
        logoMimeType: logo.mimeType,
        studentName,
        className: clazz?.academy_id === academyId ? (clazz?.name || "Sem turma") : "Sem turma",
        paymentLabel: label,
        amount,
        paidAt: receipt.paid_at,
        status: "active",
      });
      const storagePath = `${academyId}/${receipt.id}.pdf`;
      const { error: uploadError } = await admin.storage.from("receipts").upload(storagePath, pdfBytes, {
        contentType: "application/pdf", upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data: updated, error: updateError } = await admin.from("receipts")
        .update({ storage_path: storagePath })
        .eq("id", receipt.id)
        .eq("academy_id", academyId)
        .select().single();
      if (updateError) throw updateError;
      receipt = updated;
    } else if (action === "void" && receipt) {
      const { data, error } = await admin.from("receipts").update({ status: "voided" })
        .eq("id", receipt.id).eq("academy_id", academyId).eq("status", "active").select().single();
      if (error) throw error;
      receipt = data;
    }

    const phone = person === "person2" ? student.person2_phone : student.person1_phone;
    const consent = person === "person2" ? student.person2_whatsapp_consent : student.person1_whatsapp_consent;
    const eligible = isWhatsappEligible({ phone, consent });
    const accessToken = Deno.env.get("META_ACCESS_TOKEN") || "";
    const phoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID") || "";
    const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v25.0";
    const metaReady = Boolean(accessToken && phoneNumberId);
    let whatsapp: Record<string, string> = {
      payment_confirmation: settings.payment_confirmation_enabled ? (eligible ? (metaReady ? "ready" : "not_configured") : "skipped") : "disabled",
      receipt_document: settings.receipt_delivery_enabled ? (eligible ? (metaReady ? "ready" : "not_configured") : "skipped") : "disabled",
      payment_voided: settings.void_notification_enabled ? (eligible ? (metaReady ? "ready" : "not_configured") : "skipped") : "disabled",
    };

    async function sendLogged(automationType: string, payload: unknown, idempotencyKey: string) {
      const { data: existing } = await admin.from("automation_messages").select("id,status")
        .eq("academy_id", academyId).eq("idempotency_key", idempotencyKey).maybeSingle();
      if (existing) return existing.status;
      const { data: log, error: logError } = await admin.from("automation_messages").insert({
        user_id: user.id,
        academy_id: academyId,
        student_id: studentId,
        class_id: student.class_id,
        receipt_id: receipt?.id || null,
        person,
        automation_type: automationType,
        idempotency_key: idempotencyKey,
        planned_at: new Date().toISOString(),
        status: "pending",
      }).select("id").single();
      if (logError) throw logError;
      try {
        const provider = await sendMetaPayload({ phoneNumberId, accessToken, graphVersion, payload });
        const providerId = provider?.messages?.[0]?.id ? String(provider.messages[0].id) : null;
        await admin.from("automation_messages").update({ status: "sent", provider_message_id: providerId, executed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", log.id).eq("academy_id", academyId);
        return "sent";
      } catch (error: any) {
        const safe = error?.meta || sanitizeMetaError(error);
        await admin.from("automation_messages").update({ status: "failed", error_code: safe.code ? String(safe.code) : "send_failed", error_message: safe.message, executed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", log.id).eq("academy_id", academyId);
        return "failed";
      }
    }

    if (eligible && metaReady && receipt && action === "create") {
      const to = normalizeRecipientPhone(phone)!;

      if (settings.payment_confirmation_enabled) {
        const confirmation = buildTemplatePayload({
          to,
          templateName: TEMPLATE_NAMES.paymentConfirmation,
          languageCode: "pt_BR",
          bodyParameters: [studentName, academyName, label, money(amount), receipt.receipt_number, identity.responsibleName || "responsável da academia", identity.contactPhone || "contato da academia"],
        });
        whatsapp.payment_confirmation = await sendLogged("payment_confirmation", confirmation, `payment:${receipt.id}:confirmation`);
      }

      if (settings.receipt_delivery_enabled && receipt.storage_path) {
        const { data: signed } = await admin.storage.from("receipts").createSignedUrl(receipt.storage_path, 3600);
        if (signed?.signedUrl) {
          const document = buildDocumentPayload({ to, link: signed.signedUrl, filename: `recibo-${receipt.receipt_number}.pdf`, caption: "Recibo de pagamento" });
          whatsapp.receipt_document = await sendLogged("receipt_document", document, `payment:${receipt.id}:document`);
        }
      }
    } else if (eligible && metaReady && receipt && action === "void" && settings.void_notification_enabled) {
      const payload = buildTemplatePayload({
        to: normalizeRecipientPhone(phone)!, templateName: TEMPLATE_NAMES.paymentVoided, languageCode: "pt_BR",
        bodyParameters: [studentName, academyName, label, money(amount), receipt.receipt_number, identity.responsibleName || "responsável da academia", identity.contactPhone || "contato da academia"],
      });
      whatsapp.payment_voided = await sendLogged("payment_voided", payload, `payment:${receipt.id}:voided`);
    }

    return json({ paid, action, receipt, whatsapp, settings, academy_id: academyId });
  } catch (error) {
    console.error("payment-lifecycle error", error);
    return json({ error: "Could not process payment lifecycle" }, 500);
  }
});
