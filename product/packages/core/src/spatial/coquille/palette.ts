import { cheminPorte } from '../bascule';

/**
 * Spatial · la palette ⌘K et le panneau « Tous les modules » de la coquille
 * (maquette : `PAL`, `palFill`, `openSheet("more")` · fragments
 * `_palette.html`, `_feuille-modules.html`). Pur.
 *
 * Mêmes groupes que la maquette (Pages, Projets, Actions), mais chaque entrée
 * mène à une VRAIE page, ouverte à la personne :
 *  · une entrée n'apparaît que si sa destination est ouverte par les règles
 *    d'accès (`ouverts`, rôle et formule compris · comme le rail) ;
 *  · une adresse que l'ancienne interface ne sert pas (Hypothèses,
 *    Apprentissages, Boucle, Nouvelle itération) n'apparaît que lorsqu'elle est
 *    PORTÉE dans Spatial (`cheminPorte`) · jamais de lien vers une page absente ;
 *  · les projets sont les vrais projets récents de la marque active ;
 *  · « Conclure le lot #1 » (exemple de la maquette) n'a pas de source simple
 *    et sûre ici · l'action n'est pas proposée.
 */

export type GroupePaletteCle = 'Pages' | 'Projets' | 'Actions';
export interface EntreePalette { cle: string; href: string; icone: string; titre: string }
export interface GroupePalette { titre: GroupePaletteCle; entrees: EntreePalette[] }

/** Les adresses servies par l'ancienne interface (une page existe sous `app/(app)`). */
const SERVIES_V5 = new Set(['/dashboard', '/studio/projets', '/studio/projets/nouveau', '/veille', '/veille/formats', '/adsmap', '/adsmap/lots', '/adsmap/import', '/assets', '/jarvis', '/connections', '/settings']);

/** Une destination existe-t-elle vraiment ? · page V5, ou écran porté dans Spatial. */
export function destinationExiste(href: string): boolean {
  const c = href.split(/[?#]/)[0] || '/';
  return SERVIES_V5.has(c) || /^\/brands\/[^/]+$/.test(c) || /^\/studio\/projets\/[^/]+$/.test(c) || cheminPorte(c);
}

export interface ContextePalette {
  ouverts: ReadonlySet<string>;
  marque: { id: string } | null;
  projets: ReadonlyArray<{ id: string; titre: string }>;
}

export function groupesPalette(c: ContextePalette): GroupePalette[] {
  const o = (h: string) => c.ouverts.has(h);
  const p = (cle: string, href: string, icone: string, titre: string, ouvert: boolean): EntreePalette | null =>
    ouvert && destinationExiste(href) ? { cle, href, icone, titre } : null;
  const pages = [
    p('accueil', '/dashboard', 'home', 'Accueil', true),
    p('studios', '/studio/projets', 'brush', 'Studios', o('/studio/projets')),
    p('veille', '/veille', 'eye', 'Veille', o('/veille')),
    p('resultats', '/adsmap', 'chart', 'Résultats', o('/adsmap')),
    p('boucle', '/adsmap/boucle', 'loop', 'Boucle d’itération', o('/adsmap')),
    p('lots', '/adsmap/lots', 'flask', 'Lots de test', o('/adsmap/lots')),
    p('hypotheses', '/adsmap/hypotheses', 'q', 'Hypothèses', o('/adsmap')),
    p('apprentissages', '/adsmap/apprentissages', 'bulb', 'Apprentissages', o('/adsmap')),
    p('bibliotheque', '/assets', 'folder', 'Bibliothèque', o('/assets')),
    p('jarvis', '/jarvis', 'chat', 'Jarvis', o('/jarvis')),
    c.marque ? p('marque', `/brands/${c.marque.id}`, 'tag', 'Fiche marque', o('/brands')) : null,
    p('connexions', '/connections', 'gear', 'Connexions', o('/connections')),
  ];
  const projets = o('/studio/projets')
    ? c.projets.map((x) => p(`projet-${x.id}`, `/studio/projets/${x.id}`, 'brush', x.titre, true))
    : [];
  const actions = [
    p('iterer', '/studio/iterer', 'loop', 'Nouvelle itération', o('/studio/projets')),
    p('nouveau', '/studio/projets/nouveau', 'plus', 'Nouveau projet', o('/studio/projets')),
    p('importer', '/adsmap/import', 'down', 'Importer des résultats', o('/adsmap/import')),
  ];
  const g = (titre: GroupePaletteCle, l: Array<EntreePalette | null>): GroupePalette => ({ titre, entrees: l.filter((x): x is EntreePalette => !!x) });
  return [g('Pages', pages), g('Projets', projets), g('Actions', actions)].filter((x) => x.entrees.length > 0);
}

/** Le petit libellé de droite (`small`) · vide pour une page, comme la maquette. */
export function typeEntreePalette(groupe: GroupePaletteCle): string {
  return groupe === 'Actions' ? 'Action' : groupe === 'Projets' ? 'Projet' : '';
}

const plat = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Le filtre de la saisie · insensible à la casse ET aux accents (« hypo » trouve « Hypothèses »). */
export function filtrerPalette(groupes: readonly GroupePalette[], requete: string): GroupePalette[] {
  const q = plat(requete.trim());
  if (!q) return [...groupes];
  return groupes.map((g) => ({ ...g, entrees: g.entrees.filter((e) => plat(e.titre).includes(q)) })).filter((g) => g.entrees.length > 0);
}

/** Flèches haut/bas · la sélection boucle (maquette : `(i ± 1 + n) % n`). */
export function selectionVoisine(i: number, n: number, sens: 1 | -1): number {
  if (n <= 0) return -1;
  return ((i < 0 ? (sens === 1 ? -1 : 0) : i) + sens + n) % n;
}

/**
 * « Tous les modules » (mobile · bouton `#morebtn`) · la liste de la maquette
 * (Veille & formats, Bibliothèque, Marque, Réglages), chacune selon l'accès.
 */
export function modulesMobiles(c: { ouverts: ReadonlySet<string>; marque: { id: string } | null }): EntreePalette[] {
  const o = (h: string) => c.ouverts.has(h);
  const l: Array<EntreePalette | false> = [
    o('/veille') && { cle: 'formats', href: '/veille/formats', icone: 'eye', titre: 'Veille & formats' },
    o('/assets') && { cle: 'bibliotheque', href: '/assets', icone: 'folder', titre: 'Bibliothèque' },
    !!c.marque && o('/brands') && { cle: 'marque', href: `/brands/${c.marque.id}`, icone: 'tag', titre: 'Marque' },
    o('/settings') && { cle: 'reglages', href: '/settings', icone: 'gear', titre: 'Réglages' },
  ];
  return l.filter((x): x is EntreePalette => !!x);
}
