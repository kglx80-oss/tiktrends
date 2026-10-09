/**
 * Studios · L8-C · le TABLEAU MESURÉ des chemins chauds, les CIBLES, et les
 * budgets des gardes de temps (UX-06, cahier §13).
 *
 * Pur, des données. Doctrine « mesurer les seuils » : rien ici n'est posé
 * d'instinct. Les cibles viennent du cahier (§13), les mesures de
 * `test/l8c-mesure.test.ts` (noyau) et `apps/web/test/l8c-mesure-web.test.ts`
 * (serveur, pglite, sharp), relancées à la main (`L8C_MESURE=1`). Les budgets
 * des gardes en CI sont DÉRIVÉS des mesures (p95 × `MARGE_GARDE`), jamais
 * écrits à la main.
 */

export type EchelleMesure = 'petit' | 'grand';
export interface MesureChemin { medianeMs: number; p95Ms: number }

/** Conditions de la mesure de référence · la charge est notée, une mesure sous charge est refaite. */
export const MESURE_REFERENCE = {
  date: '2026-10-09',
  machine: 'conteneur de développement partagé · Intel Xeon 2,10 GHz, 4 cœurs, node 22.22.2',
  tirages: 'noyau 30 par chemin et par échelle (3 à blanc) ; serveur 20 (2 à blanc)',
  /**
   * Temps CPU du processus (`process.cpuUsage`), pas le temps mur : la machine
   * était partagée avec quatre autres agents (charge 25 à 46 sur 4 cœurs,
   * notée avant et après chaque série), le temps mur y mesurait surtout la
   * file d'attente. Le temps CPU d'un calcul synchrone sur un fil est le
   * temps mur d'une machine non chargée ; pour le rendu (fils libvips), il le
   * MAJORE. Les deux sont dans les relevés.
   */
  unite: 'temps CPU, millisecondes',
  charges: {
    noyauAvant: '46,0 → 31,0', noyauApres: '25,5 → 25,5', serveurAvant: '32,2 → 32,4', serveurApres: '32,3 → 31,6',
  },
  /**
   * Contre-mesure, même jour 11 h 11 à 11 h 30, charge 2,3 → 18,7 (machine
   * relancée, moins d'agents) : mêmes ordres de grandeur en temps CPU, ce qui
   * valide le choix de l'unité. Réaction de l'éditeur à 1000 calques 108,3 ms
   * p95 (tableau : 107,9), aperçu d'un geste de montage 83,2 (100,5), lecture
   * de l'écran vidéo 163 ms (118,7 ; avant : 11,3 s), enregistrement 94 ms
   * (108,7), rendu 6,5 s (6,0 ; avant : 8,5 s). Le tableau garde la première
   * série, celle sur laquelle les quatre portes sont passées.
   */
  contreMesure: '2026-10-09 11:11 · charge 2,3 → 18,7 · aucune p95 au-delà du budget de sa garde, aucun chemin hors cible',
} as const;

/** Sources des cibles · cahier 01 §13 (« Performance et exploitation »). */
export const SOURCES_CIBLES = {
  feedback: 'cahier §13 · feedback commande < 300 ms',
  edition: 'cahier §13 · édition visuelle ≥ 30 i/s (33 ms par image) à l’échelle typique',
  sauvegarde: 'cahier §13 · sauvegarde acquittée p95 < 2 s',
  ouverture: 'cahier §13 · ouverture projet typique < 2 s, tenue aussi à l’échelle de stress (« navigable »)',
  rendu: 'proposée L8-C · le cahier ne chiffre pas le rendu ; aperçu typique < 2 s comme une ouverture, stress < 10 s (action serveur, l’écran reste navigable)',
} as const;
export type SourceCible = keyof typeof SOURCES_CIBLES;

export interface DefinitionChemin { libelle: string; ou: 'noyau' | 'serveur'; cible: Record<EchelleMesure, number>; source: SourceCible }

const FEEDBACK = { petit: 300, grand: 300 };
const SAUVEGARDE = { petit: 2000, grand: 2000 };

