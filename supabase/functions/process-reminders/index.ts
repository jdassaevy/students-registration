import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildTemplatePayload,
  sanitizeMetaError,
  sendMetaPayload,
  TEMPLATE_NAMES,
} from "../_shared/whatsapp.ts";
import {
  buildReminderCandidates,
  buildReminderIdempotencyKey,
} from "../_shared/reminders.js";
import { normalizeAutomationSettings } from "../_shared/automation-settings.ts";

const templateByType: Record<string, string> = {
  reminder_before_due: TEMPLATE_NAMES.reminderBeforeDue,
  due_today: TEMPLATE_NAMES.dueToday,
  overdue: TEMPLATE_NAMES.overdue,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDatePtBr(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedCronSecret = Deno.env.get("AUTOMATION_CRON_SECRET") || "";
  const receivedCronSecret = req.headers.get("x-cron-secret") || "";
  if (!expectedCronSecret) return json({ error: "Cron secret not configured" }, 503);
  if (receivedCronSecret !== expectedCronSecret) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const metaAccessToken = Deno.env.get("META_ACCESS_TOKEN") || "";
  const metaPhoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID") || "";
  const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v25.0";

  if (!metaAccessToken || !metaPhoneNumberId) {
    return json({ error: "Meta credentials not configured" }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const today = todayInSaoPaulo();

  const [
    { data: classes, error: classesError },
    { data: students, error: studentsError },
    { data: academies, error: academiesError },
    { data: automationSettings, error: settingsError },
  ] = await Promise.all([
    admin.from("classes").select("id,user_id,name,start_date").not("start_date", "is", null),
    admin.from("students").select("id,user_id,class_id,person1,person2,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent,fees,payments").not("class_id", "is", null),
    admin.from("academy_profiles").select("user_id,academy_name,display_name,responsible_name,support_phone"),
    admin.from("automation_settings").select("user_id,reminders_enabled,payment_confirmation_enabled,receipt_delivery_enabled,void_notification_enabled"),
  ]);

  if (classesError || studentsError || academiesError || settingsError) {
    console.error("process-reminders load failed", classesError || studentsError || academiesError || settingsError);
    return json({ error: "Could not load reminder data" }, 500);
  }

  const classesById = new Map((classes || []).map(item => [item.id, item]));
  const academyByUser = new Map((academies || []).map(item => [item.user_id, item]));
  const settingsByUser = new Map((automationSettings || []).map(item => [item.user_id, item]));
  const summary = { today, candidates: 0, sent: 0, failed: 0, duplicates: 0, disabled: 0 };

  for (const student of students || []) {
    const clazz = classesById.get(student.class_id);
    if (!clazz || clazz.user_id !== student.user_id) continue;

    const settings = normalizeAutomationSettings(settingsByUser.get(student.user_id));
    if (!settings.reminders_enabled) {
      summary.disabled += 1;
      continue;
    }

    const academy = academyByUser.get(student.user_id) || null;
    const candidates = buildReminderCandidates({ student, clazz, academy, today });
    summary.candidates += candidates.length;

    for (const candidate of candidates) {
      const idempotencyKey = buildReminderIdempotencyKey(candidate);
      const { data: log, error: logError } = await admin
        .from("automation_messages")
        .insert({
          user_id: candidate.userId,
          student_id: candidate.studentId,
          class_id: candidate.classId,
          person: candidate.person,
          automation_type: candidate.automationType,
          idempotency_key: idempotencyKey,
          planned_at: new Date().toISOString(),
          status: "pending",
        })
        .select("id")
        .single();

      if (logError) {
        if (logError.code === "23505") {
          summary.duplicates += 1;
          continue;
        }
        console.error("reminder log insert failed", logError.message);
        summary.failed += 1;
        continue;
      }

      const templateName = templateByType[candidate.automationType];
      const bodyParameters = [
        candidate.studentName,
        candidate.academyName || "Academia",
        `${candidate.installment}ª mensalidade`,
        formatDatePtBr(candidate.dueDate),
        formatMoney(candidate.amount),
        candidate.responsibleName || "responsável da academia",
        candidate.supportPhone || "contato da academia",
      ];

      try {
        const payload = buildTemplatePayload({
          to: candidate.phone,
          templateName,
          languageCode: "pt_BR",
          bodyParameters,
        });
        const provider = await sendMetaPayload({
          phoneNumberId: metaPhoneNumberId,
          accessToken: metaAccessToken,
          graphVersion,
          payload,
        });
        const providerMessageId = provider?.messages?.[0]?.id ? String(provider.messages[0].id) : null;
        await admin.from("automation_messages").update({
          status: "sent",
          provider_message_id: providerMessageId,
          executed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", log.id);
        summary.sent += 1;
      } catch (error: any) {
        const safe = error?.meta || sanitizeMetaError(error);
        await admin.from("automation_messages").update({
          status: "failed",
          error_code: safe.code ? String(safe.code) : "send_failed",
          error_message: safe.message || "Falha ao enviar lembrete",
          executed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", log.id);
        summary.failed += 1;
      }
    }
  }

  return json(summary);
});
