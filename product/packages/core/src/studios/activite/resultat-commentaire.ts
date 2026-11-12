import type { ProvenanceCommentaire } from '../../spatial/resultats/boucle-preuve';
import { LIBELLE_RESULTAT_FIL, iterationsDuFil, resultatsFil, type IterationDuFil, type ResultatFil } from './resultat-fil';

/**
 * Studios · FERMER LA BOUCLE DU COMMENTAIRE (suite du lot 10 V5 et de
 * « du commentaire à l'itération »).
 *
 * La règle vit désormais UNE fois pour les deux fils (commentaire, note de la
 * lignée) · `resultat-fil.ts`. Ce module garde les noms du commentaire, qui
 * rendent EXACTEMENT les mêmes valeurs (test d'égalité sur une capture faite
 * avant la généralisation · `C/test/resultat-note.test.ts`).
 * `RAISON_LOT_AUTRE_MARQUE` et `PHRASE_ITERATION_EN_TEST` vivent dans
 * `resultat-fil.ts`, exportés tels quels.
 */

export const LIBELLE_RESULTAT_COMMENTAIRE = LIBELLE_RESULTAT_FIL;

/** Une itération du commentaire, lue dans la marque du projet · son lot et la conclusion de ce lot. */
export type IterationDuCommentaire = IterationDuFil;

export type ResultatCommentaire = ResultatFil;

/** Les itérations nées de CE commentaire de CE projet · la provenance relue, rien d'autre ne compte. */
export function iterationsDuCommentaire<T extends { commentaire: ProvenanceCommentaire | null | undefined }>(ads: readonly T[], o: { commentaireId: string; projetId: string }): T[] {
  return iterationsDuFil(ads, { fil: 'commentaire', id: o.commentaireId, projetId: o.projetId });
}

/**
 * Ce que le commentaire dit de ses itérations · une ligne par itération, dans
 * l'ordre des codes de variante · `[]` sans itération, ou Résultats fermé.
 */
export const resultatsCommentaire: (iterations: readonly IterationDuCommentaire[], o: { resultats: boolean; marqueActive: boolean }) => ResultatCommentaire[] = resultatsFil;
