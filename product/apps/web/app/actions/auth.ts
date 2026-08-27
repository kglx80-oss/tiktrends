'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { db, schema } from '@tiktrends/db';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword, createSession, destroySession, signupOpen } from '../../lib/auth';
import { hit, reset } from '../../lib/rate-limit';
import { TRIAL_DEFAULT_CREDITS, TRIAL_DEFAULT_DAYS } from '../../lib/trial';

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') || '').split(',')[0]!.trim() || 'unknown';
}

// Inscription self-service : chacun crée son espace (propriétaire) sans invitation.
// Fermable via SIGNUP_OPEN=false. Rejoindre une équipe existante = invitation (/invite/[token]).
export async function signupAction(formData: FormData): Promise<void> {
  const email = norm(formData.get('email')).toLowerCase();
  const password = norm(formData.get('password'));
  const name = norm(formData.get('name'));
  const workspaceName = norm(formData.get('workspace')) || (name ? `Espace de ${name}` : 'Mon agence');

  if (!email || !password) redirect('/signup?e=missing');
  if (password.length < 8) redirect('/signup?e=weak');
  if (!db) redirect('/signup?e=server');
  if (!signupOpen()) redirect('/signup?e=closed');

  // Anti-abus : borne le nombre de créations d'espace par IP.
  if (!hit(`signup:${await clientIp()}`, 5, 60 * 60 * 1000).ok) redirect('/signup?e=throttled');

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) redirect('/signup?e=exists');

  const passwordHash = await hashPassword(password);
  // Nouvel espace + période d'essai (crédits de test) pour démarrer sans friction.
  const trialEndsAt = new Date(Date.now() + TRIAL_DEFAULT_DAYS * 86400_000);
  const [ws] = await db.insert(schema.workspaces).values({ name: workspaceName, creditsBalance: TRIAL_DEFAULT_CREDITS, trialCredits: TRIAL_DEFAULT_CREDITS, trialEndsAt }).returning();
  const [user] = await db.insert(schema.users).values({ email, name: name || null, passwordHash }).returning();
  if (!ws || !user) redirect('/signup?e=server');
  await db.insert(schema.workspaceMembers).values({ workspaceId: ws.id, userId: user.id, role: 'owner' });

  await createSession(user.id);
  redirect('/onboarding');
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
