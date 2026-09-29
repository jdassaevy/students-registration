import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, isAllowedCorsRequest } from "../_shared/cors.ts";
import {
  isApiInputError,
  readJsonObject,
  requireTrimmedString,
  validationErrorPayload,
} from "../_shared/api-validation.ts";

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(req),
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (!isAllowedCorsRequest(req)) {
    return json(req, { error: "Origin not allowed" }, 403);
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(req, { error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(req, { error: "Server configuration unavailable" }, 503);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    return json(req, { error: "Unauthorized" }, 401);
  }

  let academyName: string;
  try {
    const body = await readJsonObject(req);
    academyName = requireTrimmedString(body.academy_name, "academy_name", { maxLength: 160 });
  } catch (error) {
    if (isApiInputError(error)) {
      return json(req, validationErrorPayload(error), error.status);
    }
    throw error;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: academyId, error: bootstrapError } = await admin.rpc(
    "bootstrap_academy_service",
    {
      p_user_id: user.id,
      academy_name: academyName,
    },
  );

  if (bootstrapError || !academyId) {
    console.error("bootstrap-academy failed", {
      code: bootstrapError?.code || "missing_academy_id",
    });
    return json(req, { error: "Could not configure academy" }, 500);
  }

  return json(req, { academy_id: academyId }, 200);
});
