import { describe, it, expect } from 'vitest';
import { entreesMarque, ancresDeclarees, railEntreeActive, accesAssets } from '../src/index';

/**
 * H4 · le groupe « Marque » du rail · les deux facettes d'identité ancrées de H3
 * (Couleurs `#couleurs`, Charte `#charte`) + Assets, et un état actif ANCRE-
 * conscient · exactement une des trois entrées de même route s'allume par ancre.
 *
 * On vérifie le RÉSULTAT (les hrefs produits, quelle entrée s'allume), pas la
 * présence d'un appel.
 */

const BID = 'b1';
const OVERVIEW = `/brands/${BID}`;

describe('H4 · les entrées du groupe « Marque »', () => {
  const items = entreesMarque(BID);
  const parCle = new Map(items.map((it) => [it.key, it]));

  it('garde les quatre entrées existantes, inchangées', () => {
    expect(parCle.get('m-home')?.href, 'Aperçu doit viser l’onglet overview').toBe(`${OVERVIEW}?tab=overview`);
    expect(parCle.get('m-aud')?.href, 'Audience a changé de cible').toBe(`${OVERVIEW}?tab=audience`);
    expect(parCle.get('m-prod')?.href, 'Produits a changé de cible').toBe(`${OVERVIEW}?tab=products`);
    expect(parCle.get('m-comp')?.href, 'Concurrents a changé de cible').toBe(`${OVERVIEW}?tab=competitors`);
  });

  it('ajoute Couleurs et Charte, pointant les DEUX ancres DISTINCTES de H3', () => {
    const coul = parCle.get('m-coul');
    const chart = parCle.get('m-chart');
    expect(coul?.href, 'Couleurs ne pointe pas #couleurs').toBe(`${OVERVIEW}?tab=overview#couleurs`);
    expect(chart?.href, 'Charte ne pointe pas #charte').toBe(`${OVERVIEW}?tab=overview#charte`);
    expect(coul?.href, 'les deux facettes tombent sur la MÊME ancre').not.toBe(chart?.href);
    // Libellés courts qui reprennent les titres de section (« Couleurs & typo »,
    // « Charte & kit ») · pas de rail-libellé ≠ titre de destination.
    expect(coul?.label).toBe('Couleurs');
    expect(chart?.label).toBe('Charte');
  });

  it('ne DOUBLE pas « Assets » · le rail principal le porte déjà (même route, même marque active)', () => {
    // Recette H4 · un « Assets » dans le groupe Marque faisait deux libellés
    // identiques vers /assets, allumés ENSEMBLE · deux entrées actives à la fois.
    expect(items.some((it) => it.href === '/assets'), 'le groupe « Marque » redouble l’entrée Assets du rail principal').toBe(false);
  });

  it('n’a aucune clé en double · une entrée = une clé', () => {
    const cles = items.map((it) => it.key);
    expect(new Set(cles).size).toBe(cles.length);
  });
});

describe('H4 · l’état actif ancre-conscient · exactement une entrée par ancre', () => {
  const items = entreesMarque(BID);
  const ancres = ancresDeclarees(items.map((it) => it.href));
  const troisMemeRoute = ['m-home', 'm-coul', 'm-chart'];
  const href = (key: string) => items.find((it) => it.key === key)!.href;

  // Qui s'allume, parmi les trois entrées de même route+onglet, pour une ancre donnée.
  const actives = (hash: string): string[] =>
    troisMemeRoute.filter((key) =>
      railEntreeActive(href(key), { pathname: OVERVIEW, tab: 'overview', hash, ancres }),
    );

  it('ancre vide → SEUL « Aperçu » (l’entrée nue) est actif', () => {
    expect(actives('')).toEqual(['m-home']);
  });

  it('ancre #couleurs → SEUL « Couleurs » est actif (Aperçu cède)', () => {
    expect(actives('#couleurs')).toEqual(['m-coul']);
  });

  it('ancre #charte → SEUL « Charte » est actif', () => {
    expect(actives('#charte')).toEqual(['m-chart']);
  });

  it('une ancre ÉTRANGÈRE (défilement libre) laisse « Aperçu » actif, sans en allumer deux', () => {
    // #contact n'est pas une section déclarée · elle ne vole pas la sélection à
    // l'entrée nue, et n'allume ni Couleurs ni Charte.
    expect(actives('#contact')).toEqual(['m-home']);
  });

  it('sur un AUTRE onglet, aucune des trois n’est active · l’onglet prime avant l’ancre', () => {
    const surAudience = troisMemeRoute.filter((key) =>
      railEntreeActive(href(key), { pathname: OVERVIEW, tab: 'audience', hash: '', ancres }),
    );
    expect(surAudience).toEqual([]);
    // Et c'est bien « Audience » qui s'allume à sa place.
    expect(railEntreeActive(href('m-aud'), { pathname: OVERVIEW, tab: 'audience', hash: '', ancres })).toBe(true);
  });

  it('une route sans requête (ex. /assets du rail principal) s’allume sur sa page, pas sur la fiche', () => {
    expect(railEntreeActive('/assets', { pathname: '/assets', tab: 'overview', hash: '', ancres })).toBe(true);
    expect(railEntreeActive('/assets', { pathname: OVERVIEW, tab: 'overview', hash: '', ancres })).toBe(false);
  });
});

describe('H4 · l’accès aux assets depuis la fiche · portée EXPLICITE', () => {
  const KLO = { id: 'klo', name: 'Klôrea' };

  it('fiche de la marque ACTIVE → un lien vers /assets, nommé pour cette marque', () => {
    const a = accesAssets('klo', KLO);
    expect(a.kind, 'la marque consultée EST l’active · le lien doit être posé').toBe('lien');
    if (a.kind === 'lien') {
      expect(a.href).toBe('/assets');
      expect(a.titre, 'le lien ne dit pas de quelle marque est la bibliothèque').toContain('Klôrea');
    }
  });

  it('fiche d’une AUTRE marque que l’active → AUCUN lien (il montrerait les assets de l’active)', () => {
    const a = accesAssets('neva', KLO);
    expect(a.kind, 'un lien /assets sur la fiche de Neva montrerait les assets de Klôrea sous le nom de Neva').toBe('note');
    if (a.kind === 'note') expect(a.texte, 'la note ne nomme pas la marque dont dépend la bibliothèque').toContain('Klôrea');
  });

  it('sans marque active → rien (/assets rendrait TOUT l’espace, jamais une marque)', () => {
    expect(accesAssets('neva', null).kind).toBe('aucun');
  });
});