export const CHEMINS_MESURES = {
  valider_contenu: { libelle: 'Validation du contenu', ou: 'noyau', cible: SAUVEGARDE, source: 'sauvegarde' },
  empreinte_contenu: { libelle: 'Empreinte SHA-256 canonique', ou: 'noyau', cible: SAUVEGARDE, source: 'sauvegarde' },
  patch_texte: { libelle: 'Patch · un texte', ou: 'noyau', cible: SAUVEGARDE, source: 'sauvegarde' },
  patch_lourd: { libelle: 'Patch · 100 changements', ou: 'noyau', cible: SAUVEGARDE, source: 'sauvegarde' },
  enregistrement_noyau: { libelle: 'Enregistrement · part pure', ou: 'noyau', cible: SAUVEGARDE, source: 'sauvegarde' },
  impact_texte: { libelle: 'Impact d’un texte corrigé', ou: 'noyau', cible: FEEDBACK, source: 'feedback' },
  impact_video_ordre: { libelle: 'Impact vidéo d’un ordre inversé', ou: 'noyau', cible: FEEDBACK, source: 'feedback' },
  timeline: { libelle: 'Timeline recalée', ou: 'noyau', cible: FEEDBACK, source: 'feedback' },
  operation_ordre: { libelle: 'Geste de montage · ordre', ou: 'noyau', cible: FEEDBACK, source: 'feedback' },
  operation_narration: { libelle: 'Geste de montage · narration', ou: 'noyau', cible: FEEDBACK, source: 'feedback' },
  calque_ajout: { libelle: 'Geste calque · ajouter un texte', ou: 'noyau', cible: FEEDBACK, source: 'feedback' },
  calque_deplacement: { libelle: 'Geste calque · déplacer', ou: 'noyau', cible: { petit: 33, grand: 300 }, source: 'edition' },
  geste_editeur: { libelle: 'Réaction de l’éditeur à un déplacement', ou: 'noyau', cible: { petit: 33, grand: 300 }, source: 'edition' },
  geste_video: { libelle: 'Aperçu d’un geste de montage', ou: 'noyau', cible: FEEDBACK, source: 'feedback' },
  preflight_image: { libelle: 'Préflight d’export image', ou: 'noyau', cible: FEEDBACK, source: 'feedback' },
  preflight_video: { libelle: 'Préflight d’export vidéo', ou: 'noyau', cible: FEEDBACK, source: 'feedback' },
  plan_rendu: { libelle: 'Plan de rendu du document', ou: 'noyau', cible: FEEDBACK, source: 'feedback' },
  lecture_editeur: { libelle: 'Ouverture de l’éditeur (lecture + vue sérialisée)', ou: 'serveur', cible: { petit: 2000, grand: 2000 }, source: 'ouverture' },
  lecture_video: { libelle: 'Ouverture de l’écran vidéo (lecture + vue sérialisée)', ou: 'serveur', cible: { petit: 2000, grand: 2000 }, source: 'ouverture' },
  enregistrement: { libelle: 'Enregistrement d’une version (transaction pglite)', ou: 'serveur', cible: SAUVEGARDE, source: 'sauvegarde' },
  rendu_document: { libelle: 'Rendu serveur du document (sharp)', ou: 'serveur', cible: { petit: 2000, grand: 10_000 }, source: 'rendu' },
} as const satisfies Record<string, DefinitionChemin>;
export type IdChemin = keyof typeof CHEMINS_MESURES;

/**
 * Le tableau mesuré · médiane et p95 en millisecondes, APRÈS optimisation.
 * `AVANT_OPTIMISATION` garde ce que la mesure a désigné comme hors cible.
 */
