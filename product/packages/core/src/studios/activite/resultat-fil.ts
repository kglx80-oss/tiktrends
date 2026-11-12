import type { LectureConclusion } from '../../spatial/resultats/conclusion-lot';
import type { EtatLotSpatial } from '../../spatial/resultats/lots';
import { resultatHypothese, type ProvenanceCommentaire, type ProvenanceNote, type StatutResultatHypothese } from '../../spatial/resultats/boucle-preuve';
import { cartesHypotheses, COLONNES_HYPOTHESES, type ColonneHypothese, type FaitsHypotheseAd } from '../../spatial/resultats/ecrans';
import type { OrigineHypotheseLibre } from '../../spatial/resultats/hypotheses-libres';

/**
 * Studios · le RÉSULTAT sous le FIL d'où l'itération est née · un commentaire
 * de l'onglet Activité (#1066) ou une note du canvas de lignée (lot 11, #1078).
 *
 * Pur · ni base, ni réseau, ni modèle, ni horloge. La règle est écrite UNE fois
 * pour les deux fils · une itération née du fil (provenance
 * `source_ref_json.commentaire` ou `source_ref_json.note`, posée par le serveur
 * après relecture, `provenanceFilAdmise`) dit son RÉSULTAT sous le fil
 * d'origine, une fois son lot conclu · « Itération confirmée », « infirmée » ou
 * « sans conclusion », le chiffre clé et le lien vers le lot.
 *
 * Le statut est CALCULÉ à chaque affichage par la règle des hypothèses
 * (`resultatHypothese` sur la conclusion du lot, `conclusionLot` · la même
 * lecture que la carte de l'hypothèse, les mêmes seuils) · jamais écrit, jamais
 * recopié sur le fil. Tant que le lot n'est pas conclu (ou que l'itération
 * n'est rangée dans aucun lot) · aucun résultat, l'écran dit « en test ».
 * Résultats fermé à la personne · rien (le fil ne révèle pas ce que Résultats
 * tait). La marque du projet n'est pas la marque active · le résultat se dit,
 * le lien vers le lot est fermé avec sa raison (la fiche d'un lot se lit dans
 * la marque active).
 *
 * Seulement pour la note · une note posée sur un nœud brief ou hypothèse d'où
 * est née une HYPOTHÈSE (« Formuler une hypothèse », origine `type: 'note'`,
 * `provenanceNoteHypotheseAdmise`) dit le statut de cette hypothèse · la règle
 * EXISTANTE de sa carte (`cartesHypotheses` · colonne, conclusion, résultat du
 * lot), rien de recalculé à part.
 *
 * `resultat-commentaire.ts` garde ses exports, qui sont ceux-ci.
 */

export const RAISON_LOT_AUTRE_MARQUE = 'Le lot se lit dans sa marque · ouvre la marque du projet pour le voir.';
export const PHRASE_ITERATION_EN_TEST = 'son résultat se lira ici quand son lot sera conclu';

export const LIBELLE_RESULTAT_FIL: Record<StatutResultatHypothese, string> = {
  confirmee: 'Itération confirmée', infirmee: 'Itération infirmée', sans_conclusion: 'Itération sans conclusion',
};
export const LIBELLE_ITERATION_EN_TEST = 'Itération en test';

/** Le fil d'où naît une itération · un commentaire (Activité) ou une note (lignée). */
export type FilResultat = 'commentaire' | 'note';

/** Une itération du fil, lue dans la marque du projet · son lot et la conclusion de ce lot. */
export interface IterationDuFil {
  adId: string;
  /** Le code de variante de l'itération (« V7 »). */
  variante: string;
  lot: { id: string; numero: number; etat: EtatLotSpatial } | null;
  conclusion: LectureConclusion | null;
}

export type ResultatFil =
  | {
    etat: 'conclue'; adId: string; variante: string; statut: StatutResultatHypothese; libelle: string;
    classe: '' | 'g' | 'r'; icone: 'check' | 'x' | 'q'; chiffre: string;
    lot: { numero: number; href: string | null; raison: string | null };
  }
  | { etat: 'en_test'; adId: string; variante: string; libelle: string; phrase: string };

/** Ce que chaque fil porte comme provenance sur l'ad · l'identifiant du fil et son projet. */
type AdDeFil = { commentaire?: ProvenanceCommentaire | null; note?: ProvenanceNote | null };

/** L'identifiant du fil et le projet que l'ad porte pour CE fil · `null` sans provenance de ce fil. */
function provenanceDuFil(fil: FilResultat, a: AdDeFil): { id: string; projetId: string } | null {
  if (fil === 'commentaire') return a.commentaire ? { id: a.commentaire.commentaireId, projetId: a.commentaire.projetId } : null;
  return a.note ? { id: a.note.noteId, projetId: a.note.projetId } : null;
}

/**
 * Les itérations nées de CE fil de CE projet · la provenance du fil relue (même
 * identifiant ET même projet), rien d'autre ne compte · une provenance d'un
 * autre projet n'est jamais rattachée.
 */
