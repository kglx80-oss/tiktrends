import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « studios ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) · un chemin absent n'a aucune page
 * (404) · l'ancienne interface est retirée. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 *
 * ORDRE · le premier motif qui correspond décide (`ecranSpatial`). Les segments
 * FIXES (`/studio/projets/nouveau`, `…/nouveau/concept`) passent AVANT les
 * motifs à segment dynamique (`/studio/projets/[id]`, `…/[id]/…`) · sinon
 * `nouveau` serait lu comme un identifiant de projet (et prendrait son statut).
 *
 * Toutes les pages V5 de la rubrique sont retirées. La dernière, la fiche
 * `/studio/projets/[id]`, l'est après le portage de son canvas métier LIBRE
 * (« Disposition libre », `?disposition=libre`, même stockage que la V5 ·
 * les couloirs de la maquette restent le défaut) et du retour vers la Veille.
 * Seule la route de fichier `/studio/projets/[id]/produit/fichier/[assetId]`
 * (téléchargement, pas une page) vit sous `app/studio/projets` (hors Spatial).
 * Vague 3 · l'assistant en cinq étapes (`/studio/projets/nouveau`) et le zoom
 * et les panneaux plein écran de l'éditeur (`/studio/projets/[id]/image`)
 * vivent dans Spatial · leurs pages V5 sont retirées.
 */
export const ECRANS_STUDIOS: readonly EcranSpatial[] = [
  // D1 · liste, création, itération.
  { chemin: '/studio/projets', section: 'studios' },
  { chemin: '/studio/prompts', section: 'studios' },
  { chemin: '/studio/projets/nouveau', section: 'studios' },
  { chemin: '/studio/projets/nouveau/concept', section: 'studios' },
  { chemin: '/studio/iterer', section: 'studios' },
  // D2 · projet, éditeur, vidéo.
  { chemin: '/studio/projets/[id]', section: 'studios' },
  { chemin: '/studio/projets/[id]/image', section: 'studios' },
  { chemin: '/studio/projets/[id]/video', section: 'studios' },
  // Vague 2 · les ateliers du projet (hors maquette, composés des classes de la maquette).
  { chemin: '/studio/projets/[id]/produit', section: 'studios' },
  { chemin: '/studio/projets/[id]/textes', section: 'studios' },
  { chemin: '/studio/projets/[id]/identites', section: 'studios' },
  { chemin: '/studio/projets/[id]/export', section: 'studios' },
];