export const MESURES: Readonly<Record<IdChemin, Record<EchelleMesure, MesureChemin>>> = {
  valider_contenu: { petit: { medianeMs: 0.86, p95Ms: 5.06 }, grand: { medianeMs: 6.54, p95Ms: 12.95 } },
  empreinte_contenu: { petit: { medianeMs: 1.68, p95Ms: 5.08 }, grand: { medianeMs: 12.46, p95Ms: 18.14 } },
  patch_texte: { petit: { medianeMs: 1.87, p95Ms: 4.8 }, grand: { medianeMs: 15.66, p95Ms: 20.43 } },
  patch_lourd: { petit: { medianeMs: 2.85, p95Ms: 6.96 }, grand: { medianeMs: 17.04, p95Ms: 28.66 } },
  enregistrement_noyau: { petit: { medianeMs: 3.62, p95Ms: 8.01 }, grand: { medianeMs: 37.18, p95Ms: 55.94 } },
  impact_texte: { petit: { medianeMs: 4.89, p95Ms: 8.02 }, grand: { medianeMs: 77.02, p95Ms: 114.9 } },
  impact_video_ordre: { petit: { medianeMs: 5.88, p95Ms: 10.8 }, grand: { medianeMs: 61.08, p95Ms: 80.3 } },
  timeline: { petit: { medianeMs: 0.05, p95Ms: 0.1 }, grand: { medianeMs: 0.28, p95Ms: 0.42 } },
  operation_ordre: { petit: { medianeMs: 1.65, p95Ms: 2.58 }, grand: { medianeMs: 13.51, p95Ms: 19.81 } },
  operation_narration: { petit: { medianeMs: 1.36, p95Ms: 4.68 }, grand: { medianeMs: 13.12, p95Ms: 38.8 } },
  calque_ajout: { petit: { medianeMs: 1.47, p95Ms: 6.23 }, grand: { medianeMs: 11.35, p95Ms: 17.73 } },
  calque_deplacement: { petit: { medianeMs: 1.14, p95Ms: 1.57 }, grand: { medianeMs: 10.99, p95Ms: 17.6 } },
  geste_editeur: { petit: { medianeMs: 6.4, p95Ms: 17.24 }, grand: { medianeMs: 74.6, p95Ms: 107.9 } },
  geste_video: { petit: { medianeMs: 5.71, p95Ms: 13.39 }, grand: { medianeMs: 63.43, p95Ms: 100.51 } },
  preflight_image: { petit: { medianeMs: 2.03, p95Ms: 2.96 }, grand: { medianeMs: 22.9, p95Ms: 35.42 } },
  preflight_video: { petit: { medianeMs: 0.1, p95Ms: 0.18 }, grand: { medianeMs: 15.06, p95Ms: 37.19 } },
  plan_rendu: { petit: { medianeMs: 1.08, p95Ms: 5.33 }, grand: { medianeMs: 10.64, p95Ms: 21.22 } },
  lecture_editeur: { petit: { medianeMs: 10.52, p95Ms: 17.26 }, grand: { medianeMs: 18.12, p95Ms: 23.38 } },
  lecture_video: { petit: { medianeMs: 23.75, p95Ms: 37.03 }, grand: { medianeMs: 97.16, p95Ms: 118.69 } },
  enregistrement: { petit: { medianeMs: 19.28, p95Ms: 33.06 }, grand: { medianeMs: 90.57, p95Ms: 108.71 } },
  rendu_document: { petit: { medianeMs: 756.84, p95Ms: 875.73 }, grand: { medianeMs: 5614.5, p95Ms: 5987.34 } },
};
/**
 * Même mesure, même jeu, code de la base `f2b9fc4` (noyau) et lecture vidéo
 * et compositeur d'origine (serveur). Hors cible : la lecture de l'écran
 * vidéo à 200 plans (9,2 s médiane, cible 2 s). Au-dessus d'un tiers de leur
 * cible, donc visés aussi : impact d'une édition et réaction de l'éditeur à
 * 1000 calques (177 ms p95 pour 300).
 */
