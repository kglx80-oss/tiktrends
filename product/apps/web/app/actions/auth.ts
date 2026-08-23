'use server';

import { redirect } from 'next/navigation';
import { db, schema } from '@tiktrends/db';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword, createSession, destroySession } from '../../lib/auth';

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');

export async function signupAction(formData: FormData): Promise<void> {
  const email = norm(formData.get('email')).toLowerCase();
  const password = norm(formData.get('password'));
  const name = norm(formData.get('name'));
  const workspaceName = norm(formData.get('workspace')) || (name ? `Espace de ${name}` : 'Mon agence');

  if (!email || !password) redirect('/signup?e=missing');
  if (password.length < 8) redirect('/signup?e=weak');
  if (!db) redirect('/signup?e=server');

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) redirect('/signup?e=exists');

  const passwordHash = await hashPassword(password);
  const [ws] = await db.insert(schema.workspaces).values({ name: workspaceName }).returning();
  const [user] = await db.insert(schema.users).values({ email, name: name || null, passwordHash }).returning();
  if (!ws || !user) redirect('/signup?e=server');
  await db.insert(schema.workspaceMembers).values({ workspaceId: ws.id, userId: user.id, role: 'owner' });

  await createSession(user.id);
  redirect('/dashboard');
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = norm(formData.get('email')).toLowerCase();
  const password = norm(formData.get('password'));

  if (!email || !password) redirect('/login?e=missing');
  if (!db) redirect('/login?e=server');

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || !user.passwordHash) redirect('/login?e=invalid');

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) redirect('/login?e=invalid');

  await createSession(user.id);
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}
