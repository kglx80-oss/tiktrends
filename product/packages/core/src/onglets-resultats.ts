/**
 * V5 · Résultats · la barre d'onglets de section du module Adsmap.
 *
 * Pur · aucune base, aucun réseau. Comme `onglets-reglages`, ce module ne
 * PROTÈGE rien : chaque page garde son propre contrôle d'accès (redirection ou
 * écran de refus). Il décide seulement quels onglets PROPOSER, à partir de
 * l'ensemble des clés de fonction (`FEATURES`) que le serveur a déjà jugées
 * accessibles au rôle et à la formule courants, lues telles quelles.
 *
 * La règle tient en une phrase · un onglet n'apparaît que si la fonction de sa
 * page est accessible. On ne propose jamais un onglet qui mènerait à un écran
 * de refus (les sous-routes `lots` et `import` sont réservées aux admins · un
 * membre ne les voit pas, exactement comme dans le rail).
 *
 * ── Les libellés ─────────────────────────────────────────────────────────────
 *
 * Les libellés suivent la maquette V5 de Kevin (« Vue d'ensemble · Hypothèses ·
 * Lots de test · Protocole · Importer · Apprentissages »). Les routes, elles,
 * restent les routes RÉELLES du module · c'est la correspondance posée par
 * l'inventaire V5 (#hypotheses → /adsmap/tri, #learning → /adsmap/suites). Le
 * `Radar de veille` de la maquette n'y figure pas · il reste dans le rail.
 */

import { cleCourante, type OngletPage } from './onglets-reglages';

/** Une entrée du barreau · libellé V5, route réelle, et la fonction qui l'ouvre. */
interface EntreeResultats {
  cle: string;
  libelle: string;
  href: string;
  /** La clé `FEATURES` dont l'accès conditionne l'onglet. */
  fonction: string;
}

/**
 * Les six onglets de la maquette, dans l'ordre. `fonction` est la clé réelle de
 * `FEATURES` (rbac) · l'onglet n'est proposé que si le serveur l'a jugée
 * accessible. « Vue d'ensemble » partage la fonction `adsmap` de la page qui
 * porte la barre · elle est donc toujours là quand la barre l'est.
 */
export const ONGLETS_RESULTATS: readonly EntreeResultats[] = [
  { cle: 'vue-ensemble', libelle: "Vue d'ensemble", href: '/adsmap', fonction: 'adsmap' },
  { cle: 'hypotheses', libelle: 'Hypothèses', href: '/adsmap/tri', fonction: 'tri' },
  { cle: 'lots', libelle: 'Lots de test', href: '/adsmap/lots', fonction: 'lots' },
  { cle: 'protocole', libelle: 'Protocole', href: '/adsmap/protocole', fonction: 'protocole' },
  { cle: 'import', libelle: 'Importer', href: '/adsmap/import', fonction: 'import' },
  { cle: 'apprentissages', libelle: 'Apprentissages', href: '/adsmap/suites', fonction: 'suites' },
] as const;

/**
 * Les onglets à afficher, filtrés par les fonctions accessibles et marqués de
 * l'onglet courant (`aria-current`). L'entrée la plus précise qui contient le
 * chemin gagne (`cleCourante`) · `/adsmap/lots` allume « Lots de test », pas
 * « Vue d'ensemble » (`/adsmap`).
 */
export function ongletsResultats(accessibles: ReadonlySet<string>, chemin: string): OngletPage[] {
  const visibles = ONGLETS_RESULTATS.filter((o) => accessibles.has(o.fonction));
  const courante = cleCourante(visibles, chemin);
  return visibles.map((o) => ({ cle: o.cle, libelle: o.libelle, href: o.href, courant: o.cle === courante }));
}
