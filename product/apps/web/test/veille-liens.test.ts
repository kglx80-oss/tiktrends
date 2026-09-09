import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bibliothequeMeta, siteMarque } from '@tiktrends/core';

/**
 * Depuis la Veille, on doit pouvoir SORTIR vers la source · la bibliothèque
 * publicitaire Meta d'une marque et son site. On teste les URL produites, pas
 * la présence d'un appel.
 */

describe('bibliothequeMeta · recherche par nom, réservée à Meta', () => {
  it('construit une URL de recherche Meta pour un annonceur', () => {
    const u = bibliothequeMeta({ platform: 'meta', name: 'HELL Ice Coffee' });
    expect(u).toContain('https://www.facebook.com/ads/library/');
    expect(u).toContain('q=HELL+Ice+Coffee');
    expect(u).toContain('search_type=keyword_unordered');
  });

  it('null hors Meta · pas de bibliothèque au même endroit', () => {
    expect(bibliothequeMeta({ platform: 'tiktok', name: 'Klorea' })).toBeNull();
    expect(bibliothequeMeta({ platform: 'google', name: 'Klorea' })).toBeNull();
  });

  it('null sans nom · rien à chercher', () => {
    expect(bibliothequeMeta({ platform: 'meta', name: '' })).toBeNull();
    expect(bibliothequeMeta({ platform: 'meta', name: null })).toBeNull();
  });

  it('plateforme absente · on suppose Meta', () => {
    expect(bibliothequeMeta({ name: 'Klorea' })).toContain('q=Klorea');
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
const SAVED = readFileSync(join(process.cwd(), 'app/(app)/saved/page.tsx'), 'utf8');

describe('les surfaces de veille exposent bien le lien bibliothèque', () => {
  it('carte, swipe file et marques suivies appellent bibliothequeMeta', () => {
    expect(CARD).toMatch(/bibliothequeMeta\(/);
    expect(SWIPE).toMatch(/bibliothequeMeta\(/);
    expect(SAVED).toMatch(/bibliothequeMeta\(/);
  });
});
