import { assertEquals } from "jsr:@std/assert";
import { DEFAULT_AUTOMATION_SETTINGS, normalizeAutomationSettings, isAutomationEnabled } from "./automation-settings.ts";

Deno.test("defaults all academy automations to enabled", () => {
  assertEquals(DEFAULT_AUTOMATION_SETTINGS, {
    reminders_enabled: true,
    payment_confirmation_enabled: true,
    receipt_delivery_enabled: true,
    void_notification_enabled: true,
  });
});

Deno.test("normalizes a partial settings row", () => {
  assertEquals(normalizeAutomationSettings({ reminders_enabled: false }), {
    reminders_enabled: false,
    payment_confirmation_enabled: true,
    receipt_delivery_enabled: true,
    void_notification_enabled: true,
  });
});

Deno.test("maps categories to the correct toggle", () => {
  const settings = normalizeAutomationSettings({ receipt_delivery_enabled: false });
  assertEquals(isAutomationEnabled(settings, "receipt_document"), false);
  assertEquals(isAutomationEnabled(settings, "payment_confirmation"), true);
});

Deno.test("receipt delivery can be disabled without disabling payment confirmation", () => {
  const settings = normalizeAutomationSettings({ receipt_delivery_enabled: false });
  assertEquals(isAutomationEnabled(settings, "payment_confirmation"), true);
  assertEquals(isAutomationEnabled(settings, "receipt_document"), false);
});

Deno.test("void notification can be disabled independently", () => {
  const settings = normalizeAutomationSettings({ void_notification_enabled: false });
  assertEquals(isAutomationEnabled(settings, "payment_voided"), false);
  assertEquals(isAutomationEnabled(settings, "payment_confirmation"), true);
});
