// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 18B · Veille · ce qu'on VOIT (mesures au navigateur · MATRICE-lot18B) ·
 * le lien vers les annonces du même annonceur, le retour à SA recherche depuis
 * la Veille et le Studio, les filtres de « Ce qui scale » dans l'URL.
 */
vi.mock('../components/InspoButtons', () => ({ SaveButton: () => <button type="button">★</button>, FollowButton: () => <button type="button">+ Suivre</button> }));
const { AdCard } = await import('../components/AdCard');
const { RetourVeille } = await import('../components/RetourVeille');

const AD = { id: 'mock-044', platform: 'meta', status: 'active', daysRunning: 34, advertiserName: 'Brume & Sel', body: 'Routine du soir', landingDomain: 'annonceur3.exemple.test' } as never;
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };

describe('Carte de Veille · annonceur et retour (lot 18B)', () => {
  it('en Veille · ancre, recherche interne de l’annonceur et Studio qui sait revenir', () => {
    const d = dom(renderToStaticMarkup(<AdCard ad={AD} contexteRetour="q=routine&page=2" />));
    expect(d.firstElementChild?.id, 'la carte n’a pas d’ancre · le retour ne retrouve pas la position').toBe('ad-meta-mock-044');
    const ann = [...d.querySelectorAll('a')].find((a) => /Ses annonces dans la Veille/.test(a.textContent ?? ''));
    expect(ann?.getAttribute('href'), 'pas de lien interne vers l’annonceur').toBe('/veille?q=Brume+%26+Sel&p=meta&searchIn=brand&rv=q%3Droutine%26page%3D2%23ad-meta-mock-044');
    expect(ann?.getAttribute('target'), 'lien interne ouvert ailleurs').toBeNull();
    expect(d.textContent, 'une recherche présentée comme un suivi').not.toMatch(/concurrent suivi/i);
    const studio = [...d.querySelectorAll('a')].find((a) => (a.getAttribute('href') ?? '').startsWith('/studio/ads'))!;
    const u = new URL(studio.getAttribute('href')!, 'http://x');
    expect(u.searchParams.get('depuis'), 'le Studio ne sait pas d’où l’on vient').toBe('veille');
    expect(u.searchParams.get('rv')).toBe('q=routine&page=2#ad-meta-mock-044');
  });

  it('hors Veille (Sauvegardes, Nouveautés…) · aucune ancre, aucun lien de plus, Studio inchangé', () => {
    const d = dom(renderToStaticMarkup(<AdCard ad={AD} />));
    expect(d.firstElementChild?.id).toBe('');
    expect(d.textContent).not.toMatch(/Ses annonces dans la Veille/);
    const studio = [...d.querySelectorAll('a')].find((a) => (a.getAttribute('href') ?? '').startsWith('/studio/ads'))!;
    expect(studio.getAttribute('href')).not.toMatch(/depuis=|rv=/);
  });
});

describe('Retour à la recherche (lot 18B)', () => {
  it('dit le terme et vise la carte d’origine', () => {
    const d = dom(renderToStaticMarkup(<RetourVeille rv="q=routine&page=2#ad-meta-mock-044" />));
    const a = d.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('/veille?q=routine&page=2#ad-meta-mock-044');
    expect(a.textContent).toContain('« routine »');
  });
  it('une valeur forgée ne sort jamais de la Veille · sans contexte, rien', () => {
    const d = dom(renderToStaticMarkup(<RetourVeille rv="//evil.example/x" />));
    expect(d.querySelector('a')?.getAttribute('href')).toBe('/veille');
    expect(renderToStaticMarkup(<RetourVeille rv={undefined} />)).toBe('');
  });
});
