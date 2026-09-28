export type TenantAccess = {
  academyId: string;
  role: string;
};

export type AcademyIdentity = {
  name: string;
  display_name: string | null;
  responsible_name: string | null;
  support_phone: string | null;
};

export type TenantContext = TenantAccess & {
  academy: AcademyIdentity;
};

export async function requireAcademyAccess(
  admin: any,
  userId: string,
  academyId: string,
): Promise<TenantAccess> {
  if (!userId || !academyId) throw new Error('Forbidden');

  const { data: member, error } = await admin
    .from('academy_members')
    .select('role,is_active')
    .eq('academy_id', academyId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  if (!member) throw new Error('Forbidden');

  return { academyId, role: String(member.role || 'member') };
}

export async function requireAcademyContext(
  admin: any,
  userId: string,
  academyId: string,
): Promise<TenantContext> {
  if (!userId || !academyId) throw new Error('Forbidden');

  const { data: member, error } = await admin
    .from('academy_members')
    .select('role,is_active,academy:academies!academy_members_academy_id_fkey(name,display_name,responsible_name,support_phone)')
    .eq('academy_id', academyId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  if (!member || !member.academy) throw new Error('Forbidden');

  return {
    academyId,
    role: String(member.role || 'member'),
    academy: member.academy,
  };
}