export function iterationsDuFil<T extends AdDeFil>(ads: readonly T[], o: { fil: FilResultat; id: string; projetId: string }): T[] {
  const id = o.id.toLowerCase(); const p = o.projetId.toLowerCase();
  return ads.filter((a) => {
    const x = provenanceDuFil(o.fil, a);
    return !!x && x.id.toLowerCase() === id && x.projetId.toLowerCase() === p;
  });
}

/**
 * Ce que le fil dit de ses itérations · une ligne par itération, dans l'ordre
 * des codes de variante · `[]` sans itération, ou Résultats fermé.
 */
export function resultatsFil(iterations: readonly IterationDuFil[], o: { resultats: boolean; marqueActive: boolean }): ResultatFil[] {
  if (!o.resultats) return [];
  return [...iterations]
    .sort((a, b) => a.variante.localeCompare(b.variante, 'fr', { numeric: true }) || a.adId.localeCompare(b.adId))
    .map((it): ResultatFil => {
      const r = resultatHypothese(it.lot, it.conclusion);
      if (!r) return { etat: 'en_test', adId: it.adId, variante: it.variante, libelle: LIBELLE_ITERATION_EN_TEST, phrase: PHRASE_ITERATION_EN_TEST };
      return {
        etat: 'conclue', adId: it.adId, variante: it.variante, statut: r.statut, libelle: LIBELLE_RESULTAT_FIL[r.statut],
        classe: r.classe, icone: r.icone, chiffre: r.chiffre,
        lot: { numero: r.lot.numero, href: o.marqueActive ? r.lot.href : null, raison: o.marqueActive ? null : RAISON_LOT_AUTRE_MARQUE },
      };
    });
}

/* ───────────────────────── l'hypothèse née d'une note ───────────────────────── */

export const RAISON_HYPOTHESES_AUTRE_MARQUE = 'Les hypothèses se lisent dans leur marque · ouvre la marque du projet pour les voir.';
export const LIEN_PAGE_HYPOTHESES = '/adsmap/hypotheses';

/** Ce qu'une note dit d'une hypothèse née d'elle · la colonne et la conclusion de SA carte, le chiffre et le lien qu'elle porte. */
export interface StatutHypotheseNote {
  adId: string;
  colonne: ColonneHypothese;
  /** « Hypothèse · En test » · le titre de la colonne où la carte se range. */
  libelle: string;
  /** La phrase de l'hypothèse, telle que sa carte la dit. */
  texte: string;
  /** La conclusion de la carte (« Confirmée », « Infirmée », « Sans conclusion », « Non tranchée »…) · `null` avant. */
  conclusion: { libelle: string; classe: '' | 'g' | 'r'; icone: 'check' | 'x' | 'q' } | null;
  /** Le chiffre clé du lot conclu qui la teste (`resultatHypothese`) · `null` sans lui. */
  chiffre: string | null;
  /** Où la lire · le lot (conclu ou en cours), « Ranger dans un lot », sinon la page Hypothèses · fermé avec sa raison hors de la marque active. */
  lien: { libelle: string; href: string | null; raison: string | null };
}

/** Les hypothèses nées de CETTE note de CE projet · l'origine relue (`type: 'note'`, même note ET même projet). */
export function hypothesesDeLaNote<T extends { origine?: OrigineHypotheseLibre | null }>(ads: readonly T[], o: { noteId: string; projetId: string }): T[] {
  const n = o.noteId.toLowerCase(); const p = o.projetId.toLowerCase();
  return ads.filter((a) => a.origine?.type === 'note' && !!a.origine.noteId && !!a.origine.projetId
    && a.origine.noteId.toLowerCase() === n && a.origine.projetId.toLowerCase() === p);
}

const TITRE_COLONNE = new Map(COLONNES_HYPOTHESES.map((c) => [c.cle, c.titre]));

/**
 * Le statut des hypothèses nées d'une note · la carte de chaque hypothèse
 * calculée par la règle EXISTANTE (`cartesHypotheses`, sans suite) · `[]` sans
 * hypothèse, ou Résultats fermé.
 */
export function statutsHypothesesNote(faits: readonly FaitsHypotheseAd[], o: { resultats: boolean; marqueActive: boolean }): StatutHypotheseNote[] {
  if (!o.resultats) return [];
  return cartesHypotheses(faits, []).map((c): StatutHypotheseNote => {
    const lot = c.resultat ? { libelle: `Voir le lot #${c.resultat.lot.numero}`, href: c.resultat.lot.href, lot: true }
      : c.action ? { libelle: c.action.libelle, href: c.action.href, lot: true }
        : { libelle: 'Voir les hypothèses', href: LIEN_PAGE_HYPOTHESES, lot: false };
    return {
      adId: c.cle, colonne: c.colonne, libelle: `Hypothèse · ${TITRE_COLONNE.get(c.colonne)}`, texte: c.texte,
      conclusion: c.conclusion, chiffre: c.resultat?.chiffre ?? null,
      lien: { libelle: lot.libelle, href: o.marqueActive ? lot.href : null, raison: o.marqueActive ? null : lot.lot ? RAISON_LOT_AUTRE_MARQUE : RAISON_HYPOTHESES_AUTRE_MARQUE },
    };
  });
}
