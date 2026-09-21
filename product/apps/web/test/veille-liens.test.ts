import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bibliothequePub, libelleBibliotheque, refSourceVeille, siteMarque } from '@tiktrends/core';

/**
 * Depuis la Veille, on doit pouvoir SORTIR vers la source · la bibliothèque
 * publicitaire d'une marque (par plateforme) et son site. On teste les URL et
 * libellés produits, pas la présence d'un appel.
 */

describe('bibliothequePub · la bonne bibliothèque par plateforme, par nom', () => {
  it('Meta · Ad Library, recherche par nom', () => {
    const b = bibliothequePub({ platform: 'meta', name: 'HELL Ice Coffee' })!;
    expect(b.url).toContain('https://www.facebook.com/ads/library/');
    expect(b.url).toContain('q=HELL+Ice+Coffee');
    expect(b.url).toContain('search_type=keyword_unordered');
    expect(b.label).toBe('Bibliothèque Meta');
  });

  it('TikTok · Commercial Content Library, par nom d’annonceur', () => {
    const b = bibliothequePub({ platform: 'tiktok', name: 'Klorea' })!;
    expect(b.url).toContain('https://library.tiktok.com/ads');
    expect(b.url).toContain('adv_name=Klorea');
    expect(b.label).toBe('Bibliothèque TikTok');
  });

  it('Google · null · pas de recherche par nom fiable, on n’ouvre pas un lien mort', () => {
    expect(bibliothequePub({ platform: 'google', name: 'Klorea' })).toBeNull();
  });

  it('null sans nom · rien à chercher', () => {
    expect(bibliothequePub({ platform: 'meta', name: '' })).toBeNull();
    expect(bibliothequePub({ platform: 'tiktok', name: null })).toBeNull();
  });

  it('plateforme absente · on suppose Meta', () => {
    expect(bibliothequePub({ name: 'Klorea' })!.url).toContain('q=Klorea');
  });
});

// CDC v8 · F07 · le repli bibliothèque est une RECHERCHE, pas la créa exacte ·
// le libellé doit le dire, sinon on laisse croire qu'on rouvre l'annonce vue.
describe('libelleBibliotheque · le repli se nomme comme une recherche', () => {
  it('nomme la plateforme ET dit que c’est une recherche d’annonceur', () => {
    const l = libelleBibliotheque({ label: 'Bibliothèque Meta' })!;
    expect(l).toContain('Bibliothèque Meta');
    expect(l).toContain('rechercher l’annonceur');
  });

  it('null quand il n’y a pas de bibliothèque', () => {
    expect(libelleBibliotheque(null)).toBeNull();
  });
});

// CDC v8 · F07 · la PROVENANCE portée jusqu'au studio · une clé stable
// (plateforme:id) et le nom, ou rien si on ne saurait pas la retrouver.
describe('refSourceVeille · la référence structurée de la source', () => {
  it('clé plateforme:id et nom de l’annonceur', () => {
    expect(refSourceVeille({ platform: 'meta', id: '789', advertiserName: 'Klorea' }))
      .toEqual({ cle: 'meta:789', nom: 'Klorea' });
  });

  it('plateforme absente · Meta par défaut', () => {
    expect(refSourceVeille({ id: '789', advertiserName: 'Klorea' })!.cle).toBe('meta:789');
  });

  it('null sans identifiant · pas de provenance qu’on ne saurait pas retrouver', () => {
    expect(refSourceVeille({ platform: 'meta', id: '', advertiserName: 'Klorea' })).toBeNull();
    expect(refSourceVeille({ advertiserName: 'Klorea' })).toBeNull();
  });

  it('nom vide toléré · la clé suffit à tracer la source', () => {
    expect(refSourceVeille({ platform: 'tiktok', id: '42' })).toEqual({ cle: 'tiktok:42', nom: '' });
  });
});

describe('siteMarque · domaine puis URL', () => {
  it('normalise le domaine (sans www, sans chemin)', () => {
    expect(siteMarque({ landingDomain: 'www.klorea.com/promo' })).toBe('https://klorea.com');
    expect(siteMarque({ landingDomain: 'klorea.com' })).toBe('https://klorea.com');
  });

  it('retombe sur l’origine de l’URL quand pas de domaine', () => {
    expect(siteMarque({ landingUrl: 'https://klorea.com/a/b?x=1' })).toBe('https://klorea.com');
  });

  it('null quand rien', () => {
    expect(siteMarque({})).toBeNull();
    expect(siteMarque({ landingUrl: 'pas-une-url' })).toBeNull();
  });
});

const CARD = readFileSync(join(process.cwd(), 'components/AdCard.tsx'), 'utf8');
const SWIPE = readFileSync(join(process.cwd(), 'app/(app)/veille/scale/SwipeFile.tsx'), 'utf8');
// Le lien bibliothèque des marques suivies vit désormais dans le composant
// client `MarquesSuivies` (qui porte aussi le brief à la demande).
const SAVED = readFileSync(join(process.cwd(), 'components/MarquesSuivies.tsx'), 'utf8');

describe('les surfaces de veille exposent bien le lien bibliothèque', () => {
  it('carte, swipe file et marques suivies appellent bibliothequePub', () => {
    expect(CARD).toMatch(/bibliothequePub\(/);
    expect(SWIPE).toMatch(/bibliothequePub\(/);
    expect(SAVED).toMatch(/bibliothequePub\(/);
  });

  // CDC v8 · F07 · carte et swipe file nomment le repli via `libelleBibliotheque`
  // (« … rechercher l'annonceur ») · le lien ne se présente plus comme la créa
  // exacte. Marques suivies porte déjà un libellé générique honnête.
  it('carte et swipe file nomment le repli comme une recherche', () => {
    expect(CARD).toMatch(/libelleBibliotheque\(/);
    expect(SWIPE).toMatch(/libelleBibliotheque\(/);
  });
});
