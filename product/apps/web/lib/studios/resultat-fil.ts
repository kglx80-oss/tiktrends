import 'server-only';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  hypothesesDeLaNote, iterationsDuFil,
  type FaitsHypotheseAd, type FilResultat, type IterationDuFil,
} from '@tiktrends/core';
import type { ContexteStudio } from './garde';
import type { ProjetStudio } from './depot';
import { chargerLots, faitsHypotheses } from '../../app/(spatial)/sp/adsmap/donnees';

/**
 * Studios · ce que les FILS d'un projet ont fait naître · les itérations nées
 * d'un commentaire (Activité) ou d'une note de la lignée, et les hypothèses
 * nées d'une note (règles : `C/studios/activite/resultat-fil.ts`).
 *
 * LECTURE SEULE · rien n'est écrit. Les ads qui portent la provenance d'un des
 * fils lus (`source_ref_json.commentaire` / `.note`, ou l'origine
 * `hypotheseLibre.noteId` d'une hypothèse) sont d'abord cherchées dans
 * l'espace · sans aucune, rien d'autre n'est lu. Sinon, chaque ad est
 * retrouvée dans les lots de la MARQUE du projet (`chargerLots` · une ad
 * d'ailleurs n'y est pas), avec la conclusion de son lot contre les autres
 * lots de la marque (`faitsHypotheses`, la lecture de la page Hypothèses) ·
 * puis rattachée au fil SEULEMENT si sa provenance nomme ce fil ET ce projet
 * (`iterationsDuFil`, `hypothesesDeLaNote`) · une provenance d'un autre projet
 * n'est jamais rattachée. Le projet est déjà relu dans la portée (espace,
 * marques visibles) par l'appelant.
 */

export interface ResultatsDesFils {
  iterations: Map<string, IterationDuFil[]>;
  /** Seulement pour les notes · les hypothèses nées de chaque note, telles que leur carte les lit. */
  hypotheses: Map<string, FaitsHypotheseAd[]>;
}

/** Au plus 500 ads nées des fils lues par projet · la borne de la lecture du commentaire. */
export const ADS_NEES_MAX_LUES = 500;

export async function lireResultatsDesFils(ctx: ContexteStudio, p: ProjetStudio, fil: FilResultat, ids: readonly string[]): Promise<ResultatsDesFils> {
  const out: ResultatsDesFils = { iterations: new Map(), hypotheses: new Map() };
  if (!ids.length) return out;
  const A = schema.ads;
  // Les clés du JSON de source (`CLE_PROVENANCE_COMMENTAIRE`, `CLE_PROVENANCE_NOTE`, `CLE_ORIGINE_HYPOTHESE`) écrites en clair · des constantes, jamais une saisie.
  const nee = fil === 'note'
    ? or(inArray(sql<string>`${A.sourceRef}->'note'->>'noteId'`, [...ids]), inArray(sql<string>`${A.sourceRef}->'hypotheseLibre'->>'noteId'`, [...ids]))
    : inArray(sql<string>`${A.sourceRef}->'commentaire'->>'commentaireId'`, [...ids]);
  const nees = await db.select({ id: A.id }).from(A).where(and(eq(A.workspaceId, ctx.workspaceId), nee)).limit(ADS_NEES_MAX_LUES);
  if (!nees.length) return out;
  const faits = faitsHypotheses(await chargerLots(ctx.workspaceId, p.brandId));
  const ads = faits.map((f) => ({ f, commentaire: f.ad.commentaire ?? null, note: f.ad.note ?? null, origine: f.origine ?? null }));
  for (const id of ids) {
    const liste = iterationsDuFil(ads, { fil, id, projetId: p.id }).map(({ f }): IterationDuFil => ({
      adId: f.ad.id, variante: f.ad.variante,
      lot: f.lot ? { id: f.lot.id, numero: f.lot.numero, etat: f.lot.etat } : null,
      conclusion: f.lot?.conclusion ?? null,
    }));
    if (liste.length) out.iterations.set(id, liste);
    if (fil === 'note') {
      const h = hypothesesDeLaNote(ads, { noteId: id, projetId: p.id }).map((x) => x.f);
      if (h.length) out.hypotheses.set(id, h);
    }
  }
  return out;
}
