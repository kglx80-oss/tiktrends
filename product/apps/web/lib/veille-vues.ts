import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { lireVuesVeilleStockees, type VerdictVue, type VueVeilleEnregistree } from '@tiktrends/core';

/**
 * Persistance des vues enregistrées de la Veille · PAR PERSONNE ET PAR ESPACE.
 *
 * Stockage réutilisé : `app_settings` (clé/valeur jsonb déjà en base), UNE clé
 * par personne et par espace · aucune migration. Même choix, et même raison,
 * que la disposition du canvas des Studios (`lib/studios/canvas/disposition`) :
 * aucune table existante ne porte une préférence PERSONNELLE de l'explorateur,
 * et en créer une demanderait une migration pour quelques Ko par personne.
 *
 * Portée · `workspaceId` et `userId` viennent TOUJOURS de la session (les
 * actions les lisent, jamais le formulaire) et composent la clé · une personne
 * ne lit ni n'écrit que sa propre ligne, dans l'espace courant. La valeur
 * répète l'espace et la personne · une ligne qui ne les décrit pas est ignorée.
 *
 * Écriture · seulement par un geste explicite (garder, renommer, supprimer).
 * La lecture n'écrit jamais, même pour « nettoyer ». Concurrence optimiste sur
 * `rev` (deux onglets de la même personne) · une écriture périmée est rejouée
 * sur la valeur fraîche, jamais écrasée à l'aveugle.
 */

const PREFIXE = 'veille.vues:';
export const cleVuesVeille = (workspaceId: string, userId: string) => `${PREFIXE}${workspaceId}:${userId}`;

interface ValeurStockee { v: 1; rev: number; workspaceId: string; userId: string; vues: VueVeilleEnregistree[] }

async function lireLigne(workspaceId: string, userId: string): Promise<{ vues: VueVeilleEnregistree[]; rev: number }> {
  const A = schema.appSettings;
  const [l] = await db.select({ value: A.value }).from(A).where(eq(A.key, cleVuesVeille(workspaceId, userId))).limit(1);
  const v = l?.value as Partial<ValeurStockee> | undefined;
  const rev = v && Number.isInteger(v.rev) ? (v.rev as number) : 0;
  if (!v || v.workspaceId !== workspaceId || v.userId !== userId) return { vues: [], rev };
  return { vues: lireVuesVeilleStockees(v.vues), rev };
}

/** Lecture PURE · les vues de CETTE personne dans CET espace (liste vide sans base). */
export async function lireVuesVeille(workspaceId: string, userId: string): Promise<VueVeilleEnregistree[]> {
  if (!db) return [];
  try { return (await lireLigne(workspaceId, userId)).vues; } catch { return []; }
}

/**
 * Applique une règle du noyau (`ajouterVueVeille`, `retirerVueVeille`…) à la
 * liste de cette personne et l'écrit · ou rend le refus de la règle, sans
 * rien écrire.
 */
export async function modifierVuesVeille<T extends { vues: VueVeilleEnregistree[] }>(
  workspaceId: string,
  userId: string,
  regle: (vues: VueVeilleEnregistree[]) => VerdictVue<T>,
): Promise<VerdictVue<T>> {
  const A = schema.appSettings;
  const cle = cleVuesVeille(workspaceId, userId);
  for (let essai = 0; essai < 3; essai++) {
    const { vues, rev } = await lireLigne(workspaceId, userId);
    const r = regle(vues);
    if (!r.ok) return r;
    const valeur: ValeurStockee = { v: 1, rev: rev + 1, workspaceId, userId, vues: r.vues };
    if (rev === 0) {
      const ins = await db.insert(A).values({ key: cle, value: valeur }).onConflictDoNothing({ target: A.key }).returning({ key: A.key });
      if (ins[0]) return r;
    } else {
      const maj = await db.update(A)
        .set({ value: valeur, updatedAt: new Date() })
        .where(and(eq(A.key, cle), sql`(${A.value}->>'rev')::int = ${rev}`))
        .returning({ key: A.key });
      if (maj[0]) return r;
    }
  }
  return { ok: false, raison: 'Tes vues ont changé dans un autre onglet · recharge la page puis réessaie.' };
}
