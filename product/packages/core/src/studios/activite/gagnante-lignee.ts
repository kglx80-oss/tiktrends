import { lireProvenanceCommentaire, lireProvenanceNote, type ProvenanceCommentaire, type ProvenanceNote } from '../../spatial/resultats/boucle-preuve';
import { noeudDeGeste } from '../../spatial/projet/notes-gestes';
import type { ModeleLignee } from '../canvas/lignee';
import { gestesGagnantesLot, lireDepuisGagnante, lireGagnanteDuFil, type GesteGagnante, type LotPourGagnante, type PlanDesGagnantes } from './iterer-gagnante';

/**
 * Studios · la CARTE DE LIGNÉE dit d'où part une itération et propose
 * d'itérer depuis une gagnante (suite de #1083 et #1085). Pur · ni base, ni
 * réseau, ni modèle, ni horloge.
 *
 * Sur le nœud « Résultat » d'une variante dont la pub de test est NÉE d'une
 * gagnante · « née de la gagnante V7 » (`phraseNeeDeGagnante`, la phrase sous
 * le fil). La provenance est LUE, jamais écrite · `source_ref_json.depuisGagnante`
 * (fiche d'un lot conclu, carte d'une hypothèse confirmée · #1085) ou
 * `gagnanteAdId` dans la provenance d'un fil (commentaire, note · #1083) · puis
 * la gagnante est RELUE dans la marque du projet (les lots de la marque) ·
 *  · lot ou carte · la gagnante est une ad de la marque, dans le lot nommé ;
 *  · fil · la gagnante est une ad de la marque née du MÊME fil (même
 *    identifiant, même projet) · la règle de #1083 sous le fil ;
 *  · jamais l'ad elle-même · une gagnante introuvable, d'une autre marque ou
 *    d'un autre lot · rien n'est dit (rien n'est cru du JSON).
 *
 * Sur le nœud « Résultat » d'une variante arbitrée gagnante d'un lot CONCLU ·
 * « Itérer depuis la gagnante », par LA règle de la fiche du lot
 * (`gestesGagnantesLot` · même adresse, mêmes raisons · autre marque active,
 * rôle, plan) · rien sur les autres nœuds.
 */

/** D'où une ad est née d'une gagnante, lu dans son JSON de source · identifiants seuls. */
export type NaissanceGagnante =
  | { source: 'lot' | 'hypothese'; lotId: string; gagnanteAdId: string }
  | { source: 'commentaire' | 'note'; filId: string; projetId: string; gagnanteAdId: string };

/** La naissance d'une ad · `depuisGagnante` d'abord (#1085), puis la gagnante d'un fil (#1083) · `null` sans (ou JSON abîmé). */
export function lireNaissanceGagnante(sourceRef: unknown): NaissanceGagnante | null {
  const d = lireDepuisGagnante(sourceRef);
  if (d) return { source: d.source, lotId: d.lotId, gagnanteAdId: d.gagnanteAdId };
  const c = lireProvenanceCommentaire(sourceRef);
  const gc = c ? lireGagnanteDuFil(sourceRef, 'commentaire') : null;
  if (c && gc) return { source: 'commentaire', filId: c.commentaireId.toLowerCase(), projetId: c.projetId.toLowerCase(), gagnanteAdId: gc };
  const n = lireProvenanceNote(sourceRef);
  const gn = n ? lireGagnanteDuFil(sourceRef, 'note') : null;
  if (n && gn) return { source: 'note', filId: n.noteId.toLowerCase(), projetId: n.projetId.toLowerCase(), gagnanteAdId: gn };
  return null;
}

/** Une ad de la marque du projet, relue dans ses lots · son code, son lot, la provenance de fil qu'elle porte. */
export interface AdRelueGagnante {
  id: string;
  variante: string;
  lotId: string | null;
  commentaire?: ProvenanceCommentaire | null;
  note?: ProvenanceNote | null;
}

