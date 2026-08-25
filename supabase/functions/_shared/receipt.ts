import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

export type ReceiptDocumentInput = {
  receiptNumber: string;
  academyName: string;
  displayName?: string | null;
  responsibleName?: string | null;
  supportPhone?: string | null;
  studentName: string;
  className?: string | null;
  paymentLabel: string;
  amount: number;
  paidAt: string;
  status?: "active" | "voided";
};

export type ReceiptDocumentModel = {
  title: string;
  receiptNumber: string;
  academyName: string;
  studentName: string;
  className: string;
  paymentLabel: string;
  amountText: string;
  paidAtText: string;
  responsibleText: string;
  supportText: string;
  statusText: string;
  footer: string;
};

export function formatBRL(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function buildReceiptDocumentModel(input: ReceiptDocumentInput): ReceiptDocumentModel {
  const paidAt = new Date(input.paidAt);
  const paidAtText = Number.isNaN(paidAt.getTime())
    ? "Data não informada"
    : paidAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return {
    title: "RECIBO DE PAGAMENTO",
    receiptNumber: input.receiptNumber,
    academyName: input.academyName?.trim() || input.displayName?.trim() || "Academia",
    studentName: input.studentName?.trim() || "Aluno",
    className: input.className?.trim() || "Sem turma",
    paymentLabel: input.paymentLabel?.trim() || "Pagamento",
    amountText: formatBRL(input.amount),
    paidAtText,
    responsibleText: input.responsibleName?.trim()
      ? `Responsável: ${input.responsibleName.trim()}`
      : "Responsável não informado",
    supportText: input.supportPhone?.trim()
      ? `Contato para dúvidas: ${input.supportPhone.trim()}`
      : "Contato para dúvidas não informado",
    statusText: input.status === "voided" ? "ESTORNADO" : "PAGO",
    footer: "Gerado por Dassaevy Labs",
  };
}

export async function generateReceiptPdf(input: ReceiptDocumentInput): Promise<Uint8Array> {
  const model = buildReceiptDocumentModel(input);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const wine = rgb(0.20, 0.08, 0.06);
  const terracotta = rgb(0.65, 0.29, 0.21);
  const muted = rgb(0.38, 0.35, 0.33);
  const line = rgb(0.88, 0.84, 0.80);

  page.drawRectangle({ x: 0, y: 745, width: 595.28, height: 96, color: wine });
  page.drawText(model.academyName, { x: 44, y: 794, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText(model.title, { x: 44, y: 765, size: 11, font: regular, color: rgb(0.92, 0.88, 0.86) });

  page.drawText(`Recibo ${model.receiptNumber}`, { x: 44, y: 706, size: 12, font: bold, color: terracotta });
  page.drawText(`Status: ${model.statusText}`, { x: 410, y: 706, size: 11, font: bold, color: wine });
  page.drawLine({ start: { x: 44, y: 688 }, end: { x: 551, y: 688 }, thickness: 1, color: line });

  const rows = [
    ["Aluno", model.studentName],
    ["Turma", model.className],
    ["Referente a", model.paymentLabel],
    ["Valor pago", model.amountText],
    ["Data do pagamento", model.paidAtText],
  ];

  let y = 645;
  for (const [label, value] of rows) {
    page.drawText(label, { x: 44, y, size: 9, font: bold, color: muted });
    page.drawText(value, { x: 175, y: y - 1, size: label === "Valor pago" ? 16 : 11, font: label === "Valor pago" ? bold : regular, color: label === "Valor pago" ? wine : rgb(0.12, 0.12, 0.12) });
    y -= 55;
  }

  page.drawRectangle({ x: 44, y: 270, width: 507, height: 105, borderColor: line, borderWidth: 1, color: rgb(0.985, 0.975, 0.96) });
  page.drawText("Contato da academia", { x: 62, y: 342, size: 10, font: bold, color: terracotta });
  page.drawText(model.responsibleText, { x: 62, y: 315, size: 10, font: regular, color: muted });
  page.drawText(model.supportText, { x: 62, y: 291, size: 10, font: regular, color: muted });

  page.drawLine({ start: { x: 44, y: 116 }, end: { x: 551, y: 116 }, thickness: 1, color: line });
  page.drawText(model.footer, { x: 44, y: 88, size: 9, font: bold, color: muted });
  page.drawText("Documento gerado eletronicamente pelo sistema de gestão.", { x: 44, y: 70, size: 8, font: regular, color: muted });

  return await pdf.save();
}
