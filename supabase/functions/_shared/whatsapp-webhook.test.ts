import { assertEquals } from "jsr:@std/assert@1";
import { extractStatuses, mapProviderStatus, verifyMetaSignature } from "./whatsapp-webhook.ts";

Deno.test("extracts supported WhatsApp delivery statuses", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { statuses: [
      { id: "wamid.1", status: "sent", timestamp: "1780000000" },
      { id: "wamid.2", status: "delivered", timestamp: "1780000001" },
      { id: "wamid.3", status: "read", timestamp: "1780000002" },
      { id: "wamid.4", status: "failed", timestamp: "1780000003", errors: [{ code: 130497, title: "Restricted" }] },
    ] } }] }],
  };

  assertEquals(extractStatuses(payload).map(item => item.id), ["wamid.1", "wamid.2", "wamid.3", "wamid.4"]);
});

Deno.test("maps only supported provider statuses", () => {
  assertEquals(mapProviderStatus("sent"), "sent");
  assertEquals(mapProviderStatus("delivered"), "delivered");
  assertEquals(mapProviderStatus("read"), "read");
  assertEquals(mapProviderStatus("failed"), "failed");
  assertEquals(mapProviderStatus("unknown"), null);
});

Deno.test("verifies Meta HMAC signature", async () => {
  const secret = "super-secret";
  const body = JSON.stringify({ hello: "world" });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
  const signature = `sha256=${hex}`;

  assertEquals(await verifyMetaSignature(body, signature, secret), true);
  assertEquals(await verifyMetaSignature(`${body}x`, signature, secret), false);
});
