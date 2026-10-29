import { cheminPorte } from '../bascule';
import type { PreferenceTheme } from '../../themes';

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
 *    et sûre ici · l'action n'est pas proposée ;
 *  · un groupe « Apparence » (hors maquette, demande du propriétaire) · le
 *    thème sombre, clair ou auto, appliqué SUR PLACE (`theme`), sans quitter
 *    l'écran. Son adresse (clic du milieu) est la section « Apparence » des
 *    Réglages, ou de « Mon profil » pour qui n'a pas les Réglages.
 */

export type GroupePaletteCle = 'Pages' | 'Projets' | 'Actions' | 'Apparence';
export interface EntreePalette {
  cle: string; href: string; icone: string; titre: string;
  /** Une commande de thème · appliquée sur place au lieu de naviguer. */
  theme?: PreferenceTheme;
  /** Mots trouvés par la saisie en plus du titre (« mode nuit », « dark »…). */
  motsCles?: string;
}
export interface GroupePalette { titre: GroupePaletteCle; entrees: EntreePalette[] }

/**
 * Une destination existe-t-elle vraiment ? · un écran porté dans Spatial.
 * L'ancienne interface (et sa liste d'adresses V5) est retirée · seul Spatial
 * sert une page de l'application.
 */
export function destinationExiste(href: string): boolean {
  return cheminPorte(href);
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
  return [g('Pages', pages), g('Projets', projets), g('Actions', actions), g('Apparence', entreesTheme(o('/settings')))].filter((x) => x.entrees.length > 0);
}

/**
 * Les trois commandes de thème · ouvertes à toute session (une préférence
 * d'apparence n'a pas de droit). `reglages` · la personne a les Réglages
 * (`/settings`, admin) ; sinon l'adresse est « Mon profil ».
 */
export function entreesTheme(reglages: boolean): EntreePalette[] {
  const href = `${reglages ? '/settings' : '/profile'}#apparence`;
  const l: Array<[PreferenceTheme, string, string]> = [
    ['sombre', 'Thème sombre', 'apparence mode nuit dark'],
    ['clair', 'Thème clair', 'apparence mode jour light'],
    ['auto', 'Thème auto (système)', 'apparence mode automatique appareil systeme'],
  ];
  return l.filter(() => destinationExiste(href)).map(([theme, titre, motsCles]) => ({ cle: `theme-${theme}`, href, icone: 'spark', titre, theme, motsCles }));
}

/** Le petit libellé de droite (`small`) · vide pour une page, comme la maquette. */
export function typeEntreePalette(groupe: GroupePaletteCle): string {
  return groupe === 'Actions' ? 'Action' : groupe === 'Projets' ? 'Projet' : groupe === 'Apparence' ? 'Thème' : '';
}

const plat = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Le filtre de la saisie · insensible à la casse ET aux accents (« hypo »
 * trouve « Hypothèses »). Chaque mot de la saisie doit se trouver dans le titre
 * ou les mots-clés (« mode sombre » trouve « Thème sombre »).
 */
export function filtrerPalette(groupes: readonly GroupePalette[], requete: string): GroupePalette[] {
  const mots = plat(requete.trim()).split(/\s+/).filter(Boolean);
  if (!mots.length) return [...groupes];
  const trouve = (e: EntreePalette) => { const t = plat(`${e.titre} ${e.motsCles ?? ''}`); return mots.every((m) => t.includes(m)); };
  return groupes.map((g) => ({ ...g, entrees: g.entrees.filter(trouve) })).filter((g) => g.entrees.length > 0);
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
