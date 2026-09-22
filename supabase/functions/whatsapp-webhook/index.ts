import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isApiInputError, readBoundedText, validationErrorPayload } from "../_shared/api-validation.ts";
import { matchesSecret } from "../_shared/request-security.ts";
import { logSafeEvent, traceHeaders } from "../_shared/observability.ts";
import { extractStatuses, MAX_WEBHOOK_BYTES, verifyMetaSignature } from "../_shared/whatsapp-webhook.ts";

function text(req: Request, body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...traceHeaders(req), "Content-Type": "text/plain; charset=utf-8" },
  });
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...traceHeaders(req), "Content-Type": "application/json" },
  });
}

const rank: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
  skipped: 4,
};

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  const url = new URL(req.url);
  const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "";

  logSafeEvent(req, "whatsapp-webhook", "request_received", { method: req.method });

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (!verifyToken) {
      logSafeEvent(req, "whatsapp-webhook", "verify_token_missing", { status: 503, duration_ms: Date.now() - startedAt }, "error");
      return text(req, "Webhook verify token not configured", 503);
    }
    if (mode === "subscribe" && matchesSecret(verifyToken, token) && challenge) {
      logSafeEvent(req, "whatsapp-webhook", "verification_accepted", { status: 200, duration_ms: Date.now() - startedAt });
      return text(req, challenge, 200);
    }
    logSafeEvent(req, "whatsapp-webhook", "verification_rejected", { status: 403, duration_ms: Date.now() - startedAt }, "warn");
    return text(req, "Forbidden", 403);
  }

  if (req.method !== "POST") return text(req, "Method not allowed", 405);

  const appSecret = Deno.env.get("META_APP_SECRET") || "";
  if (!appSecret) {
    logSafeEvent(req, "whatsapp-webhook", "app_secret_missing", { status: 503, duration_ms: Date.now() - startedAt }, "error");
    return json(req, { error: "Meta app secret not configured" }, 503);
  }

  let rawBody: string;
  try {
    rawBody = await readBoundedText(req, MAX_WEBHOOK_BYTES);
  } catch (error) {
    if (isApiInputError(error)) {
      return json(req, validationErrorPayload(error), error.status);
    }
    throw error;
  }

  const signatureHeader = req.headers.get("x-hub-signature-256");
  if (!(await verifyMetaSignature(rawBody, signatureHeader, appSecret))) {
    logSafeEvent(req, "whatsapp-webhook", "invalid_signature", { status: 401, duration_ms: Date.now() - startedAt }, "warn");
    return json(req, { error: "Invalid signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logSafeEvent(req, "whatsapp-webhook", "invalid_json", { status: 400, duration_ms: Date.now() - startedAt }, "warn");
    return json(req, { error: "Invalid JSON" }, 400);
  }

  const statuses = extractStatuses(payload);
  logSafeEvent(req, "whatsapp-webhook", "payload_accepted", { status: 200, count: statuses.length });
  if (!statuses.length) return json(req, { received: true, updated: 0 }, 200);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);
  let updated = 0;
  let unmatched = 0;

  for (const event of statuses) {
    const { data: current, error: readError } = await admin
      .from("automation_messages")
      .select("id,status")
      .eq("provider_message_id", event.id)
      .maybeSingle();

    if (readError) {
      logSafeEvent(req, "whatsapp-webhook", "status_lookup_failed", { code: readError.code || "db_error" }, "error");
      continue;
    }
    if (!current) {
      unmatched += 1;
      logSafeEvent(req, "whatsapp-webhook", "provider_message_unmatched", { outcome: event.status }, "warn");
      continue;
    }

    const currentRank = rank[current.status] ?? 0;
    const incomingRank = rank[event.status] ?? 0;
    const shouldApply = event.status === "failed" || incomingRank >= currentRank;
    if (!shouldApply) {
      logSafeEvent(req, "whatsapp-webhook", "status_regression_ignored", { outcome: event.status });
      continue;
    }

    const providerAt = event.timestamp && /^\d+$/.test(event.timestamp)
      ? new Date(Number(event.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    const changes: Record<string, unknown> = {
      status: event.status,
      updated_at: providerAt,
    };

    if (event.status === "failed") {
      changes.error_code = event.errorCode || "provider_failed";
      changes.error_message = event.errorMessage || "Falha reportada pela Meta";
    } else {
      changes.error_code = null;
      changes.error_message = null;
    }

    const { error: updateError } = await admin
      .from("automation_messages")
      .update(changes)
      .eq("id", current.id);

    if (updateError) {
      logSafeEvent(req, "whatsapp-webhook", "status_update_failed", { code: updateError.code || "db_error", outcome: event.status }, "error");
      continue;
    }

    updated += 1;
    logSafeEvent(req, "whatsapp-webhook", "status_updated", { outcome: event.status });
  }

  logSafeEvent(req, "whatsapp-webhook", "request_completed", { status: 200, count: updated, outcome: unmatched ? "completed_with_unmatched" : "completed", duration_ms: Date.now() - startedAt });
  return json(req, { received: true, updated, unmatched }, 200);
});
