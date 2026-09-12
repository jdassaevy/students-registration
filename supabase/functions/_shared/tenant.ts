export type TenantAccess = {
  academyId: string;
  role: string;
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
