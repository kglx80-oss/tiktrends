import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « studios ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) quand `tt_ui=spatial` · un chemin
 * absent reste servi par l'ancienne interface. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 *
 * ORDRE · le premier motif qui correspond décide (`ecranSpatial`). Les segments
 * FIXES (`/studio/projets/nouveau`, `…/nouveau/concept`) passent AVANT les
 * motifs à segment dynamique (`/studio/projets/[id]`, `…/[id]/…`) · sinon
 * `nouveau` serait lu comme un identifiant de projet (et prendrait son statut).
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
