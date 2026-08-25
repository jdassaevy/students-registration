import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { buildReceiptDocumentModel } from "./receipt.ts";

Deno.test("receipt model includes academy, student, payment and Dassaevy Labs footer", () => {
  const model = buildReceiptDocumentModel({
    receiptNumber: "DL-20260824-ABC123",
    academyName: "Academia Exemplo",
    responsibleName: "Professor Carlos",
    supportPhone: "5548999999999",
    studentName: "João da Silva",
    className: "Turma de Segunda",
    paymentLabel: "1ª Mensalidade",
    amount: 250,
    paidAt: "2026-08-24T21:00:00-03:00",
    status: "active",
  });

  assertEquals(model.academyName, "Academia Exemplo");
  assertEquals(model.studentName, "João da Silva");
  assertEquals(model.className, "Turma de Segunda");
  assertEquals(model.paymentLabel, "1ª Mensalidade");
  assertMatch(model.amountText, /250/);
  assertMatch(model.paidAtText, /24\/08\/2026/);
  assertEquals(model.responsibleText, "Responsável: Professor Carlos");
  assertEquals(model.supportText, "Contato para dúvidas: 5548999999999");
  assertEquals(model.footer, "Gerado por Dassaevy Labs");
  assertEquals(model.statusText, "PAGO");
});

Deno.test("voided receipt model is visibly marked", () => {
  const model = buildReceiptDocumentModel({
    receiptNumber: "DL-VOID",
    academyName: "Academia",
    studentName: "Aluno",
    paymentLabel: "Inscrição",
    amount: 100,
    paidAt: "2026-08-24T21:00:00-03:00",
    status: "voided",
  });
  assertEquals(model.statusText, "ESTORNADO");
});