const egal = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Le code de la gagnante d'où l'ad est née, RELUE dans la marque du projet · `null` sinon (rien n'est dit). */
export function neeDeGagnanteRelue(enfantAdId: string, n: NaissanceGagnante | null | undefined, relue: (adId: string) => AdRelueGagnante | undefined): string | null {
  if (!n || egal(n.gagnanteAdId, enfantAdId)) return null;
  const g = relue(n.gagnanteAdId.toLowerCase());
  if (!g) return null;
  if (!('filId' in n)) return egal(g.lotId, n.lotId) ? g.variante : null;
  const fil = n.source === 'commentaire'
    ? (g.commentaire ? { id: g.commentaire.commentaireId, projetId: g.commentaire.projetId } : null)
    : (g.note ? { id: g.note.noteId, projetId: g.note.projetId } : null);
  return fil && egal(fil.id, n.filId) && egal(fil.projetId, n.projetId) ? g.variante : null;
}

/** Un nœud « Résultat » de la lignée et la pub de test de sa variante · `enLot` · la fiche est dans un lot de test (seule une telle pub peut être une gagnante d'un lot conclu). */
export interface ResultatDeLignee { noeud: string; adId: string; enLot: boolean }

/** Les nœuds « Résultat » de la lignée, avec la pub de test de leur variante (`testDe`, lu par le serveur) · dans l'ordre de la lignée. */
export function resultatsDeLaLignee(m: Pick<ModeleLignee, 'noeuds'>, testDe: (varianteId: string) => string | null | undefined): ResultatDeLignee[] {
  return m.noeuds.flatMap((x) => {
    const n = x.type === 'resultat' ? noeudDeGeste(x.id) : null;
    const adId = n && n.geste === 'iterer' ? testDe(n.varianteId) : null;
    return adId ? [{ noeud: x.id, adId: adId.toLowerCase(), enLot: !!x.lotTest }] : [];
  });
}

/** Ce que la carte ajoute à UN nœud · absent, rien n'est ajouté. */
export interface GagnanteDuNoeud {
  /** Le code de la gagnante d'où l'itération est née (« née de la gagnante V7 »). */
  neeDe?: string;
  /** « Itérer depuis la gagnante » sur la variante arbitrée gagnante d'un lot conclu · `variante` · son code. */
  geste?: { geste: GesteGagnante; variante: string };
}

/**
 * Ce que la carte de lignée ajoute à ses nœuds « Résultat » · seulement les
 * nœuds qui ont quelque chose à dire · `{}` sinon (le rendu reste celui
 * d'avant). `lots` · les lots de la marque du projet, présentés (état,
 * conclusion du lot entier) · `relue` · les ads de ces lots et hors lot.
 */
export function gagnantesDeLaLignee(resultats: readonly ResultatDeLignee[], f: {
  naissances: ReadonlyMap<string, NaissanceGagnante>;
  relue: (adId: string) => AdRelueGagnante | undefined;
  lots: readonly LotPourGagnante[];
  o: { marqueActive: boolean; peutIterer: boolean; plan?: PlanDesGagnantes | null };
}): Record<string, GagnanteDuNoeud> {
  const out: Record<string, GagnanteDuNoeud> = {};
  const gestesDuLot = new Map<string, Record<string, GesteGagnante>>();
  const gestes = (l: LotPourGagnante) => {
    if (!gestesDuLot.has(l.id)) {
      const g = gestesGagnantesLot(l, f.o);
      gestesDuLot.set(l.id, Object.fromEntries(Object.entries(g).map(([k, v]) => [k.toLowerCase(), v])));
    }
    return gestesDuLot.get(l.id)!;
  };
  for (const r of resultats) {
    const neeDe = neeDeGagnanteRelue(r.adId, f.naissances.get(r.adId), f.relue);
    const lot = r.enLot ? f.lots.find((l) => l.ads.some((a) => egal(a.id, r.adId))) : undefined;
    const g = lot ? gestes(lot)[r.adId] : undefined;
    const variante = lot?.ads.find((a) => egal(a.id, r.adId))?.variante;
    if (!neeDe && !(g && variante)) continue;
    out[r.noeud] = { ...(neeDe ? { neeDe } : {}), ...(g && variante ? { geste: { geste: g, variante } } : {}) };
  }
  return out;
}

/** Les gestes de la carte, par pub de test · ce que le plan lit (une fois, seulement pour les gestes ouverts · `planPourGestes`). */
export function gestesParAdDeLaLignee(resultats: readonly ResultatDeLignee[], par: Readonly<Record<string, GagnanteDuNoeud>>): Record<string, GesteGagnante> {
  return Object.fromEntries(resultats.flatMap((r) => {
    const g = par[r.noeud]?.geste?.geste;
    return g ? [[r.adId, g]] : [];
  }));
}
