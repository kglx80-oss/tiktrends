import { describe, it, expect } from 'vitest';
import {
  contexteVeille, lienRetourVeille, termeRetourVeille, ancreCarteVeille, lienAnnonceurVeille,
} from '../src';

describe('Veille · contexte de retour (lot 18B)', () => {
  it('ne garde que les critères connus, à leurs valeurs admises · l’ancre suit', () => {
    expect(contexteVeille({ q: ' routine ', sort: 'longestRunning', media: 'image', page: '2', refresh: '1', rv: 'q=a', inconnu: 'x' }, 'ad-meta-mock-044'))
      .toBe('q=routine&media=image&sort=longestRunning&page=2#ad-meta-mock-044');
    expect(contexteVeille({ p: 'evil', media: 'gif', page: '0', country: 'fr', status: 'tout' })).toBe('');
    expect(contexteVeille({ q: 'a' }, '"><script>')).toBe('q=a');
  });

  it('le retour vise TOUJOURS /veille · une valeur forgée ne redirige nulle part ailleurs', () => {
    for (const forge of ['//evil.example', 'https://evil.example/x', 'javascript:alert(1)', '/admin?q=a', '%2F%2Fevil.example', 'q=a#//evil.example', '\\\\evil.example']) {
      const href = lienRetourVeille(forge)!;
      expect(href.startsWith('/veille'), forge).toBe(true);
      expect(href, forge).not.toMatch(/evil|javascript|admin/);
    }
    expect(lienRetourVeille('q=routine&page=2&rv=q%3Dz#ad-meta-1')).toBe('/veille?q=routine&page=2#ad-meta-1');
    expect(lienRetourVeille('page=9999')).toBe('/veille');
    expect(lienRetourVeille(null)).toBeNull();
    expect(lienRetourVeille(undefined)).toBeNull();
  });

  it('le terme repris est celui de la recherche d’origine', () => {
    expect(termeRetourVeille('q=Brume+%26+Sel&page=3')).toBe('Brume & Sel');
    expect(termeRetourVeille('page=3')).toBeNull();
  });

  it('l’ancre d’une carte est stable et sans caractère hors liste', () => {
    expect(ancreCarteVeille({ platform: 'meta', id: 'mock-044' })).toBe('ad-meta-mock-044');
    expect(ancreCarteVeille({ platform: 'tiktok', id: '7/3"x' })).toBe('ad-tiktok-7_3_x');
    expect(ancreCarteVeille({ platform: 'meta', id: '' })).toBeNull();
  });
});

describe('Veille · « Ses annonces dans la Veille » (lot 18B)', () => {
  it('Meta · recherche par marque, valeurs encodées, contexte de départ porté', () => {
    const href = lienAnnonceurVeille({ platform: 'meta', advertiserName: 'Brume & Sel' }, 'q=routine&page=2#ad-meta-mock-044')!;
    const u = new URL(href, 'http://x');
    expect(u.pathname).toBe('/veille');
    expect(u.searchParams.get('q')).toBe('Brume & Sel');
    expect(u.searchParams.get('searchIn')).toBe('brand');
    expect(u.searchParams.get('rv')).toBe('q=routine&page=2#ad-meta-mock-044');
    expect(lienRetourVeille(u.searchParams.get('rv'))).toBe('/veille?q=routine&page=2#ad-meta-mock-044');
  });
  it('TikTok · par domaine connu · Google ou sans nom · aucun lien', () => {
    expect(lienAnnonceurVeille({ platform: 'tiktok', landingDomain: 'https://www.kora.exemple.test/p' }, '')).toBe('/veille?q=kora.exemple.test&p=tiktok');
    expect(lienAnnonceurVeille({ platform: 'tiktok', advertiserName: 'Kora' }, '')).toBeNull();
    expect(lienAnnonceurVeille({ platform: 'google', advertiserName: 'Kora' }, '')).toBeNull();
    expect(lienAnnonceurVeille({ platform: 'meta', advertiserName: '  ' }, '')).toBeNull();
  });
});
