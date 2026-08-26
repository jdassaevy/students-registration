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

  console.info("whatsapp-webhook request", {
    method: req.method,
    pathname: url.pathname,
  });

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (!verifyToken) {
      console.error("whatsapp-webhook verify token missing");
      return text("Webhook verify token not configured", 503);
    }
    if (mode === "subscribe" && token === verifyToken && challenge) {
      console.info("whatsapp-webhook verification accepted");
      return text(challenge, 200);
    }
    console.warn("whatsapp-webhook verification rejected", {
      mode,
      hasToken: Boolean(token),
      hasChallenge: Boolean(challenge),
    });
    return text("Forbidden", 403);
  }

  if (req.method !== "POST") return text("Method not allowed", 405);

  const appSecret = Deno.env.get("META_APP_SECRET") || "";
  if (!appSecret) {
    console.error("whatsapp-webhook Meta app secret missing");
    return json({ error: "Meta app secret not configured" }, 503);
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256");
  if (!(await verifyMetaSignature(rawBody, signatureHeader, appSecret))) {
    console.warn("whatsapp-webhook invalid signature", {
      hasSignature: Boolean(signatureHeader),
      bodyLength: rawBody.length,
    });
    return json({ error: "Invalid signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("whatsapp-webhook invalid JSON");
    return json({ error: "Invalid JSON" }, 400);
  }

  const statuses = extractStatuses(payload);
  console.info("whatsapp-webhook payload accepted", {
    statuses: statuses.length,
  });
  if (!statuses.length) return json({ received: true, updated: 0 }, 200);

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
      console.error("whatsapp-webhook lookup failed", {
        providerMessageId: event.id,
        error: readError.message,
      });
      continue;
    }
    if (!current) {
      unmatched += 1;
      console.warn("whatsapp-webhook provider message not found", {
        providerMessageId: event.id,
        incomingStatus: event.status,
      });
      continue;
    }

    const currentRank = rank[current.status] ?? 0;
    const incomingRank = rank[event.status] ?? 0;
    const shouldApply = event.status === "failed" || incomingRank >= currentRank;
    if (!shouldApply) {
      console.info("whatsapp-webhook ignored status regression", {
        providerMessageId: event.id,
        currentStatus: current.status,
        incomingStatus: event.status,
      });
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
      console.error("whatsapp-webhook update failed", {
        providerMessageId: event.id,
        incomingStatus: event.status,
        error: updateError.message,
      });
      continue;
    }

    updated += 1;
    console.info("whatsapp-webhook status updated", {
      providerMessageId: event.id,
      from: current.status,
      to: event.status,
    });
  }

  return json({ received: true, updated, unmatched }, 200);
});
