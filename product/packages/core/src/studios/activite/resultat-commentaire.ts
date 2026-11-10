import type { LectureConclusion } from '../../spatial/resultats/conclusion-lot';
import type { EtatLotSpatial } from '../../spatial/resultats/lots';
import { resultatHypothese, type ProvenanceCommentaire, type StatutResultatHypothese } from '../../spatial/resultats/boucle-preuve';

/**
 * Studios · FERMER LA BOUCLE DU COMMENTAIRE (suite du lot 10 V5 et de
 * « du commentaire à l'itération »).
 *
 * Pur · ni base, ni réseau, ni modèle, ni horloge. Une itération née d'un
 * commentaire (« Itérer depuis ce commentaire » · provenance
 * `source_ref_json.commentaire`, posée par le serveur après relecture,
 * `provenanceCommentaireAdmise`) dit son RÉSULTAT sur le commentaire d'origine,
 * une fois son lot conclu · « Itération confirmée », « infirmée » ou « sans
 * conclusion », le chiffre clé et le lien vers le lot.
 *
 * Le statut est CALCULÉ à chaque affichage par la règle des hypothèses
 * (`resultatHypothese` sur la conclusion du lot, `conclusionLot` · la même
 * lecture que la carte de l'hypothèse, les mêmes seuils) · jamais écrit, jamais
 * recopié sur le commentaire. Tant que le lot n'est pas conclu (ou que
 * l'itération n'est rangée dans aucun lot) · aucun résultat, l'écran dit « en
 * test ». Résultats fermé à la personne · rien (le commentaire ne révèle pas ce
 * que Résultats tait). La marque du projet n'est pas la marque active · le
 * résultat se dit, le lien vers le lot est fermé avec sa raison (la fiche d'un
 * lot se lit dans la marque active).
 */

export const RAISON_LOT_AUTRE_MARQUE = 'Le lot se lit dans sa marque · ouvre la marque du projet pour le voir.';
export const PHRASE_ITERATION_EN_TEST = 'son résultat se lira ici quand son lot sera conclu';

export const LIBELLE_RESULTAT_COMMENTAIRE: Record<StatutResultatHypothese, string> = {
  confirmee: 'Itération confirmée', infirmee: 'Itération infirmée', sans_conclusion: 'Itération sans conclusion',
};

/** Une itération du commentaire, lue dans la marque du projet · son lot et la conclusion de ce lot. */
export interface IterationDuCommentaire {
  adId: string;
  /** Le code de variante de l'itération (« V7 »). */
  variante: string;
  lot: { id: string; numero: number; etat: EtatLotSpatial } | null;
  conclusion: LectureConclusion | null;
}

export type ResultatCommentaire =
  | {
    etat: 'conclue'; adId: string; variante: string; statut: StatutResultatHypothese; libelle: string;
    classe: '' | 'g' | 'r'; icone: 'check' | 'x' | 'q'; chiffre: string;
    lot: { numero: number; href: string | null; raison: string | null };
  }
  | { etat: 'en_test'; adId: string; variante: string; libelle: string; phrase: string };

/** Les itérations nées de CE commentaire de CE projet · la provenance relue, rien d'autre ne compte. */
export function iterationsDuCommentaire<T extends { commentaire: ProvenanceCommentaire | null | undefined }>(ads: readonly T[], o: { commentaireId: string; projetId: string }): T[] {
  const c = o.commentaireId.toLowerCase(); const p = o.projetId.toLowerCase();
  return ads.filter((a) => !!a.commentaire && a.commentaire.commentaireId.toLowerCase() === c && a.commentaire.projetId.toLowerCase() === p);
}

/**
 * Ce que le commentaire dit de ses itérations · une ligne par itération, dans
 * l'ordre des codes de variante · `[]` sans itération, ou Résultats fermé.
 */
export function resultatsCommentaire(iterations: readonly IterationDuCommentaire[], o: { resultats: boolean; marqueActive: boolean }): ResultatCommentaire[] {
  if (!o.resultats) return [];
  return [...iterations]
    .sort((a, b) => a.variante.localeCompare(b.variante, 'fr', { numeric: true }) || a.adId.localeCompare(b.adId))
    .map((it): ResultatCommentaire => {
      const r = resultatHypothese(it.lot, it.conclusion);
      if (!r) return { etat: 'en_test', adId: it.adId, variante: it.variante, libelle: 'Itération en test', phrase: PHRASE_ITERATION_EN_TEST };
      return {
        etat: 'conclue', adId: it.adId, variante: it.variante, statut: r.statut, libelle: LIBELLE_RESULTAT_COMMENTAIRE[r.statut],
        classe: r.classe, icone: r.icone, chiffre: r.chiffre,
        lot: { numero: r.lot.numero, href: o.marqueActive ? r.lot.href : null, raison: o.marqueActive ? null : RAISON_LOT_AUTRE_MARQUE },
      };
    });
}
