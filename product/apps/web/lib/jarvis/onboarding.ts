import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';

/**
 * UX V5 · le fil d'ONBOARDING de Jarvis (sans marque) · côté base.
 *
 * Portée espace + personne (pas de marque · il n'y en a pas). Un seul fil par
 * (espace, personne) · restitué au rechargement. Aucune marque n'est jamais
 * lue ni fabriquée ici.
 */

const O = schema.jarvisOnboardingMessages;

export interface PorteeOnboarding { workspaceId: string; userId: string }
export interface MessageOnboarding { id: string; role: string; content: string; createdAt: Date }

export async function messagesOnboarding(p: PorteeOnboarding): Promise<MessageOnboarding[]> {
  const rows = await db.select({ id: O.id, role: O.role, content: O.content, createdAt: O.createdAt })
    .from(O)
    .where(and(eq(O.workspaceId, p.workspaceId), eq(O.userId, p.userId)))
    .orderBy(asc(O.createdAt)).limit(120);
  return rows.map((r) => ({ id: r.id, role: r.role, content: r.content, createdAt: r.createdAt as Date }));
}

export async function insererMessageOnboarding(p: PorteeOnboarding, role: 'user' | 'assistant', content: string): Promise<void> {
  await db.insert(O).values({ workspaceId: p.workspaceId, userId: p.userId, role, content });
}

export async function effacerOnboarding(p: PorteeOnboarding): Promise<void> {
  await db.delete(O).where(and(eq(O.workspaceId, p.workspaceId), eq(O.userId, p.userId)));
}
