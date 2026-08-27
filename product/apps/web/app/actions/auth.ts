'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';
import { db, schema } from '@tiktrends/db';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { hashPassword, verifyPassword, createSession, destroySession, signupOpen } from '../../lib/auth';
import { hit, reset } from '../../lib/rate-limit';
import { TRIAL_DEFAULT_CREDITS, TRIAL_DEFAULT_DAYS } from '../../lib/trial';
import { sendMail } from '../../lib/mailer';
import { welcomeEmail, resetEmail } from '../../lib/emails';
import { klaviyoSignedUp } from '../../lib/klaviyo';

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

  // E-mail de bienvenue + synchro marketing Klaviyo · best-effort (jamais bloquant).
  try { const m = welcomeEmail(name, workspaceName); await sendMail({ to: email, subject: m.subject, html: m.html, text: m.text }); } catch { /* ignore */ }
  try { await klaviyoSignedUp({ email, name, workspaceName, plan: 'starter' }); } catch { /* ignore */ }

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

/* ------------------------- Mot de passe oublié --------------------------- */
export async function forgotPasswordAction(formData: FormData): Promise<void> {
  const email = norm(formData.get('email')).toLowerCase();
  // Réponse identique quoi qu'il arrive (pas d'énumération des comptes).
  if (!email || !db) redirect('/forgot?sent=1');
  if (!hit(`forgot:${await clientIp()}`, 5, 60 * 60 * 1000).ok) redirect('/forgot?sent=1');

  try {
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (user) {
      const token = randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 h
      await db.insert(schema.passwordResets).values({ userId: user.id, token, expiresAt });
      const m = resetEmail(token);
      await sendMail({ to: email, subject: m.subject, html: m.html, text: m.text });
    }
  } catch { /* best-effort */ }
  redirect('/forgot?sent=1');
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const token = norm(formData.get('token'));
  const password = norm(formData.get('password'));
  if (!token || !db) redirect('/login?e=server');
  if (password.length < 8) redirect(`/reset/${token}?e=weak`);

  const [row] = await db.select().from(schema.passwordResets)
    .where(and(eq(schema.passwordResets.token, token), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, new Date())))
    .limit(1);
  if (!row) redirect(`/reset/${token}?e=invalid`);

  await db.update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, row.userId));
  await db.update(schema.passwordResets).set({ usedAt: new Date() }).where(eq(schema.passwordResets.id, row.id));
  redirect('/login?reset=1');
}
