'use server';

import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { isFounder } from '../../lib/founder';

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
type Kind = 'normal' | 'beta' | 'staff';

/**
 * Provisionne un compte de TEST / beta : accorde N crédits de test valables D jours à un espace,
 * et marque son type (beta / staff). Réservé au fondateur.
 */
export async function grantTestPackAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!isFounder(s.user.email)) redirect('/console?e=forbidden');

  const workspaceId = norm(formData.get('workspaceId'));
  const credits = Math.max(0, Math.min(100_000, parseInt(norm(formData.get('credits')) || '0', 10) || 0));
  const days = Math.max(1, Math.min(365, parseInt(norm(formData.get('days')) || '14', 10) || 14));
  const kindRaw = norm(formData.get('kind')) as Kind;
  const kind: Kind = (['normal', 'beta', 'staff'] as Kind[]).includes(kindRaw) ? kindRaw : 'beta';
  if (!workspaceId) redirect('/console?e=badinput');

  const [w] = await db.select({ c: schema.workspaces.creditsBalance, t: schema.workspaces.trialCredits }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  if (!w) redirect('/console?e=badinput');

  const trialEndsAt = new Date(Date.now() + days * 86_400_000);
  // Incréments en SQL : une génération lancée entre la lecture et l'écriture ne
  // doit pas être annulée par un solde recalculé sur une valeur périmée.
  await db.update(schema.workspaces).set({
    creditsBalance: sql`greatest(0, ${schema.workspaces.creditsBalance} + ${credits})`,
    trialCredits: sql`coalesce(${schema.workspaces.trialCredits}, 0) + ${credits}`,
    trialEndsAt, accountKind: kind,
  }).where(eq(schema.workspaces.id, workspaceId));
  if (credits > 0) await db.insert(schema.creditLedger).values({ workspaceId, delta: credits, reason: `Crédits de test (${days} j)` });
  redirect('/console?ok=testpack');
}

/** Termine la période d'essai immédiatement (remet le solde à zéro). Fondateur. */
export async function revokeTrialAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!isFounder(s.user.email)) redirect('/console?e=forbidden');
  const workspaceId = norm(formData.get('workspaceId'));
  if (!workspaceId) redirect('/console?e=badinput');
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  if (w && (w.c ?? 0) > 0) await db.insert(schema.creditLedger).values({ workspaceId, delta: -(w.c ?? 0), reason: 'Fin de période de test (révoquée)' });
  await db.update(schema.workspaces).set({ creditsBalance: 0, trialEndsAt: new Date() }).where(eq(schema.workspaces.id, workspaceId));
  redirect('/console?ok=revoked');
}
