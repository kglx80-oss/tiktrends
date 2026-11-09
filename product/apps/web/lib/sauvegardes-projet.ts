import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { briefInspirationSauvegardes, titreSelectionProjet } from '@tiktrends/core';
import type { ContexteStudio } from './studios/garde';
import { chargerSources } from './studios/sources/sources';
import { lireMetaSauvegardes } from './veille-tags';
import type { DepartAssistant } from '../app/actions/studios/departs-assistant';

/**
 * Lot 6 bis V5 (VB SV01) · la SÉLECTION des Sauvegardes relue par la
 * préparation d'un projet. Hors d'un fichier `'use server'` · seule la page
 * (`studio/projets/nouveau`) l'appelle, après SES gardes (Studios, capacité
 * projets) et avec SA portée (marque active accessible, ou aucune).
 *
 *  · les sauvegardes sont relues ENSEMBLE par `chargerSources` (espace, marque
 *    visible · double garde SQL et pure) · une seule hors de portée et AUCUNE
 *    n'est jointe (`ok: false`, la page dit `REFUS_SELECTION_PROJET`, rien de
 *    l'autre marque n'est lu ni dit) ;
 *  · leurs tags et leurs notes sont lus dans l'espace, pour CES sauvegardes
 *    seulement, et deviennent le brief d'inspiration proposé (noyau,
 *    `briefInspirationSauvegardes`) · aucune écriture, aucun modèle.
 */
export type SelectionRelue =
  | { ok: true; references: DepartAssistant[]; brief: string; titre: string; annonceurs: string[] }
  | { ok: false };

export async function relireSelectionProjet(ctx: ContexteStudio, refs: readonly string[], o: { veilleOuverte: boolean }): Promise<SelectionRelue> {
  if (!db || refs.length === 0) return { ok: false };
  const r = await chargerSources(ctx, refs.map((id) => ({ type: 'sauvegarde' as const, id })), { veilleOuverte: o.veilleOuverte, maintenant: new Date() });
  if (!r.ok) return { ok: false };
  const parId = new Map(r.sources.filter((s) => s.savedAdId).map((s) => [s.savedAdId!, s]));
  if (!refs.every((id) => parId.has(id))) return { ok: false };
  const notes = new Map((await db.select({ id: schema.savedAds.id, note: schema.savedAds.note }).from(schema.savedAds)
    .where(and(eq(schema.savedAds.workspaceId, ctx.workspaceId), inArray(schema.savedAds.id, [...refs])))).map((l) => [l.id, l.note]));
  const meta = await lireMetaSauvegardes(ctx.workspaceId, refs);
  const annonceurs = refs.map((id) => parId.get(id)!.annonceur || 'une annonce sauvegardée');
  const references: DepartAssistant[] = refs.map((id, k) => ({ origine: 'veille', id, titre: `D’après ${annonceurs[k]}`, intention: '', sources: [{ type: 'sauvegarde', id }], testId: null }));
  const brief = briefInspirationSauvegardes(refs.map((id, k) => ({ annonceur: annonceurs[k]!, tags: meta.get(id)?.tags ?? [], note: notes.get(id) ?? null })));
  return { ok: true, references, brief, titre: titreSelectionProjet(annonceurs), annonceurs };
}
