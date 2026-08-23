'use server';

import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession, hashPassword, createSession } from '../../lib/auth';
import { roleAtLeast, type Role } from '../../lib/rbac';

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const ASSIGNABLE: Role[] = ['admin', 'member', 'client_viewer']; // on n'invite pas un 2e owner ici

/* ---------------------- Création d'invitation (admin+) --------------------- */
export async function createInviteAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/team?e=forbidden');

  const email = norm(formData.get('email')).toLowerCase();
  const role = norm(formData.get('role')) as Role;
  if (!email) redirect('/team?e=email');
  if (!ASSIGNABLE.includes(role)) redirect('/team?e=role');

  // Déjà membre ?
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (u) redirect('/team?e=already');

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours
  await db.insert(schema.invites).values({
    workspaceId: s.workspaceId, email, role, token, invitedBy: s.user.id, expiresAt,
  });
  redirect('/team?ok=invite');
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/team?e=forbidden');
  const id = norm(formData.get('id'));
  if (!id) redirect('/team?e=bad');

  const [inv] = await db.select().from(schema.invites).where(eq(schema.invites.id, id)).limit(1);
  if (!inv || inv.workspaceId !== s.workspaceId) redirect('/team?e=notfound');
  await db.update(schema.invites).set({ status: 'revoked' }).where(eq(schema.invites.id, id));
  redirect('/team?ok=revoked');
}

/* ---------------------- Acceptation d'invitation (public) ------------------ */
export async function acceptInviteAction(formData: FormData): Promise<void> {
  if (!db) redirect('/login?e=server');
  const token = norm(formData.get('token'));
  const name = norm(formData.get('name'));
  const password = norm(formData.get('password'));
  if (!token) redirect('/login?e=invalid');
  if (password.length < 8) redirect(`/invite/${token}?e=weak`);

  const [inv] = await db.select().from(schema.invites).where(eq(schema.invites.token, token)).limit(1);
  if (!inv || inv.status !== 'pending' || (inv.expiresAt && inv.expiresAt.getTime() < Date.now())) {
    redirect(`/invite/${token}?e=invalid`);
  }

  // L'e-mail est déjà pris ? (course entre invitation et inscription)
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, inv!.email)).limit(1);
  if (existing) redirect(`/invite/${token}?e=exists`);

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(schema.users).values({ email: inv!.email, name: name || null, passwordHash }).returning();
  if (!user) redirect(`/invite/${token}?e=server`);

  await db.insert(schema.workspaceMembers).values({ workspaceId: inv!.workspaceId, userId: user.id, role: inv!.role });
  await db.update(schema.invites)
    .set({ status: 'accepted', acceptedAt: new Date() })
    .where(and(eq(schema.invites.id, inv!.id), eq(schema.invites.status, 'pending')));

  await createSession(user.id);
  redirect('/dashboard');
}
