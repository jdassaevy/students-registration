import { assertEquals } from "jsr:@std/assert@1";
import { paymentAmount, paymentIsMarked, receiptActionForState } from "./payment-lifecycle.ts";

Deno.test("reads entry and monthly payment state from student snapshot", () => {
  const student = {
    entry_payments: { person1: true, person2: false },
    payments: { person1: [false, true, false], person2: [false, false, false] },
    fees: { person1: { entry: 120, monthly: 250 }, person2: { entry: 0, monthly: 0 } },
  };
  assertEquals(paymentIsMarked(student, "person1", "entry", 0), true);
  assertEquals(paymentIsMarked(student, "person1", "monthly", 2), true);
  assertEquals(paymentIsMarked(student, "person1", "monthly", 1), false);
  assertEquals(paymentAmount(student, "person1", "entry"), 120);
  assertEquals(paymentAmount(student, "person1", "monthly"), 250);
});

Deno.test("creates receipt only when payment is paid and no active receipt exists", () => {
  assertEquals(receiptActionForState({ paid: true, hasActiveReceipt: false }), "create");
  assertEquals(receiptActionForState({ paid: true, hasActiveReceipt: true }), "keep");
});

Deno.test("voids active receipt when payment becomes unpaid", () => {
  assertEquals(receiptActionForState({ paid: false, hasActiveReceipt: true }), "void");
  assertEquals(receiptActionForState({ paid: false, hasActiveReceipt: false }), "none");
});
