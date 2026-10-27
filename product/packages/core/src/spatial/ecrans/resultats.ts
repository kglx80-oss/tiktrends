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
 */
export const ECRANS_RESULTATS: readonly EcranSpatial[] = [
  { chemin: '/adsmap', section: 'resultats' },
  { chemin: '/adsmap/boucle', section: 'resultats' },
  { chemin: '/adsmap/hypotheses', section: 'resultats' },
  { chemin: '/adsmap/lots', section: 'resultats' },
  { chemin: '/adsmap/lots/[id]', section: 'resultats' },
  { chemin: '/adsmap/protocole', section: 'resultats' },
  { chemin: '/adsmap/import', section: 'resultats' },
  { chemin: '/adsmap/apprentissages', section: 'resultats' },
  { chemin: '/adsmap/tests', section: 'resultats' },
  { chemin: '/adsmap/tests/[id]', section: 'resultats' },
  { chemin: '/adsmap/decisions', section: 'resultats' },
  { chemin: '/adsmap/carte', section: 'resultats' },
  { chemin: '/adsmap/partage', section: 'resultats' },
  { chemin: '/adsmap/suites', section: 'resultats' },
  { chemin: '/adsmap/tri', section: 'resultats' },
  { chemin: '/adsmap/radar', section: 'resultats' },
  { chemin: '/adsmap/essais', section: 'resultats' },
  { chemin: '/adsmap/jarvis', section: 'resultats' },
];
