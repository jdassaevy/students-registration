export type TenantAccess = {
  academyId: string;
  mode: "member" | "support";
  role: "owner" | "teacher" | null;
};

export type AcademyIdentity = {
  id: string;
  name: string;
  contactEmail: string;
  contactPhone: string;
  logoPath: string | null;
  responsibleName: string;
  responsiblePhone: string;
  ownerUserId: string | null;
};

export async function requireAcademyAccess(
  admin: any,
  userId: string,
  academyId: string,
): Promise<TenantAccess> {
  const { data: member, error: memberError } = await admin
    .from("academy_members")
    .select("role,is_active")
    .eq("academy_id", academyId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (memberError) throw memberError;
  if (member) {
    return {
      academyId,
      mode: "member",
      role: member.role === "teacher" ? "teacher" : "owner",
    };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("platform_role")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (profile?.platform_role !== "platform_admin") {
    throw new Error("Forbidden");
  }

  const { data: support, error: supportError } = await admin
    .from("support_access_logs")
    .select("id")
    .eq("admin_user_id", userId)
    .eq("academy_id", academyId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (supportError) throw supportError;
  if (!support) throw new Error("Forbidden");

  return { academyId, mode: "support", role: null };
}

export async function loadAcademyIdentity(admin: any, academyId: string): Promise<AcademyIdentity> {
  const { data: academy, error: academyError } = await admin
    .from("academies")
    .select("id,name,contact_email,contact_phone,logo_path")
    .eq("id", academyId)
    .single();
  if (academyError || !academy) throw academyError || new Error("Academy not found");

  const { data: owner, error: ownerError } = await admin
    .from("academy_members")
    .select("user_id")
    .eq("academy_id", academyId)
    .eq("role", "owner")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ownerError) throw ownerError;

  let ownerProfile: any = null;
  if (owner?.user_id) {
    const result = await admin
      .from("profiles")
      .select("full_name,phone")
      .eq("user_id", owner.user_id)
      .maybeSingle();
    if (result.error) throw result.error;
    ownerProfile = result.data;
  }

  return {
    id: academy.id,
    name: academy.name || "Academia",
    contactEmail: academy.contact_email || "",
    contactPhone: academy.contact_phone || "",
    logoPath: academy.logo_path || null,
    responsibleName: ownerProfile?.full_name || "",
    responsiblePhone: ownerProfile?.phone || academy.contact_phone || "",
    ownerUserId: owner?.user_id || null,
  };
}
