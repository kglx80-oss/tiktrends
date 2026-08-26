// Authentification TikTrends · sessions (cookie signé) + mots de passe (bcrypt).
// SERVEUR UNIQUEMENT (ne jamais importer depuis un composant client).
import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { db, schema } from '@tiktrends/db';
import { eq } from 'drizzle-orm';
import type { Role, Plan } from './rbac';

const COOKIE = 'tt_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 jours
const secretKey = () => new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-insecure-secret');

export interface Session {
  user: { id: string; email: string; name: string | null };
  workspaceId: string;
  workspaceName: string;
  role: Role;
  plan: Plan;
}

/* ----------------------------- Mots de passe ----------------------------- */
/**
 * Inscription self-service ouverte par défaut (chacun crée son espace, sans invitation).
 * Fermable via SIGNUP_OPEN=false (accès alors uniquement sur invitation).
 */
export function signupOpen(): boolean {
  return process.env.SIGNUP_OPEN !== 'false';
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

/* ------------------------------- Sessions -------------------------------- */
export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}

async function readUid(): Promise<string | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return (payload.uid as string) || null;
  } catch {
    return null;
  }
}

/** Session courante (identité fraîche + rôle/plan relus en base). null si absente. */
export async function getSession(): Promise<Session | null> {
  if (!db) return null;
  const uid = await readUid();
  if (!uid) return null;

  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, uid)).limit(1);
  if (!u) return null;

  const [m] = await db
    .select()
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, uid))
    .limit(1);
  if (!m) return null;

  const [w] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, m.workspaceId))
    .limit(1);
  if (!w) return null;

  return {
    user: { id: u.id, email: u.email, name: u.name },
    workspaceId: w.id,
    workspaceName: w.name,
    role: m.role as Role,
    plan: (w.plan as Plan) || 'starter',
  };
}
