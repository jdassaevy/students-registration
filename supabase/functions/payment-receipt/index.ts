import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateReceiptPdf } from "../_shared/receipt.ts";
import { loadAcademyIdentity, requireAcademyAccess } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function loadLogo(admin: any, logoPath: string | null) {
  if (!logoPath) return { bytes: null, mimeType: null };
  const extension = logoPath.split(".").pop()?.toLowerCase();
  if (extension !== "png" && extension !== "jpg" && extension !== "jpeg") {
    return { bytes: null, mimeType: null };
  }
  const { data, error } = await admin.storage.from("academy-logos").download(logoPath);
  if (error || !data) return { bytes: null, mimeType: null };
  return {
    bytes: new Uint8Array(await data.arrayBuffer()),
    mimeType: extension === "png" ? "image/png" : "image/jpeg",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    const user = userData.user;
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const receiptId = String(body?.receipt_id || "").trim();
    if (!receiptId) return json({ error: "receipt_id is required" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: receipt, error: receiptError } = await admin
      .from("receipts")
      .select("*")
      .eq("id", receiptId)
      .single();
    if (receiptError || !receipt) return json({ error: "Receipt not found" }, 404);
    if (!receipt.academy_id) return json({ error: "Receipt is not linked to an academy" }, 409);

    try {
      await requireAcademyAccess(admin, user.id, receipt.academy_id);
    } catch (error) {
      if (String(error?.message || error).includes("Forbidden")) return json({ error: "Forbidden" }, 403);
      throw error;
    }

    const [{ data: student, error: studentError }, identity] = await Promise.all([
      admin.from("students").select("id, person1, person2, academy_id").eq("id", receipt.student_id).single(),
      loadAcademyIdentity(admin, receipt.academy_id),
    ]);
    if (studentError || !student) return json({ error: "Student not found" }, 404);
    if (student.academy_id !== receipt.academy_id) return json({ error: "Receipt tenant mismatch" }, 409);

    let className = "Sem turma";
    if (receipt.class_id) {
      const { data: classRow } = await admin.from("classes").select("name,academy_id").eq("id", receipt.class_id).maybeSingle();
      if (classRow?.academy_id === receipt.academy_id && classRow?.name) className = classRow.name;
    }

    const logo = await loadLogo(admin, identity.logoPath);
    const studentName = receipt.person === "person2" ? (student.person2 || student.person1) : student.person1;
    const paymentLabel = receipt.kind === "entry"
      ? "Inscrição"
      : `${Number(receipt.installment || 0)}ª Mensalidade`;

    const pdfBytes = await generateReceiptPdf({
      receiptNumber: receipt.receipt_number,
      academyName: identity.name,
      responsibleName: identity.responsibleName,
      supportPhone: identity.contactPhone,
      logoBytes: logo.bytes,
      logoMimeType: logo.mimeType,
      studentName,
      className,
      paymentLabel,
      amount: Number(receipt.amount || 0),
      paidAt: receipt.paid_at,
      status: receipt.status,
    });

    const storagePath = `${receipt.academy_id}/${receipt.id}.pdf`;
    const { error: uploadError } = await admin.storage
      .from("receipts")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { data: updated, error: updateError } = await admin
      .from("receipts")
      .update({ storage_path: storagePath })
      .eq("id", receipt.id)
      .eq("academy_id", receipt.academy_id)
      .select("id, receipt_number, status, storage_path, academy_id")
      .single();
    if (updateError) throw updateError;

    return json({ receipt: updated });
  } catch (error) {
    console.error("payment-receipt error", error);
    return json({ error: "Could not generate receipt PDF" }, 500);
  }
});
