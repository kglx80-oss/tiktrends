import { describe, it, expect } from 'vitest';
import {
  entreesMarque, ancresDeclarees, railEntreeActive, accesAssets, placerAssets,
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

describe('H4 · Assets est DÉPLACÉ de « Créer » vers « Marque » (recette #710)', () => {
  type It = { key: string; href: string; isSub: boolean; locked: boolean };
  const creer = (assetsLocked = false): { group: string; items: It[] }[] => [
    { group: 'Observer', items: [{ key: 'veille', href: '/veille', isSub: false, locked: false }] },
    { group: 'Créer', items: [
      { key: 'jarvis', href: '/jarvis', isSub: false, locked: false },
      { key: 'assets', href: '/assets', isSub: false, locked: assetsLocked },
    ] },
  ];
  const marque = { group: 'Marque', items: entreesMarque(BID).map((it) => ({ key: it.key, href: it.href, isSub: it.isSub, locked: it.locked })) };
  const tous = (gs: { items: It[] }[]) => gs.flatMap((g) => g.items);

  it('avec un groupe Marque · UNE seule entrée /assets, dans Marque, plus dans Créer', () => {
    const out = placerAssets(creer(), marque);
    expect(tous(out).filter((it) => it.href === '/assets').length, 'Assets est dupliqué ou perdu').toBe(1);
    expect(out.find((g) => g.group === 'Créer')!.items.some((it) => it.href === '/assets'), 'Assets est resté dans Créer').toBe(false);
    const m = out.find((g) => g.group === 'Marque')!;
    expect(m.items.some((it) => it.href === '/assets'), 'Assets n’a pas rejoint Marque').toBe(true);
  });

  it('Assets est une TÊTE de branche · visible même quand « Aperçu » est replié', () => {
    const m = placerAssets(creer(), marque).find((g) => g.group === 'Marque')!;
    const a = m.items.find((it) => it.href === '/assets')!;
    expect(a.isSub, 'Assets est rangé sous Aperçu · replier Aperçu le cacherait').toBe(false);
    expect(m.items.at(-1)?.href, 'Assets doit venir APRÈS la branche Aperçu, pas s’y glisser').toBe('/assets');
  });

  it('garde la route, la clé et le verrou d’origine (droits inchangés)', () => {
    const a = tous(placerAssets(creer(true), marque)).find((it) => it.href === '/assets')!;
    expect(a.key).toBe('assets');
    expect(a.locked, 'le déplacement a levé le verrou de l’entrée Assets').toBe(true);
  });

  it('sans groupe Marque (aucune marque active) · Assets reste dans Créer, jamais masqué', () => {
    const avant = creer();
    const out = placerAssets(avant, null);
    expect(out, 'sans marque active, le rail a été modifié').toEqual(avant);
    expect(out.find((g) => g.group === 'Créer')!.items.some((it) => it.href === '/assets')).toBe(true);
  });

  it('un groupe vidé par le déplacement disparaît (pas de titre orphelin)', () => {
    const seul = [{ group: 'Créer', items: [{ key: 'assets', href: '/assets', isSub: false, locked: false }] }];
    const out = placerAssets(seul, marque);
    expect(out.some((g) => g.group === 'Créer'), 'le titre « Créer » reste sans entrée').toBe(false);
  });

  it('une seule entrée active sur /assets (celle de Marque)', () => {
    const out = placerAssets(creer(), marque);
    const ancres = ancresDeclarees(tous(out).map((it) => it.href));
    const actives = tous(out).filter((it) => railEntreeActive(it.href, { pathname: '/assets', tab: 'overview', hash: '', ancres }));
    expect(actives.map((it) => it.key)).toEqual(['assets']);
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