export const AVANT_OPTIMISATION: Readonly<Record<IdChemin, Record<EchelleMesure, MesureChemin>>> = {
  valider_contenu: { petit: { medianeMs: 0.84, p95Ms: 4.12 }, grand: { medianeMs: 6.39, p95Ms: 8.46 } },
  empreinte_contenu: { petit: { medianeMs: 1.83, p95Ms: 6.73 }, grand: { medianeMs: 17.5, p95Ms: 25.1 } },
  patch_texte: { petit: { medianeMs: 3.07, p95Ms: 4.41 }, grand: { medianeMs: 30.7, p95Ms: 34.12 } },
  patch_lourd: { petit: { medianeMs: 3.76, p95Ms: 7.44 }, grand: { medianeMs: 31.63, p95Ms: 59.34 } },
  enregistrement_noyau: { petit: { medianeMs: 5.69, p95Ms: 11.21 }, grand: { medianeMs: 58.6, p95Ms: 74.07 } },
  impact_texte: { petit: { medianeMs: 9.36, p95Ms: 15.41 }, grand: { medianeMs: 103.13, p95Ms: 141.97 } },
  impact_video_ordre: { petit: { medianeMs: 11.77, p95Ms: 20.57 }, grand: { medianeMs: 118.73, p95Ms: 151.79 } },
  timeline: { petit: { medianeMs: 0.03, p95Ms: 0.05 }, grand: { medianeMs: 0.28, p95Ms: 1.88 } },
  operation_ordre: { petit: { medianeMs: 1.39, p95Ms: 3.28 }, grand: { medianeMs: 13.78, p95Ms: 20.48 } },
  operation_narration: { petit: { medianeMs: 1.86, p95Ms: 8.27 }, grand: { medianeMs: 13.66, p95Ms: 18.83 } },
  calque_ajout: { petit: { medianeMs: 1.88, p95Ms: 5.03 }, grand: { medianeMs: 16.97, p95Ms: 17.85 } },
  calque_deplacement: { petit: { medianeMs: 1.87, p95Ms: 3.09 }, grand: { medianeMs: 18.04, p95Ms: 20.05 } },
  geste_editeur: { petit: { medianeMs: 12.67, p95Ms: 21.96 }, grand: { medianeMs: 131.34, p95Ms: 177.22 } },
  geste_video: { petit: { medianeMs: 13.98, p95Ms: 25.42 }, grand: { medianeMs: 134.71, p95Ms: 146.19 } },
  preflight_image: { petit: { medianeMs: 2.53, p95Ms: 3.76 }, grand: { medianeMs: 27.3, p95Ms: 33.02 } },
  preflight_video: { petit: { medianeMs: 0.08, p95Ms: 0.27 }, grand: { medianeMs: 8.59, p95Ms: 12.53 } },
  plan_rendu: { petit: { medianeMs: 0.93, p95Ms: 3.18 }, grand: { medianeMs: 7.63, p95Ms: 13.78 } },
  lecture_editeur: { petit: { medianeMs: 9.39, p95Ms: 19.63 }, grand: { medianeMs: 21.97, p95Ms: 26.43 } },
  lecture_video: { petit: { medianeMs: 89.61, p95Ms: 122.47 }, grand: { medianeMs: 9245.46, p95Ms: 9974.2 } },
  enregistrement: { petit: { medianeMs: 20.14, p95Ms: 35.39 }, grand: { medianeMs: 88.83, p95Ms: 132.21 } },
  rendu_document: { petit: { medianeMs: 862.19, p95Ms: 958.62 }, grand: { medianeMs: 6635.87, p95Ms: 7104.69 } },
};

/**
 * Marge des gardes de temps en CI · ×3 sur le p95 mesuré (consigne UX-06 :
 * « au moins ×3 pour ne pas être fragile »). Plancher de 25 ms : sous ce
 * seuil, le bruit d'ordonnancement d'une machine partagée dépasse le temps
 * mesuré lui-même (chemins sous la milliseconde).
 */
export const MARGE_GARDE = 3;
export const PLANCHER_GARDE_MS = 25;

/** Budget d'une garde de temps · dérivé de la mesure, arrondi à la milliseconde supérieure. */
export function budgetGarde(id: IdChemin, e: EchelleMesure): number {
  return Math.max(PLANCHER_GARDE_MS, Math.ceil(MESURES[id][e].p95Ms * MARGE_GARDE));
}

/** La mesure tient-elle la cible du cahier (p95 ≤ cible) ? */
export function cibleTenue(id: IdChemin, e: EchelleMesure): boolean {
  return MESURES[id][e].p95Ms <= CHEMINS_MESURES[id].cible[e];
}

/** Marge mesurée sur la cible · cible ÷ p95 (≥ 1 : tenue). */
export function margeSurCible(id: IdChemin, e: EchelleMesure): number {
  return Math.round((CHEMINS_MESURES[id].cible[e] / MESURES[id][e].p95Ms) * 10) / 10;
}
