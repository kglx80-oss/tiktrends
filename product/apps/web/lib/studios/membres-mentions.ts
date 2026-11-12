import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { analyserMentions, membresMentionnables, type MembreBrut, type MembreMentionnable, type MentionStockee } from '@tiktrends/core';
import { FEATURE_STUDIO, type ContexteStudio } from './garde';
import type { ProjetStudio } from './depot';
import { effectiveAccess } from '../access';
import { canAccess, type Plan, type Role } from '../rbac';

/**
 * Studios · les MEMBRES qu'un fil de texte du projet peut mentionner ·
 * commentaires (lot 10, `activite.ts`) et notes de la lignée (lot 11,
 * `notes-lignee.ts`) · une seule lecture, une seule règle (au noyau,
 * `C/studios/activite/mentions.ts` · `membresMentionnables`, `analyserMentions`).
 * LECTURE seule · rien n'est écrit ici.
 */

/** Au plus 500 membres lus par espace · la liste des mentions et les noms affichés. */
export const MEMBRES_MAX_LUS = 500;

/**
 * Les membres de l'espace du projet, tels que la règle des mentions les lit ·
 * rôle, formule de l'espace (`canAccess` sur la fonction Studios, la garde),
 * restrictions de marque, nom, adresse, masque · LECTURE seule.
 */
export async function membresDeLEspace(p: Pick<ProjetStudio, 'workspaceId'>): Promise<MembreBrut[]> {
  const M = schema.workspaceMembers; const U = schema.users; const R = schema.studioMemberBrandScopes; const W = schema.workspaces;
  const [lignes, restrictions, [w]] = await Promise.all([
    db.select({ id: M.userId, role: M.role, nom: U.name, email: U.email, masque: U.hidePersonalInfo }).from(M).innerJoin(U, eq(U.id, M.userId))
      .where(eq(M.workspaceId, p.workspaceId)).limit(MEMBRES_MAX_LUS),
    db.select({ userId: R.userId, brandId: R.brandId }).from(R).where(eq(R.workspaceId, p.workspaceId)),
    db.select({ plan: W.plan }).from(W).where(eq(W.id, p.workspaceId)).limit(1),
  ]);
  const plan = ((w?.plan as Plan | undefined) || 'starter') as Plan;
  return lignes.map((l) => ({
    id: l.id, nom: l.nom, email: l.email, masque: !!l.masque, roleEspace: l.role,
    studioOuvert: canAccess(effectiveAccess({ role: l.role as Role, plan, user: { email: l.email } }), FEATURE_STUDIO),
    restrictionsMarque: restrictions.filter((r) => r.userId === l.id).map((r) => r.brandId),
  }));
}

/** Qui peut être mentionné par la session dans ce projet · la règle du noyau sur les membres relus. */
export const mentionnablesDe = (ctx: ContexteStudio, p: Pick<ProjetStudio, 'workspaceId' | 'brandId'>, membres: readonly MembreBrut[]): MembreMentionnable[] =>
  membresMentionnables(membres, { projet: p, marquesDuWorkspace: ctx.marquesDuWorkspace, auteurId: ctx.userId });

/** Les mentions d'un texte normalisé, relues contre les membres qui voient le projet · `[]` si la lecture échoue (le texte reste du texte). */
export async function mentionsDuTexte(ctx: ContexteStudio, p: Pick<ProjetStudio, 'workspaceId' | 'brandId'>, texte: string, demande: unknown): Promise<MentionStockee[]> {
  if (!Array.isArray(demande) || demande.length === 0) return [];
  const membres = await membresDeLEspace(p).catch(() => [] as MembreBrut[]);
  return analyserMentions(texte, demande, mentionnablesDe(ctx, p, membres));
}
