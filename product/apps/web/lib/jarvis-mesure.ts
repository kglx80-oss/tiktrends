import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { BORNE_MESURE_JARVIS, reponseLisible, type ReponseStockee } from '@tiktrends/core';
import type { Session } from './auth';

/**
 * Jarvis mesuré sur ses vraies réponses (lot 5 quater V5) · la LECTURE.
 * Les règles vivent au noyau (`C/spatial/jarvis/mesure.ts`).
 *
 * Deux lectures, jamais une écriture, aucun modèle :
 *  · les réponses · `jarvis_messages`, rôle « assistant », de l'ESPACE de la
 *    session seulement, les plus récentes d'abord, au plus `BORNE_MESURE_JARVIS`
 *    · une réponse d'un autre espace n'est jamais lue ;
 *  · les NOMS des marques de la plateforme · lus pour être MASQUÉS dans les
 *    extraits (`extraitAnonymise`), jamais affichés, jamais remis à la vue.
 * `mienne` · la réponse appartient à la personne qui lit · seules celles-là
 * fournissent des exemples (les autres membres ne sont que comptés).
 */

/** La borne de la liste de masquage · large au-dessus du nombre de marques de la plateforme, jamais affichée. */
const BORNE_NOMS = 20_000;

export async function lireReponsesPourMesure(s: Pick<Session, 'workspaceId' | 'user'>, borne = BORNE_MESURE_JARVIS): Promise<{ reponses: ReponseStockee[]; noms: string[] } | null> {
  if (!db) return null;
  const M = schema.jarvisMessages;
  const [lignes, marques] = await Promise.all([
    db.select({ content: M.content, le: M.createdAt, userId: M.userId }).from(M)
      .where(and(eq(M.workspaceId, s.workspaceId), eq(M.role, 'assistant')))
      .orderBy(desc(M.createdAt)).limit(borne),
    db.select({ nom: schema.brands.name }).from(schema.brands).limit(BORNE_NOMS),
  ]);
  return {
    reponses: lignes.map((l) => ({
      texte: reponseLisible(l.content).texte,
      le: (l.le instanceof Date ? l.le : new Date(String(l.le))).toISOString(),
      mienne: l.userId === s.user.id,
    })),
    noms: marques.map((m) => m.nom).filter((n): n is string => typeof n === 'string'),
  };
}
