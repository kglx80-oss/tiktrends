/**
 * L'accueil ne propose que ce que le rôle ouvre · lot 11.
 *
 * ── Le défaut que ce module ferme ────────────────────────────────────────────
 *
 * Un client en lecture (`client_viewer`) voyait sur l'accueil « Créer une
 * pub », la carte « Nouvelle marque », les quatre studios, Adsmap, la Veille…
 * Son rôle n'ouvre qu'Accueil, Analytics et Support · chaque clic menait à
 * « Accès réservé » ou le renvoyait en silence à l'accueil. Un membre voyait de
 * même « Nouvelle marque » et les fiches de marque, réservées aux admins.
 *
 * Les droits ne bougent pas · c'est l'affichage qui suit la matrice existante.
 * L'appelant fournit, pour chaque rubrique, si le RÔLE l'ouvre (`RegleChemin`).
 * Un verrou de FORMULE n'est pas un refus de rôle · la rubrique reste proposée,
 * sa page explique l'offre (on ne retire pas ce chemin à un client payant).
 *
 * Pur · ni base ni réseau.
 */

import { ROUTE_HISTORIQUE_ANALYTICS, RUBRIQUE_ANALYTICS } from './accueil-vue';

/** Une rubrique et si le rôle courant l'ouvre. */
export interface RegleChemin {
  href: string;
  ouvert: boolean;
  /** Ouverte au rôle mais verrouillée par la FORMULE · la page explique l'offre (lot 12). */
  verrou?: boolean;
}

/** Chemin et paramètres d'une adresse (ancre ignorée). */
function decoupe(href: string): { chemin: string; params: URLSearchParams } {
  const [avantAncre] = href.split('#');
  const [chemin, requete] = avantAncre!.split('?');
  return { chemin: chemin!, params: new URLSearchParams(requete ?? '') };
}

/**
 * La rubrique la plus précise qui couvre ce chemin (ancre ignorée), ou `null`.
 *
 * Lot 19A · une rubrique peut porter une requête (« Analytics » vit sur
 * `/dashboard?vue=analytics`, sous l'Accueil). Elle ne couvre alors que les
 * adresses qui portent les MÊMES paramètres · plus précise que la rubrique nue
 * du même chemin, elle l'emporte. L'ancienne route `/analytics` (307 vers la
 * vue) se lit comme sa cible · un lien historique garde les droits d'Analytics.
 */
