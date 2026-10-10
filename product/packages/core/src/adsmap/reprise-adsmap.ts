/**
 * Lot 17 · trois ruptures de reprise et d'itération Adsmap, mesurées en local
 * (build `96a7d700`, fixtures synthétiques, 1280×720).
 *
 * | Parcours                                        | Mesuré avant                                                        |
 * | ----------------------------------------------- | ------------------------------------------------------------------- |
 * | Studio Image › « Suivre dans Adsmap »           | 3/3 en échec · id composite `génération:url` refusé (uuid) · message en infobulle seulement, focus sur <body> |
 * | Fiche d'une ad incomplète › « Préparer un test » | renvoie aux Lots, qui la disent « incomplète » (détail en infobulle) · boucle · offre et page ne se saisissent nulle part |
 * | Brief d'itération › onglet Image › Pubs IA      | `?iter` perdu · panneau disparu, saisie rangée sous la clé de l'itération devenue invisible |
 *
 * Frontières (documentées, NON modifiées ici) · rattacher la créa générée à son
 * test parent (filiation) exige d'écrire le parent dans la génération et une
 * arête d'itération · compléter une ad (hypothèse, variable, offre, page) exige
 * de nouvelles actions d'écriture et la gestion des offres et des pages ·
 * suivre chaque image d'un même lot exige un lien par image (modèle de données).
 */

import { checkAdReady, type AdShape } from './invariants';

// ── Identifiant de génération (Studio Image) ────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * L'identifiant de la GÉNÉRATION derrière une carte du Studio · la galerie Image
 * compose `génération:url` (une carte par image) · la passerelle Adsmap attend
 * la génération seule. `null` quand la carte n'a pas encore d'identifiant de
 * génération (repli `new-…` d'une image fraîche, `tmp-…` d'une vidéo en cours) ·
 * il n'y a alors rien à suivre.
 */
export function idGenerationSuivable(idCarte: string | null | undefined): string | null {
  const brut = (idCarte ?? '').trim();
  const i = brut.indexOf(':');
  const id = i === -1 ? brut : brut.slice(0, i);
  return UUID.test(id) ? id.toLowerCase() : null;
}

/**
 * Deuxième image d'une même génération · la passerelle suit une GÉNÉRATION
 * (une fiche), pas chaque image · elle renvoie la fiche existante. L'écran
 * disait « Ajoutée à la carte » (mesuré, lot 17) · on dit ce qui se passe.
 */
export const DEJA_SUIVIE = 'Déjà suivie · cette génération n’a qu’une fiche dans Adsmap, partagée par ses images.';

// ── Complétude d'une ad avant test ──────────────────────────────────────────

const LIBELLE_MANQUE: Record<string, string> = {
  'ad.hypothesis': 'l’hypothèse testée',
  'ad.tested_variable': 'la variable testée',
  'ad.offer': 'l’offre',
  'ad.landing_page': 'la page de destination',
};

/** Ce qui manque à une ad pour partir en test (même règle que la préparation d'un lot). */
export function manquesAvantTest(ad: Omit<AdShape, 'status'>): string[] {
  return checkAdReady({ ...ad, status: 'ready' }).map((v) => LIBELLE_MANQUE[v.rule] ?? v.message);
}

export function listeManques(manques: string[]): string {
  if (manques.length <= 1) return manques[0] ?? '';
  return `${manques.slice(0, -1).join(', ')} et ${manques[manques.length - 1]}`;
}

/**
 * Ces champs ne s'écrivent sur une ad existante par AUCUN écran (audit lot 17 ·
 * aucune action ne les met à jour, aucune offre ni page ne se crée dans l'outil).
 * On le dit, plutôt que de renvoyer vers les Lots qui renvoient vers la fiche.
 */
export const COMPLETUDE_HORS_OUTIL = 'Ces éléments ne se saisissent pas encore dans l’outil · tant qu’ils manquent, cette ad ne peut pas partir en test.';

export function texteAdIncomplete(manques: string[]): string {
  return `À compléter avant tout test · ${listeManques(manques)}. ${COMPLETUDE_HORS_OUTIL}`;
}

// ── Reprise du brief d'itération (Studio Pubs IA) ───────────────────────────

/** Mémoire de l'onglet · le brief d'itération ouvert en dernier, par marque. */
export const CLE_ITERATION_EN_COURS = 'tt_iteration_en_cours';

/** Ce que le brief dit de la créa produite · elle n'est pas rattachée au test source. */
export const FILIATION_NON_ENREGISTREE = 'La pub créée ici n’est pas rattachée à ce test dans Adsmap · sa fiche n’affichera pas « Vient de ».';
