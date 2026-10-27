import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « resultats ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) quand `tt_ui=spatial` · un chemin
 * absent reste servi par l'ancienne interface. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 *
 * Vague 2 · les gestes de l'ancienne Adsmap sans écran de maquette ont chacun
 * leur écran (tous les tests et leur fiche, la file de décisions, la carte, le
 * partage client, les suites, le tri, le radar, les essais) · `/adsmap/jarvis`
 * redirige vers `/jarvis`, comme la page V5.
 *
 * Toute la rubrique est EXCLUSIVE · servie par Spatial même en mode V5 (`?ui=v5`) ·
 * les pages de l'ancienne interface (`app/(app)/adsmap`) sont retirées.
 */
export const ECRANS_RESULTATS: readonly EcranSpatial[] = [
  { chemin: '/adsmap', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/boucle', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/hypotheses', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/lots', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/lots/[id]', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/protocole', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/import', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/apprentissages', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/tests', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/tests/[id]', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/decisions', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/carte', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/partage', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/suites', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/tri', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/radar', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/essais', section: 'resultats', exclusif: true },
  { chemin: '/adsmap/jarvis', section: 'resultats', exclusif: true },
];