export function regleDuChemin(href: string, regles: readonly RegleChemin[]): RegleChemin | null {
  const cible = decoupe(href.split(/[?#]/)[0] === ROUTE_HISTORIQUE_ANALYTICS ? RUBRIQUE_ANALYTICS : href);
  let meilleure: RegleChemin | null = null;
  for (const r of regles) {
    const regle = decoupe(r.href);
    if (cible.chemin !== regle.chemin && !cible.chemin.startsWith(`${regle.chemin}/`)) continue;
    if ([...regle.params].some(([k, v]) => cible.params.get(k) !== v)) continue;
    if (!meilleure || r.href.length > meilleure.href.length) meilleure = r;
  }
  return meilleure;
}

/**
 * Un chemin est-il ouvert ? La rubrique la plus précise gagne (`/studio/ads`
 * avant `/studio`, `/brands/new` relève de `/brands`). Un chemin qu'aucune
 * rubrique ne couvre reste ouvert · ce module ne protège rien, il n'invente
 * aucun refus.
 */
export function cheminOuvert(href: string, regles: readonly RegleChemin[]): boolean {
  return regleDuChemin(href, regles)?.ouvert ?? true;
}

/** Ouvert au rôle mais verrouillé par la formule (cadenas dans la palette). */
export function cheminVerrouille(href: string, regles: readonly RegleChemin[]): boolean {
  return !!regleDuChemin(href, regles)?.verrou;
}

/** Le bandeau à la une de l'accueil. */
export interface BandeauAccueil {
  titre: string;
  sous: string;
  ctaLabel: string;
  href: string;
  ctaSecLabel?: string;
  hrefSec?: string;
}

/** Quand ni l'analyse des tests ni la création ne sont ouvertes · la lecture des résultats. */
export const BANDEAU_LECTURE: BandeauAccueil = {
  titre: 'Suis les résultats de tes campagnes',
  sous: 'Ton accès est en lecture · les KPI agrégés de tes campagnes t’attendent dans Analytics.',
  ctaLabel: 'Voir Analytics',
  href: '/analytics',
};

/**
 * Le bandeau · copie orientée DÉCISION (analyse → itération), création en
 * secondaire. Un geste fermé au rôle disparaît ; si le geste primaire est
 * fermé, le secondaire ouvert prend sa place ; sinon, la lecture des résultats.
 */
export function bandeauAccueil(p: { aMarque: boolean; nbMarques: number; ouvert: (href: string) => boolean }): BandeauAccueil | null {
  const base: BandeauAccueil = p.aMarque
    ? {
        titre: 'Prépare ton prochain test',
        sous: 'Analyse tes résultats, choisis quoi tester ensuite, et itère vers ce qui marche.',
        ctaLabel: 'Voir mes tests',
        href: '/adsmap',
        ctaSecLabel: 'Créer une pub',
        hrefSec: '/studio/ads',
      }
    : {
        titre: 'Prépare ton prochain test',
        sous: 'Choisis une marque pour analyser tes tests et décider quoi lancer ensuite.',
        ctaLabel: p.nbMarques ? 'Choisir une marque' : 'Créer une marque',
        href: p.nbMarques ? '/brands' : '/brands/new',
        ctaSecLabel: 'Observer le marché',
        hrefSec: '/veille',
      };
  const secOuvert = !!base.hrefSec && p.ouvert(base.hrefSec);
  if (p.ouvert(base.href)) {
    if (secOuvert) return base;
    return { titre: base.titre, sous: base.sous, ctaLabel: base.ctaLabel, href: base.href };
  }
  if (secOuvert) return { titre: base.titre, sous: base.sous, ctaLabel: base.ctaSecLabel!, href: base.hrefSec! };
  return p.ouvert(BANDEAU_LECTURE.href) ? BANDEAU_LECTURE : null;
}

/** Les liens d'une liste que le rôle ouvre · l'ordre est conservé. */
export function liensOuverts<T extends { href: string }>(liens: readonly T[], ouvert: (href: string) => boolean): T[] {
  return liens.filter((l) => ouvert(l.href));
}

/** Les familles d'accès que l'accueil peut taire, et comment les nommer. */
const FAMILLES: ReadonlyArray<{ chemins: readonly string[]; libelle: string }> = [
  { chemins: ['/studio/ads', '/studio/image', '/studio/video', '/studio/textes'], libelle: 'la création (pubs, images, vidéos, textes)' },
  { chemins: ['/brands/new'], libelle: 'la gestion des marques' },
  { chemins: ['/adsmap', '/veille', '/radar', '/jarvis'], libelle: 'l’analyse des tests et du marché' },
];

/**
 * La phrase qui dit pourquoi des accès manquent à l'accueil · `null` si rien
 * n'est tu. Elle nomme ce que le rôle n'ouvre pas, sans promettre qui le
 * changera.
 */
export function noteAccesAccueil(ouvert: (href: string) => boolean): string | null {
  const fermees = FAMILLES.filter((f) => f.chemins.some((c) => !ouvert(c))).map((f) => f.libelle);
  if (!fermees.length) return null;
  const liste = fermees.length === 1 ? fermees[0] : `${fermees.slice(0, -1).join(', ')} ni ${fermees[fermees.length - 1]}`;
  return `Ton rôle dans cet espace ne comprend pas ${liste} · ces accès n’apparaissent donc pas ici.`;
}

/**
 * Les commandes d'une liste (palette ⌘K) que le rôle ouvre · lot 12. Une
 * commande fermée au rôle disparaît (elle menait à « Accès réservé » ou à un
 * renvoi silencieux vers l'accueil) ; une commande verrouillée par la formule
 * reste, avec son cadenas, comme l'entrée de navigation équivalente.
 */
export function commandesOuvertes<T extends { href?: string; locked?: boolean }>(cmds: readonly T[], regles: readonly RegleChemin[]): T[] {
  // Une commande sans lien (une action locale) n'est pas une rubrique · gardée.
  return cmds
    .filter((c) => !c.href || cheminOuvert(c.href, regles))
    .map((c) => (c.href && cheminVerrouille(c.href, regles) ? { ...c, locked: true } : c));
}
