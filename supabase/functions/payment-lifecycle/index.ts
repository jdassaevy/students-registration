import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateReceiptPdf } from "../_shared/receipt.ts";
import { requestMonthlyReceiptPdf } from "../_shared/monthly-receipt-delegation.mjs";
import { isUniqueViolation, paymentAmount, paymentIsMarked, paymentLabel, paymentNotificationAmount, paymentReceiptAmount, receiptActionForState, receiptNeedsPdf } from "../_shared/payment-lifecycle.ts";
import { normalizeAutomationSettings } from "../_shared/automation-settings.ts";
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
    const operation = String(body?.operation || "").trim();
    const repairReceiptId = String(body?.receipt_id || "").trim();

    if (operation === "repair_monthly_receipt") {
      if (!repairReceiptId) return json({ error: "receipt_id is required" }, 400);

      const { data: receipt, error: receiptError } = await admin.from("receipts")
        .select("*").eq("id", repairReceiptId).single();
      if (receiptError || !receipt) return json({ error: "Receipt not found" }, 404);
      if (receipt.kind !== "monthly") return json({ error: "Monthly receipt required" }, 400);
      if (receipt.status !== "active") return json({ error: "Active receipt required" }, 400);
      if (!receipt.academy_id) return json({ error: "Academy not resolved" }, 409);

      const { data: repairMembership, error: repairMembershipError } = await admin.from("academy_members")
        .select("academy_id,is_active")
        .eq("academy_id", receipt.academy_id)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (repairMembershipError) throw repairMembershipError;
      if (!repairMembership) return json({ error: "Forbidden" }, 403);

      const { data: repairStudent, error: repairStudentError } = await admin.from("students")
        .select("id,class_id,academy_id,person1,person2,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent")
        .eq("id", receipt.student_id)
        .single();
      if (repairStudentError || !repairStudent) return json({ error: "Student not found" }, 404);
      if (repairStudent.academy_id !== receipt.academy_id) {
        return json({ error: "Receipt tenant mismatch" }, 409);
      }

      const { data: repairSettingsRow, error: repairSettingsError } = await admin.from("automation_settings")
        .select("reminders_enabled,payment_confirmation_enabled,receipt_delivery_enabled,void_notification_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      if (repairSettingsError) throw repairSettingsError;
      const repairSettings = normalizeAutomationSettings(repairSettingsRow);

      const repairPhone = receipt.person === "person2" ? repairStudent.person2_phone : repairStudent.person1_phone;
      const repairConsent = receipt.person === "person2" ? repairStudent.person2_whatsapp_consent : repairStudent.person1_whatsapp_consent;
      const repairEligible = isWhatsappEligible({ phone: repairPhone, consent: repairConsent });
      const repairAccessToken = Deno.env.get("META_ACCESS_TOKEN") || "";
      const repairPhoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID") || "";
      const repairGraphVersion = Deno.env.get("META_GRAPH_VERSION") || "v25.0";
      const repairMetaReady = Boolean(repairAccessToken && repairPhoneNumberId);
      const repairWhatsapp: Record<string, string> = {
        receipt_document: repairSettings.receipt_delivery_enabled
          ? (repairEligible ? (repairMetaReady ? "ready" : "not_configured") : "skipped")
          : "disabled",
      };

      let repairedReceipt: any = receipt;
      try {
        repairedReceipt = await requestMonthlyReceiptPdf({
          supabaseUrl,
          anonKey,
          authHeader,
          receiptId: receipt.id,
        });
      } catch (error: any) {
        console.warn("monthly receipt repair remains pending", error?.message || "unknown error");
        repairWhatsapp.receipt_document = repairSettings.receipt_delivery_enabled
          ? "pending_pdf"
          : "disabled";
        return json({
          paid: true,
          action: "repair_pending",
          receipt,
          pdf_status: "pending",
          whatsapp: repairWhatsapp,
          settings: repairSettings,
        });
      }

      async function sendRepairDocument(payload: unknown, idempotencyKey: string) {
        const { data: existing } = await admin.from("automation_messages").select("id,status")
          .eq("user_id", user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
        if (existing) return existing.status;

        const { data: log, error: logError } = await admin.from("automation_messages").insert({
          user_id: user.id,
          student_id: repairStudent.id,
          class_id: repairStudent.class_id,
          receipt_id: repairedReceipt.id,
          person: receipt.person,
          automation_type: "receipt_document",
          idempotency_key: idempotencyKey,
          planned_at: new Date().toISOString(),
          status: "pending",
        }).select("id").single();
        if (logError && isUniqueViolation(logError)) {
          const { data: concurrent } = await admin.from("automation_messages").select("status")
            .eq("user_id", user.id).eq("idempotency_key", idempotencyKey).single();
          return concurrent?.status || "pending";
        }
        if (logError) throw logError;

        try {
          const provider = await sendMetaPayload({
            phoneNumberId: repairPhoneNumberId,
            accessToken: repairAccessToken,
            graphVersion: repairGraphVersion,
            payload,
          });
          const providerId = provider?.messages?.[0]?.id ? String(provider.messages[0].id) : null;
          await admin.from("automation_messages").update({
            status: "sent",
            provider_message_id: providerId,
            executed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", log.id);
          return "sent";
        } catch (error: any) {
          const safe = error?.meta || sanitizeMetaError(error);
          await admin.from("automation_messages").update({
            status: "failed",
            error_code: safe.code ? String(safe.code) : "send_failed",
            error_message: safe.message,
            executed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", log.id);
          return "failed";
        }
      }

      if (
        repairEligible && repairMetaReady && repairSettings.receipt_delivery_enabled &&
        repairedReceipt.storage_path
      ) {
        const to = normalizeRecipientPhone(repairPhone)!;
        const { data: signed } = await admin.storage.from("receipts")
          .createSignedUrl(repairedReceipt.storage_path, 3600);
        if (signed?.signedUrl) {
          const document = buildDocumentPayload({
            to,
            link: signed.signedUrl,
            filename: `recibo-${repairedReceipt.receipt_number}.pdf`,
            caption: "Recibo de pagamento",
          });
          repairWhatsapp.receipt_document = await sendRepairDocument(
            document,
            `payment:${repairedReceipt.id}:document`,
          );
        }
      }

      return json({
        paid: true,
        action: "repair",
        receipt: repairedReceipt,
        pdf_status: repairedReceipt.storage_path ? "ready" : "pending",
        whatsapp: repairWhatsapp,
        settings: repairSettings,
      });
    }

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
    if (!student.academy_id) return json({ error: "Academy not resolved" }, 409);

    const { data: membership, error: membershipError } = await admin.from("academy_members")
      .select("academy_id,role,is_active")
      .eq("academy_id", student.academy_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return json({ error: "Forbidden" }, 403);

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
          user_id: user.id, academy_id: student.academy_id, student_id: studentId, class_id: student.class_id, person, kind, installment, amount,
        }).select().single();
        if (error && !isUniqueViolation(error)) throw error;
        if (data) paymentEvent = data;
        else {
          const { data: concurrentEvent, error: concurrentError } = await admin.from("payment_events").select("*")
            .eq("student_id", studentId).eq("person", person).eq("kind", kind).eq("installment", installment).single();
          if (concurrentError) throw concurrentError;
          paymentEvent = concurrentEvent;
        }
      }
    } else {
      const { error } = await admin.from("payment_events").delete()
        .eq("student_id", studentId).eq("person", person).eq("kind", kind).eq("installment", installment);
      if (error) throw error;
    }

    const [{ data: academy, error: academyError }, { data: clazz }, { data: settingsRow }] = await Promise.all([
      admin.from("academies").select("name,display_name,responsible_name,support_phone").eq("id", student.academy_id).single(),
      student.class_id ? admin.from("classes").select("name").eq("id", student.class_id).maybeSingle() : Promise.resolve({ data: null }),
      admin.from("automation_settings").select("reminders_enabled,payment_confirmation_enabled,receipt_delivery_enabled,void_notification_enabled").eq("user_id", user.id).maybeSingle(),
    ]);
    if (academyError || !academy) return json({ error: "Academy not found" }, 404);

    const settings = normalizeAutomationSettings(settingsRow);
    const studentName = (person === "person2" ? student.person2 : student.person1) || "Aluno(a)";
    const academyName = academy.name;
    const academyMessageName = academy.display_name || academy.name;
    const label = paymentLabel(kind, installment);

    let receipt: any = activeReceipt || null;
    let repairedPdf = false;
    let pdfStatus: "ready" | "pending" | "not_applicable" = "not_applicable";
    if (action === "create") {
      const { data, error } = await admin.from("receipts").insert({
        user_id: user.id,
        academy_id: student.academy_id,
        student_id: studentId,
        class_id: student.class_id,
        person,
        kind,
        installment,
        amount,
        paid_at: paymentEvent?.paid_at || new Date().toISOString(),
      }).select().single();
      if (error && !isUniqueViolation(error)) throw error;
      if (data) receipt = data;
      else {
        const { data: concurrentReceipt, error: concurrentError } = await admin.from("receipts").select("*")
          .eq("student_id", studentId).eq("person", person).eq("kind", kind).eq("installment", installment)
          .eq("status", "active").single();
        if (concurrentError) throw concurrentError;
        receipt = concurrentReceipt;
      }
    }

    if (paid && kind === "entry" && receiptNeedsPdf(receipt)) {
      const receiptAmount = paymentReceiptAmount(receipt, amount);
      const pdfBytes = await generateReceiptPdf({
        receiptNumber: receipt.receipt_number,
        academyName: academy.name,
        displayName: academy.display_name,
        responsibleName: academy.responsible_name,
        supportPhone: academy.support_phone,
        studentName,
        className: clazz?.name || "Sem turma",
        paymentLabel: label,
        amount: receiptAmount,
        paidAt: receipt.paid_at,
        status: "active",
      });
      const storagePath = `${user.id}/${receipt.id}.pdf`;
      const { error: uploadError } = await admin.storage.from("receipts").upload(storagePath, pdfBytes, {
        contentType: "application/pdf", upsert: true,
      });
      if (uploadError) throw uploadError;
      const { data: updated, error: updateError } = await admin.from("receipts")
        .update({ storage_path: storagePath }).eq("id", receipt.id).select().single();
      if (updateError) throw updateError;
      receipt = updated;
      repairedPdf = true;
      pdfStatus = "ready";
    } else if (action === "void" && receipt) {
      const { data, error } = await admin.from("receipts").update({ status: "voided" })
        .eq("id", receipt.id).eq("status", "active").select().single();
      if (error) throw error;
      receipt = data;
    }

    if (paid && kind === "entry" && receipt?.storage_path) pdfStatus = "ready";

    const notificationAmount = paymentNotificationAmount(action, receipt, amount);
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
        .eq("user_id", user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
      if (existing) return existing.status;
      const { data: log, error: logError } = await admin.from("automation_messages").insert({
        user_id: user.id, student_id: studentId, class_id: student.class_id, receipt_id: receipt?.id || null,
        person, automation_type: automationType, idempotency_key: idempotencyKey, planned_at: new Date().toISOString(), status: "pending",
      }).select("id").single();
      if (logError && isUniqueViolation(logError)) {
        const { data: concurrent } = await admin.from("automation_messages").select("status")
          .eq("user_id", user.id).eq("idempotency_key", idempotencyKey).single();
        return concurrent?.status || "pending";
      }
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

    const to = eligible && metaReady && receipt ? normalizeRecipientPhone(phone) : null;

    if (
      to && receipt && settings.payment_confirmation_enabled &&
      (action === "create" || (kind === "entry" && repairedPdf))
    ) {
      const confirmation = buildTemplatePayload({
        to, templateName: TEMPLATE_NAMES.paymentConfirmation, languageCode: "pt_BR",
        bodyParameters: [studentName, academyMessageName, label, money(notificationAmount), receipt.receipt_number, academy.responsible_name || "responsável da academia", academy.support_phone || "contato da academia"],
      });
      whatsapp.payment_confirmation = await sendLogged("payment_confirmation", confirmation, `payment:${receipt.id}:confirmation`);
    }

    if (paid && kind === "monthly" && receipt) {
      if (receipt.storage_path) {
        pdfStatus = "ready";
      } else {
        try {
          receipt = await requestMonthlyReceiptPdf({
            supabaseUrl,
            anonKey,
            authHeader,
            receiptId: receipt.id,
          });
          pdfStatus = receipt?.storage_path ? "ready" : "pending";
          repairedPdf = pdfStatus === "ready";
        } catch (error: any) {
          console.warn("monthly receipt PDF remains pending", error?.message || "unknown error");
          pdfStatus = "pending";
          whatsapp.receipt_document = settings.receipt_delivery_enabled ? "pending_pdf" : "disabled";
        }
      }
    }

    if (
      to && receipt && settings.receipt_delivery_enabled && receipt.storage_path &&
      (action === "create" || repairedPdf)
    ) {
      const { data: signed } = await admin.storage.from("receipts").createSignedUrl(receipt.storage_path, 3600);
      if (signed?.signedUrl) {
        const document = buildDocumentPayload({
          to,
          link: signed.signedUrl,
          filename: `recibo-${receipt.receipt_number}.pdf`,
          caption: "Recibo de pagamento",
        });
        whatsapp.receipt_document = await sendLogged("receipt_document", document, `payment:${receipt.id}:document`);
      }
    }

    if (eligible && metaReady && receipt && action === "void" && settings.void_notification_enabled) {
      const payload = buildTemplatePayload({
        to: normalizeRecipientPhone(phone)!, templateName: TEMPLATE_NAMES.paymentVoided, languageCode: "pt_BR",
        bodyParameters: [studentName, academyMessageName, label, money(notificationAmount), receipt.receipt_number, academy.responsible_name || "responsável da academia", academy.support_phone || "contato da academia"],
      });
      whatsapp.payment_voided = await sendLogged("payment_voided", payload, `payment:${receipt.id}:voided`);
    }

    return json({
      paid,
      action: repairedPdf && action === "keep" ? "repair" : action,
      receipt,
      whatsapp,
      settings,
      pdf_status: pdfStatus,
    });
  } catch (error) {
    console.error("payment-lifecycle error", error);
    return json({ error: "Could not process payment lifecycle" }, 500);
  }
});
