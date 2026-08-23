'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession, hashPassword, verifyPassword } from '../../lib/auth';
import { roleAtLeast, type Plan } from '../../lib/rbac';

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];

/* ------------------------------- Profil ---------------------------------- */
export async function updateProfileAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  const name = norm(formData.get('name'));
  await db.update(schema.users).set({ name: name || null }).where(eq(schema.users.id, s.user.id));
  redirect('/profile?ok=1');
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  const current = norm(formData.get('current'));
  const next = norm(formData.get('next'));
  if (next.length < 8) redirect('/profile?e=weak');

  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, s.user.id)).limit(1);
  if (!u || !u.passwordHash || !(await verifyPassword(current, u.passwordHash))) redirect('/profile?e=current');

  await db.update(schema.users).set({ passwordHash: await hashPassword(next) }).where(eq(schema.users.id, s.user.id));
  redirect('/profile?ok=pw');
}

/* ------------------------------- Espace ---------------------------------- */
export async function updateWorkspaceAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/settings?e=forbidden'); // garde serveur
  const name = norm(formData.get('name'));
  if (name) await db.update(schema.workspaces).set({ name }).where(eq(schema.workspaces.id, s.workspaceId));
  redirect('/settings?ok=1');
}

export async function setPlanAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (s.role !== 'owner') redirect('/settings?e=forbidden'); // seul le propriétaire change le plan
  const plan = norm(formData.get('plan')) as Plan;
  if (!PLANS.includes(plan)) redirect('/settings?e=plan');
  await db.update(schema.workspaces).set({ plan }).where(eq(schema.workspaces.id, s.workspaceId));
  redirect('/settings?ok=plan');
}

/* Les actions « tickets » vivent désormais dans actions/support.ts
   (fil de discussion + notifications). */
