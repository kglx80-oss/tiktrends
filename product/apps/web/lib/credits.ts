import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { isFounder } from './founder';

/**
 * Registre en mémoire des comptes d'ÉQUIPE à accès total (adminplus/admin) qui
 * ne sont pas des fondateurs codés en dur · alimenté par `getSession`.
 *
 * Pourquoi un registre plutôt qu'une lecture base à chaque débit : `unlimitedCredits`
 * est synchrone et appelé depuis ~30 endroits (email seul, sans session). Le
 * rendre asynchrone essaimerait partout. Le registre reste correct et
 * AUTO-CICATRISANT : toute action qui dépense passe d'abord par `getSession`,
 * qui (ré)inscrit ou retire le compte selon son rôle courant. Un admin
 * rétrogradé est donc retiré AVANT sa prochaine dépense, dans la requête même.
 */
const EMAILS_STAFF_ILLIMITE = new Set<string>();

/** Appelé par getSession · `illimite` = le compte a un rôle d'équipe à accès total. */
export function noterCreditsStaff(email: string | null | undefined, illimite: boolean): void {
  const e = email?.trim().toLowerCase();
  if (!e) return;
  if (illimite) EMAILS_STAFF_ILLIMITE.add(e);
  else EMAILS_STAFF_ILLIMITE.delete(e);
}

/**
 * Crédits illimités · fondateurs (codés en dur / FOUNDER_EMAILS) ET membres de
 * l'équipe à accès total (adminplus/admin, inscrits par getSession).
 * Quand vrai : on ne vérifie pas le solde et on ne débite pas.
 * (Les espaces clients restent soumis au barème normal.)
 */
export function unlimitedCredits(email?: string | null): boolean {
  if (isFounder(email)) return true;
  const e = email?.trim().toLowerCase();
  return !!e && EMAILS_STAFF_ILLIMITE.has(e);
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

/** Remboursement (génération ratée, annulation) · toujours tracé. */
export async function refundCredits(workspaceId: string, amount: number, reason: string): Promise<void> {
  if (!db || amount <= 0) return;
  await db.update(schema.workspaces)
    .set({ creditsBalance: sql`${schema.workspaces.creditsBalance} + ${amount}` })
    .where(eq(schema.workspaces.id, workspaceId));
  await db.insert(schema.creditLedger).values({ workspaceId, delta: amount, reason });
}
