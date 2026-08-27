import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { isFounder } from './founder';

/**
 * Crédits illimités pour les comptes fondateur/créateur (FOUNDER_EMAILS).
 * Quand vrai : on ne vérifie pas le solde et on ne débite pas.
 * (Les espaces clients restent soumis au barème normal.)
 */
export function unlimitedCredits(email?: string | null): boolean {
  return isFounder(email);
}

/**
 * Débit atomique AVANT le travail : un seul UPDATE conditionnel, donc deux requêtes
 * concurrentes ne peuvent pas passer la même vérification de solde. Renvoie false si
 * le solde est insuffisant (rien n'est débité dans ce cas).
 */
export async function reserveCredits(workspaceId: string, cost: number, reason: string): Promise<boolean> {
  if (!db || cost <= 0) return true;
  const rows = await db.update(schema.workspaces)
    .set({ creditsBalance: sql`${schema.workspaces.creditsBalance} - ${cost}` })
    .where(and(eq(schema.workspaces.id, workspaceId), gte(schema.workspaces.creditsBalance, cost)))
    .returning({ c: schema.workspaces.creditsBalance });
  if (!rows.length) return false;
  await db.insert(schema.creditLedger).values({ workspaceId, delta: -cost, reason });
  return true;
}

/**
 * Encaissement APRÈS livraison : le résultat est déjà entre les mains du client, on
 * ne peut plus refuser · on débite sans jamais passer sous zéro. Écrit toujours la
 * ligne de grand livre, sinon la consommation n'apparaît pas dans /usage.
 */
export async function settleCredits(workspaceId: string, cost: number, reason: string): Promise<void> {
  if (!db || cost <= 0) return;
  await db.update(schema.workspaces)
    .set({ creditsBalance: sql`greatest(0, ${schema.workspaces.creditsBalance} - ${cost})` })
    .where(eq(schema.workspaces.id, workspaceId));
  await db.insert(schema.creditLedger).values({ workspaceId, delta: -cost, reason });
}

/** Remboursement (génération ratée, annulation) · toujours tracé. */
export async function refundCredits(workspaceId: string, amount: number, reason: string): Promise<void> {
  if (!db || amount <= 0) return;
  await db.update(schema.workspaces)
    .set({ creditsBalance: sql`${schema.workspaces.creditsBalance} + ${amount}` })
    .where(eq(schema.workspaces.id, workspaceId));
  await db.insert(schema.creditLedger).values({ workspaceId, delta: amount, reason });
}
