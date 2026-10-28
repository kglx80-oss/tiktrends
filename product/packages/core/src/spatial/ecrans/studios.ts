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
 *
 * EXCLUSIF · la page V5 est retirée, Spatial sert l'écran même en mode V5.
 * Reste servie par la V5 en mode V5 :
 *  · `/studio/projets/[id]` · le canvas métier LIBRE (déplacer les cartes,
 *    disposition enregistrée ou réinitialisée) · décision du propriétaire
 *    attendue (les couloirs fixes de la maquette suffisent-ils ?). « Cibler
 *    Jarvis » depuis un nœud est porté dans les couloirs.
 * Vague 3 · l'assistant en cinq étapes (`/studio/projets/nouveau`) et le zoom
 * et les panneaux plein écran de l'éditeur (`/studio/projets/[id]/image`)
 * vivent dans Spatial · leurs pages V5 sont retirées.
 */
export const ECRANS_STUDIOS: readonly EcranSpatial[] = [
  // D1 · liste, création, itération.
  { chemin: '/studio/projets', section: 'studios', exclusif: true },
  { chemin: '/studio/prompts', section: 'studios', exclusif: true },
  { chemin: '/studio/projets/nouveau', section: 'studios', exclusif: true },
  { chemin: '/studio/projets/nouveau/concept', section: 'studios', exclusif: true },
  { chemin: '/studio/iterer', section: 'studios', exclusif: true },
  // D2 · projet, éditeur, vidéo.
  { chemin: '/studio/projets/[id]', section: 'studios' },
  { chemin: '/studio/projets/[id]/image', section: 'studios', exclusif: true },
  { chemin: '/studio/projets/[id]/video', section: 'studios', exclusif: true },
  // Vague 2 · les ateliers du projet (hors maquette, composés des classes de la maquette).
  { chemin: '/studio/projets/[id]/produit', section: 'studios', exclusif: true },
  { chemin: '/studio/projets/[id]/textes', section: 'studios', exclusif: true },
  { chemin: '/studio/projets/[id]/identites', section: 'studios', exclusif: true },
  { chemin: '/studio/projets/[id]/export', section: 'studios', exclusif: true },
];
