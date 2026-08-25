'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { db, schema } from '@tiktrends/db';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword, createSession, destroySession } from '../../lib/auth';
import { hit, reset } from '../../lib/rate-limit';

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') || '').split(',')[0]!.trim() || 'unknown';
}

// Inscription = amorçage du 1er compte propriétaire uniquement. Ensuite, l'accès
// se fait sur invitation (/invite/[token]) · voir actions/invites.ts.
export async function signupAction(formData: FormData): Promise<void> {
  const email = norm(formData.get('email')).toLowerCase();
  const password = norm(formData.get('password'));
  const name = norm(formData.get('name'));
  const workspaceName = norm(formData.get('workspace')) || (name ? `Espace de ${name}` : 'Mon agence');

  if (!email || !password) redirect('/signup?e=missing');
  if (password.length < 8) redirect('/signup?e=weak');
  if (!db) redirect('/signup?e=server');

  // Verrou : si un compte existe déjà, l'inscription ouverte est fermée.
  const [firstUser] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (firstUser) redirect('/signup?e=closed');

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

  // Anti-force-brute : max 6 tentatives / 15 min par IP+e-mail.
  const key = `login:${await clientIp()}:${email}`;
  if (!hit(key).ok) redirect('/login?e=throttled');

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || !user.passwordHash) redirect('/login?e=invalid');

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) redirect('/login?e=invalid');

  reset(key); // succès : on efface le compteur
  await createSession(user.id);
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}
