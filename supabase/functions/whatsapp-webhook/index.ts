import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractStatuses, verifyMetaSignature } from "../_shared/whatsapp-webhook.ts";

function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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
  const url = new URL(req.url);
  const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "";

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (!verifyToken) return text("Webhook verify token not configured", 503);
    if (mode === "subscribe" && token === verifyToken && challenge) {
      return text(challenge, 200);
    }
    return text("Forbidden", 403);
  }

  if (req.method !== "POST") return text("Method not allowed", 405);

  const appSecret = Deno.env.get("META_APP_SECRET") || "";
  if (!appSecret) return json({ error: "Meta app secret not configured" }, 503);

  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256");
  if (!(await verifyMetaSignature(rawBody, signatureHeader, appSecret))) {
    return json({ error: "Invalid signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const statuses = extractStatuses(payload);
  if (!statuses.length) return json({ received: true, updated: 0 }, 200);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);
  let updated = 0;

  for (const event of statuses) {
    const { data: current, error: readError } = await admin
      .from("automation_messages")
      .select("id,status")
      .eq("provider_message_id", event.id)
      .maybeSingle();

    if (readError || !current) continue;

    const currentRank = rank[current.status] ?? 0;
    const incomingRank = rank[event.status] ?? 0;
    const shouldApply = event.status === "failed" || incomingRank >= currentRank;
    if (!shouldApply) continue;

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

    if (!updateError) updated += 1;
  }

  return json({ received: true, updated }, 200);
});
