import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bibliothequePub, libelleBibliotheque, refSourceVeille, siteMarque, sourceVeilleDepuisRef, lienSourceVeille } from '@tiktrends/core';

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

// CDC v8 · provenance durable · le chemin INVERSE de `refSourceVeille` · relire
// la source depuis ce qui a été porté (clé + nom), pour l'enregistrer sur la
// génération plutôt que de la perdre avec l'URL. Puis le lien dérivé (jamais
// stocké) vers la bibliothèque de l'annonceur.
describe('sourceVeilleDepuisRef · recompose la source durable depuis la clé portée', () => {
  it('clé plateforme:id + nom → objet {plateforme, id, annonceur}', () => {
    expect(sourceVeilleDepuisRef('meta:789', 'Klorea'))
      .toEqual({ plateforme: 'meta', id: '789', annonceur: 'Klorea' });
  });

  it('aller-retour fidèle · refSourceVeille puis sourceVeilleDepuisRef', () => {
    const ref = refSourceVeille({ platform: 'tiktok', id: '42', advertiserName: 'Neva' })!;
    expect(sourceVeilleDepuisRef(ref.cle, ref.nom))
      .toEqual({ plateforme: 'tiktok', id: '42', annonceur: 'Neva' });
  });

  it('coupe au PREMIER « : » · un identifiant qui en contient reste entier', () => {
    expect(sourceVeilleDepuisRef('meta:12:34', 'X'))
      .toEqual({ plateforme: 'meta', id: '12:34', annonceur: 'X' });
  });

  it('nom absent toléré · annonceur vide', () => {
    expect(sourceVeilleDepuisRef('meta:789')).toEqual({ plateforme: 'meta', id: '789', annonceur: '' });
  });

  it('null quand la clé ne décrit pas une source relisable', () => {
    expect(sourceVeilleDepuisRef('', 'Klorea')).toBeNull();       // rien
    expect(sourceVeilleDepuisRef('meta', 'Klorea')).toBeNull();   // pas de séparateur
    expect(sourceVeilleDepuisRef(':789', 'Klorea')).toBeNull();   // pas de plateforme
    expect(sourceVeilleDepuisRef('meta:', 'Klorea')).toBeNull();  // pas d'identifiant
    expect(sourceVeilleDepuisRef(null)).toBeNull();
  });
});

describe('lienSourceVeille · le lien disponible, DÉRIVÉ (jamais stocké)', () => {
  it('Meta · recherche l’annonceur dans l’Ad Library', () => {
    const l = lienSourceVeille({ plateforme: 'meta', id: '789', annonceur: 'Klorea' })!;
    expect(l.url).toContain('facebook.com/ads/library');
    expect(decodeURIComponent(l.url)).toContain('Klorea');
    expect(l.label).toBe('Bibliothèque Meta');
  });

  it('null sans annonceur · une recherche par nom sans nom n’atterrit nulle part', () => {
    expect(lienSourceVeille({ plateforme: 'meta', id: '789', annonceur: '' })).toBeNull();
  });

  it('null sur Google · pas de recherche par nom fiable · pas de bouton mort', () => {
    expect(lienSourceVeille({ plateforme: 'google', id: '789', annonceur: 'Klorea' })).toBeNull();
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
