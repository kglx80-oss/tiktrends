import { describe, it, expect } from 'vitest';
import {
  entreesMarque, ancresDeclarees, railEntreeActive, accesAssets,
  SECTIONS_IDENTITE, HAUTEUR_ENTETE_APP, HAUTEUR_BARRE_INDEX, MARGE_ANCRE_SECTION, SEUIL_SECTION_ACTIVE,
} from '../src/index';

/**
 * H4 · le groupe « Marque » du rail · les deux facettes d'identité ancrées de H3
 * (« Styles » `#couleurs`, « Brand kits » `#charte`, les mots de Kevin), l'entrée
 * Assets DÉPLACÉE depuis « Créer », et un état actif ANCRE-conscient · exactement
 * une des trois entrées de même route s'allume par ancre.
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

  it('ajoute Styles et Brand kits, pointant les DEUX ancres DISTINCTES de H3', () => {
    const coul = parCle.get('m-coul');
    const chart = parCle.get('m-chart');
    expect(coul?.href, 'Styles ne pointe pas #couleurs').toBe(`${OVERVIEW}?tab=overview#couleurs`);
    expect(chart?.href, 'Brand kits ne pointe pas #charte').toBe(`${OVERVIEW}?tab=overview#charte`);
    expect(coul?.href, 'les deux facettes tombent sur la MÊME ancre').not.toBe(chart?.href);
    // Les mots demandés par Kevin (recette #710) · « Styles », « Brand kits ».
    expect(coul?.label, 'le rail ne dit plus « Styles »').toBe('Styles');
    expect(chart?.label, 'le rail ne dit plus « Brand kits »').toBe('Brand kits');
  });

  it('le libellé du rail EST le titre de la section visée (une seule source)', () => {
    // Recette #710 · un libellé de rail qui ne se retrouve pas en arrivant laisse
    // deviner où l'on est. Rail, index et titre lisent SECTIONS_IDENTITE.
    for (const sec of SECTIONS_IDENTITE) {
      const entree = items.find((it) => it.href.endsWith(`#${sec.id}`));
      expect(entree?.label, `l’entrée du rail vers #${sec.id} ne reprend pas le titre « ${sec.libelle} »`).toBe(sec.libelle);
      expect(sec.sousTitre.length, `la section #${sec.id} n’explique pas ce qu’elle contient`).toBeGreaterThan(20);
    }
  });

  it('le groupe lui-même ne fabrique PAS d’entrée Assets · elle est DÉPLACÉE, pas dupliquée', () => {
    expect(items.some((it) => it.href === '/assets'), 'entreesMarque fabrique son propre Assets · il doublerait celui du rail').toBe(false);
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

describe('H4 · l’ancrage après saut · index entier sous l’en-tête (recette #710)', () => {
  it('la marge d’ancrage couvre l’en-tête ET la barre d’index collante', () => {
    expect(MARGE_ANCRE_SECTION, 'le titre de section retombe sous l’index ou l’en-tête').toBeGreaterThanOrEqual(HAUTEUR_ENTETE_APP + HAUTEUR_BARRE_INDEX);
  });

  it('la barre d’index tient une ligne de puces MESURÉE (36,8 px) avec ses marges', () => {
    expect(HAUTEUR_BARRE_INDEX, 'la barre d’index réservée est plus basse que les puces mesurées').toBeGreaterThanOrEqual(37);
  });

  it('un saut vers une section l’allume · seuil actif ≥ marge d’ancrage', () => {
    expect(SEUIL_SECTION_ACTIVE, 'après un saut, la section atteinte ne s’allumerait pas dans l’index').toBeGreaterThanOrEqual(MARGE_ANCRE_SECTION);
  });
});
