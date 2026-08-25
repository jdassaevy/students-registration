export type AutomationSettings = {
  reminders_enabled: boolean;
  payment_confirmation_enabled: boolean;
  receipt_delivery_enabled: boolean;
  void_notification_enabled: boolean;
};

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  reminders_enabled: true,
  payment_confirmation_enabled: true,
  receipt_delivery_enabled: true,
  void_notification_enabled: true,
};

export function normalizeAutomationSettings(row: Partial<AutomationSettings> | null | undefined): AutomationSettings {
  return {
    reminders_enabled: row?.reminders_enabled ?? true,
    payment_confirmation_enabled: row?.payment_confirmation_enabled ?? true,
    receipt_delivery_enabled: row?.receipt_delivery_enabled ?? true,
    void_notification_enabled: row?.void_notification_enabled ?? true,
  };
}

export function isAutomationEnabled(settings: AutomationSettings, category: string): boolean {
  if (["reminder_before_due", "due_today", "overdue"].includes(category)) return settings.reminders_enabled;
  if (category === "payment_confirmation") return settings.payment_confirmation_enabled;
  if (category === "receipt_document") return settings.receipt_delivery_enabled;
  if (category === "payment_voided") return settings.void_notification_enabled;
  return false;
}
