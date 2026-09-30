/**
 * Le groupe « Marque » du rail · ses entrées, et « où je suis » quand plusieurs
 * pointent sur la même route.
 *
 * ── Ce que ce module règle ───────────────────────────────────────────────────
 *
 * Le groupe « Marque » expose les facettes de la marque ACTIVE. Depuis H3, la
 * fiche porte deux sections d'identité ANCRÉES · « Couleurs & typographie »
 * (`#couleurs`) et « Charte & kit » (`#charte`). On veut les atteindre du rail.
 *
 * Trois entrées visent alors la MÊME route et le MÊME onglet
 * (`/brands/<id>?tab=overview`), ne se distinguant que par l'ancre · Aperçu (nu),
 * Couleurs (`#couleurs`), Charte (`#charte`). L'ancienne règle d'état actif
 * ignorait l'ancre · elle aurait allumé « Aperçu » sur les trois, et jamais
 * Couleurs ni Charte. Deux libellés pour un même repère · le défaut qu'on refuse.
 *
 * ── La règle, pure et éprouvée ───────────────────────────────────────────────
 *
 * `railEntreeActive` départage à l'ANCRE quand la route et l'onglet coïncident ·
 * exactement une des trois s'allume. L'entrée SANS ancre (« Aperçu ») n'est
 * active que lorsque l'ancre courante ne désigne AUCUNE section déclarée du rail
 * (`ancres`) · une ancre étrangère (défilement libre) ne lui vole pas sa
 * sélection, une ancre de section la cède à sa sœur. Aucune valeur codée en dur ·
 * l'ensemble des ancres qui départagent est celui que le rail déclare lui-même.
 *
 * Ce module ne rend rien · il DÉCIDE. La coquille lit `entreesMarque` et
 * `railEntreeActive`, et des tests les vérifient au RÉSULTAT (les hrefs, quelle
 * entrée s'allume), pas en constatant un appel.
 */

/** Une entrée de rail · même forme que `NavItem` côté coquille. */
export interface EntreeRailMarque {
  key: string;
  label: string;
  href: string;
  icon: string;
  locked: boolean;
  isSub: boolean;
}

/**
 * Les entrées du groupe « Marque », toutes portées sur la marque ACTIVE (`bid`).
 *
 * Aperçu porte ses facettes d'onglet et d'ancre en sous-entrées. PAS d'entrée
 * « Assets » ici · le rail principal (groupe Atelier) en porte déjà une vers la
 * MÊME route `/assets`, cadrée sur la MÊME marque active · un doublon faisait
 * deux libellés identiques vers un seul repère, allumés ensemble sur `/assets`
 * (recette H4). L'accès aux assets depuis la fiche d'une marque suit
 * `accesAssets`, à portée explicite.
 */
export function entreesMarque(bid: string): EntreeRailMarque[] {
  const base = `/brands/${bid}`;
  return [
    { key: 'm-home',   label: 'Aperçu',      href: `${base}?tab=overview`,          icon: 'store',   locked: false, isSub: false },
    // Les deux facettes d'identité (H3) · même onglet « overview », ancres DISTINCTES.
    { key: 'm-coul',   label: 'Couleurs',    href: `${base}?tab=overview#couleurs`, icon: 'palette', locked: false, isSub: true },
    { key: 'm-chart',  label: 'Charte',      href: `${base}?tab=overview#charte`,   icon: 'layers',  locked: false, isSub: true },
    { key: 'm-aud',    label: 'Audience',    href: `${base}?tab=audience`,          icon: 'users',   locked: false, isSub: true },
    { key: 'm-prod',   label: 'Produits',    href: `${base}?tab=products`,          icon: 'store',   locked: false, isSub: true },
    { key: 'm-comp',   label: 'Concurrents', href: `${base}?tab=competitors`,       icon: 'trend',   locked: false, isSub: true },
  ];
}

/** Les ancres (`#…`) déclarées par un ensemble d'entrées · celles qui départagent. */
export function ancresDeclarees(hrefs: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const href of hrefs) {
    const ancre = href.split('#')[1];
    if (ancre) out.add(`#${ancre}`);
  }
  return out;
}

export interface ContexteRail {
  /** Chemin courant, sans requête ni ancre (ce que rend `usePathname`). */
  pathname: string;
  /** Onglet courant (`?tab=`), « overview » par défaut. */
  tab: string;
  /** Ancre courante · '' ou '#xxx' (lue de `window.location.hash`). */
  hash: string;
  /** Ancres que le rail déclare · une ancre hors de cet ensemble ne départage pas. */
  ancres: Set<string>;
}

/**
 * « Je suis ICI » · exact, et une seule entrée à la fois, ancre comprise.
 *
 * Sans requête dans l'href · l'ancienne règle tient (égalité de chemin). Avec
 * une requête · la route ET l'onglet doivent coïncider, puis l'ANCRE départage ·
 * l'href sans ancre gagne quand l'ancre courante n'est pas une section déclarée.
 */
export function railEntreeActive(href: string, ctx: ContexteRail): boolean {
  const [avantHash, ancre] = href.split('#');
  const [path, query] = avantHash!.split('?');
  if (query) {
    const tab = new URLSearchParams(query).get('tab') || 'overview';
    if (ctx.pathname !== path || ctx.tab !== tab) return false;
    const cible = ancre ? `#${ancre}` : '';
    // Une ancre étrangère (défilement libre) ne compte pas · seule une section
    // DÉCLARÉE cède la sélection de l'entrée nue à sa sœur.
    const courant = ctx.ancres.has(ctx.hash) ? ctx.hash : '';
    return cible === courant;
  }
  return ctx.pathname === path;
}

/**
 * L'accès aux assets depuis la FICHE d'une marque · à portée EXPLICITE.
 *
 * `/assets` (la bibliothèque) se cadre sur la marque ACTIVE · `listAssets` ne
 * prend pas de marque en paramètre, et sans marque active il rend TOUT l'espace.
 * Un lien « Assets » posé sur la fiche d'une marque CONSULTÉE qui n'est pas
 * l'active montrerait donc les assets d'une AUTRE marque sous son nom. On ne le
 * pose que lorsque la marque consultée EST l'active · sinon on NOMME la marque
 * dont la bibliothèque dépend, sans lien, et sans changer l'active en silence.
 * Une vue par marque consultée demande une requête autorisée par marque · lot I.
 */
export type AccesAssets =
  | { kind: 'lien'; href: '/assets'; libelle: string; titre: string }
  | { kind: 'note'; texte: string }
  | { kind: 'aucun' };

export function accesAssets(consulteId: string, active: { id: string; name: string } | null): AccesAssets {
  // Sans marque active, /assets rend tout l'espace · jamais pour une marque donnée.
  if (!active) return { kind: 'aucun' };
  if (active.id === consulteId) {
    return { kind: 'lien', href: '/assets', libelle: 'Assets de la marque', titre: `Bibliothèque d'assets de ${active.name}` };
  }
  return { kind: 'note', texte: `Assets · bibliothèque de la marque active (${active.name})` };
}
