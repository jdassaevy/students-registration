import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateReceiptPdf } from "../_shared/receipt.ts";
import { paymentAmount, paymentIsMarked, paymentLabel, receiptActionForState } from "../_shared/payment-lifecycle.ts";
import { buildDocumentPayload, buildTemplatePayload, isWhatsappEligible, normalizeRecipientPhone, sanitizeMetaError, sendMetaPayload, TEMPLATE_NAMES } from "../_shared/whatsapp.ts";

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
      .select("id,user_id,class_id,person1,person2,entry_payments,payments,fees,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent")
      .eq("id", studentId).single();
    if (studentError || !student) return json({ error: "Student not found" }, 404);
    if (student.user_id !== user.id) return json({ error: "Forbidden" }, 403);
    if (person === "person2" && !student.person2) return json({ error: "Person not found" }, 404);

    const paid = paymentIsMarked(student, person, kind, installment);
    const amount = paymentAmount(student, person, kind);
    const { data: activeReceipt } = await admin.from("receipts").select("*")
      .eq("student_id", studentId).eq("person", person).eq("kind", kind).eq("installment", installment)
      .eq("status", "active").maybeSingle();
    const action = receiptActionForState({ paid, hasActiveReceipt: Boolean(activeReceipt) });

    let paymentEvent: any = null;
    if (paid) {
      const { data: existingEvent } = await admin.from("payment_events").select("*")
        .eq("student_id", studentId).eq("person", person).eq("kind", kind).eq("installment", installment).maybeSingle();
      if (existingEvent) paymentEvent = existingEvent;
      else {
        const { data, error } = await admin.from("payment_events").insert({
          user_id: user.id, student_id: studentId, class_id: student.class_id, person, kind, installment, amount,
        }).select().single();
        if (error) throw error;
        paymentEvent = data;
      }
    } else {
      const { error } = await admin.from("payment_events").delete()
        .eq("student_id", studentId).eq("person", person).eq("kind", kind).eq("installment", installment);
      if (error) throw error;
    }

    const [{ data: academy }, { data: clazz }] = await Promise.all([
      admin.from("academy_profiles").select("academy_name,display_name,responsible_name,support_phone").eq("user_id", user.id).maybeSingle(),
      student.class_id ? admin.from("classes").select("name").eq("id", student.class_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const studentName = person === "person2" ? student.person2 : student.person1;
    const academyName = academy?.academy_name || academy?.display_name || "Academia";
    const label = paymentLabel(kind, installment);

    let receipt: any = activeReceipt || null;
    if (action === "create") {
      const { data, error } = await admin.from("receipts").insert({
        user_id: user.id,
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

      const pdfBytes = await generateReceiptPdf({
        receiptNumber: receipt.receipt_number,
        academyName,
        displayName: academy?.display_name,
        responsibleName: academy?.responsible_name,
        supportPhone: academy?.support_phone,
        studentName,
        className: clazz?.name || "Sem turma",
        paymentLabel: label,
        amount,
        paidAt: receipt.paid_at,
        status: "active",
      });
      const storagePath = `${user.id}/${receipt.id}.pdf`;
      const { error: uploadError } = await admin.storage.from("receipts").upload(storagePath, pdfBytes, {
        contentType: "application/pdf", upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data: updated, error: updateError } = await admin.from("receipts")
        .update({ storage_path: storagePath }).eq("id", receipt.id).select().single();
      if (updateError) throw updateError;
      receipt = updated;
    } else if (action === "void" && receipt) {
      const { data, error } = await admin.from("receipts").update({ status: "voided" })
        .eq("id", receipt.id).eq("status", "active").select().single();
      if (error) throw error;
      receipt = data;
    }

    const phone = person === "person2" ? student.person2_phone : student.person1_phone;
    const consent = person === "person2" ? student.person2_whatsapp_consent : student.person1_whatsapp_consent;
    const eligible = isWhatsappEligible({ phone, consent });
    const accessToken = Deno.env.get("META_ACCESS_TOKEN") || "";
    const phoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID") || "";
    const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v25.0";
    let whatsapp = eligible ? (accessToken && phoneNumberId ? "ready" : "not_configured") : "skipped";

    async function sendLogged(automationType: string, payload: unknown, idempotencyKey: string) {
      const { data: existing } = await admin.from("automation_messages").select("id,status")
        .eq("user_id", user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
      if (existing) return existing.status;
      const { data: log, error: logError } = await admin.from("automation_messages").insert({
        user_id: user.id, student_id: studentId, class_id: student.class_id, receipt_id: receipt?.id || null,
        person, automation_type: automationType, idempotency_key: idempotencyKey, planned_at: new Date().toISOString(), status: "pending",
      }).select("id").single();
      if (logError) throw logError;
      try {
        const provider = await sendMetaPayload({ phoneNumberId, accessToken, graphVersion, payload });
        const providerId = provider?.messages?.[0]?.id ? String(provider.messages[0].id) : null;
        await admin.from("automation_messages").update({ status: "sent", provider_message_id: providerId, executed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", log.id);
        return "sent";
      } catch (error: any) {
        const safe = error?.meta || sanitizeMetaError(error);
        await admin.from("automation_messages").update({ status: "failed", error_code: safe.code ? String(safe.code) : "send_failed", error_message: safe.message, executed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", log.id);
        return "failed";
      }
    }

    if (eligible && accessToken && phoneNumberId && receipt && action === "create") {
      const to = normalizeRecipientPhone(phone)!;
      const confirmation = buildTemplatePayload({
        to, templateName: TEMPLATE_NAMES.paymentConfirmation, languageCode: "pt_BR",
        bodyParameters: [studentName, academyName, label, money(amount), receipt.receipt_number, academy?.responsible_name || "responsável da academia", academy?.support_phone || "contato da academia"],
      });
      const confirmationStatus = await sendLogged("payment_confirmation", confirmation, `payment:${receipt.id}:confirmation`);
      let documentStatus = "skipped";
      if (receipt.storage_path) {
        const { data: signed } = await admin.storage.from("receipts").createSignedUrl(receipt.storage_path, 3600);
        if (signed?.signedUrl) {
          const document = buildDocumentPayload({ to, link: signed.signedUrl, filename: `recibo-${receipt.receipt_number}.pdf`, caption: "Recibo de pagamento" });
          documentStatus = await sendLogged("receipt_document", document, `payment:${receipt.id}:document`);
        }
      }
      whatsapp = `${confirmationStatus}/${documentStatus}`;
    } else if (eligible && accessToken && phoneNumberId && receipt && action === "void") {
      const payload = buildTemplatePayload({
        to: normalizeRecipientPhone(phone)!, templateName: TEMPLATE_NAMES.paymentVoided, languageCode: "pt_BR",
        bodyParameters: [studentName, academyName, label, money(amount), receipt.receipt_number, academy?.responsible_name || "responsável da academia", academy?.support_phone || "contato da academia"],
      });
      whatsapp = await sendLogged("payment_voided", payload, `payment:${receipt.id}:voided`);
    }

    return json({ paid, action, receipt, whatsapp });
  } catch (error) {
    console.error("payment-lifecycle error", error);
    return json({ error: "Could not process payment lifecycle" }, 500);
  }
});
