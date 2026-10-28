import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { CHEMINS_REDIRIGES_SERVEUR } from '@tiktrends/core';
import { middleware, config } from '../middleware';

/**
 * Le middleware · les adresses retirées sortent en VRAIE 307 HTTP, avant tout
 * rendu (une page `redirect()` sous l'ancienne coquille sortait en 200 diffusé et le
 * navigateur lève l'erreur React #310 · mesuré en production locale).
 *
 * On appelle la vraie fonction avec une vraie `NextRequest` et on lit la
 * RÉPONSE (statut, `Location`) · cibles écrites en clair. L'appariement est
 * celui de Next (`unstable_doesMiddlewareMatch`) sur le vrai `config`.
 */

// Le filet · la page `redirect()` de chaque adresse doit viser la même cible.
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); } }));

const HOTE = 'https://app.tiktrends.test';
const REF = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ITER = 'ada00000-0000-4000-8000-000000000002';

/** [adresse demandée, cible attendue] · le contexte porté par l'adresse est repris. */
const CAS: Array<[string, string]> = [
  ['/studio', '/studio/projets'],
  ['/studio?angle=x', '/studio/projets'],
  ['/studio/ads', '/studio/projets'],
  ['/studio/ads?mode=clone', '/studio/projets'],
  [`/studio/ads?mode=clone&ref=${REF}&angle=Avant%2Fapr%C3%A8s+en+3+s&src=meta%3A123&srcnom=Glow&depuis=veille&rv=q%3Dserum%26p%3Dmeta%23ad-meta-123`,
    `/studio/projets/nouveau?type=ads&angle=Avant%2Fapr%C3%A8s+en+3+s&ref=${REF}&src=meta%3A123&srcnom=Glow&depuis=veille&rv=q%3Dserum%26p%3Dmeta%23ad-meta-123`],
  [`/studio/ads?iter=${ITER}`, `/studio/projets/nouveau?type=ads&iter=${ITER}`],
  ['/studio/image', '/studio/projets'],
  ['/studio/video?prompt=Plan+serr%C3%A9', '/studio/projets/nouveau?type=video&angle=Plan+serr%C3%A9'],
  ['/studio/textes?brand=S%C3%A9rum&inspo=Avant', '/studio/projets/nouveau?type=text&angle=Avant&produit=S%C3%A9rum'],
  ['/adsmap/jarvis', '/jarvis'],
  ['/adsmap/jarvis?x=1', '/jarvis'],
];

/** Chemins qui ne sont PAS des adresses retirées ni des écrans Spatiaux · ni appariés, ni touchés (page publique, route, 404). */
// La fiche projet `/studio/projets/[id]` est un écran Spatial · sa route de fichier, elle, n'est pas concernée.
const NON_CONCERNES = ['/', '/login', '/analytics', '/studio/projets/abc/produit/fichier/a1', '/studio/ads/x', '/adresse-jamais-portee', '/api/health', '/_next/static/chunks/main.js'];

const appeler = (adresse: string, headers: Record<string, string> = {}) => middleware(new NextRequest(HOTE + adresse, { headers }));

describe('middleware · adresses retirées servies en 307 HTTP, contexte repris', () => {
  it('chaque adresse retirée ⇒ 307 et Location exacte', () => {
    for (const [adresse, cible] of CAS) {
      const r = appeler(adresse);
      expect([adresse, r.status, r.headers.get('location')]).toEqual([adresse, 307, HOTE + cible]);
    }
  });

  it('requête du routeur client (RSC) ⇒ même 307 · le routeur Next suit la redirection', () => {
    const r = appeler('/studio/video?prompt=Plan&_rsc=abc', { RSC: '1' });
    expect([r.status, r.headers.get('location')]).toEqual([307, `${HOTE}/studio/projets/nouveau?type=video&angle=Plan`]);
  });

  it('chemin non concerné ⇒ passe inchangé (aucune redirection, aucune réécriture)', () => {
    for (const adresse of NON_CONCERNES) {
      const r = appeler(adresse);
      expect([adresse, r.status, r.headers.get('location'), r.headers.get('x-middleware-rewrite'), r.headers.get('x-middleware-next')]).toEqual([adresse, 200, null, null, '1']);
    }
  });

  it('le matcher de Next couvre chaque adresse retirée, avec ou sans paramètres', () => {
    for (const chemin of CHEMINS_REDIRIGES_SERVEUR) for (const url of [chemin, `${chemin}?angle=x`]) {
      expect([url, unstable_doesMiddlewareMatch({ config, url })]).toEqual([url, true]);
    }
  });

  it('le matcher couvre les pages (bascule Spatial) mais jamais l’API, les ressources Next ni les fichiers', () => {
    for (const url of ['/', '/login', '/dashboard', '/usage', '/veille', '/studio/projets/abc/image']) expect([url, unstable_doesMiddlewareMatch({ config, url })]).toEqual([url, true]);
    for (const url of ['/api/health', '/_next/static/chunks/main.js', '/icon.svg', '/robots.txt']) expect([url, unstable_doesMiddlewareMatch({ config, url })]).toEqual([url, false]);
  });
});

describe('middleware · interface Spatial seule (l’ancienne interface est retirée)', () => {
  it('écran porté ⇒ réécrit vers l’arbre interne, section transmise, adresse inchangée', () => {
    const r = appeler('/usage');
    expect(r.status).toBe(200);
    expect(r.headers.get('location')).toBeNull();
    expect(r.headers.get('x-middleware-rewrite')).toBe(`${HOTE}/sp/usage`);
    expect(r.headers.get('x-middleware-request-x-tt-section')).toBe('reglages');
  });

  it('chaque rubrique est servie par Spatial · Accueil, Studios (fiche comprise), Résultats, Jarvis, Veille', () => {
    for (const adresse of ['/dashboard', '/dashboard?vue=analytics', '/onboarding', '/studio/projets', '/studio/prompts', '/studio/iterer', '/studio/projets/abc', '/studio/projets/nouveau', '/studio/projets/nouveau/concept', '/studio/projets/abc/image', '/studio/projets/abc/produit', '/studio/projets/abc/textes', '/studio/projets/abc/identites', '/studio/projets/abc/export', '/studio/projets/abc/video', '/adsmap', '/adsmap/tri', '/adsmap/lots', '/adsmap/tests/abc', '/jarvis', '/jarvis/sources', '/jarvis/veille', '/veille', '/saved']) {
      const r = appeler(adresse);
      expect([adresse, r.status, r.headers.get('location'), r.headers.get('x-middleware-rewrite')]).toEqual([adresse, 200, null, `${HOTE}/sp${adresse}`]);
    }
  });

  it('`?ui=v5` et le cookie `tt_ui` n’ont plus aucun effet · ni redirection, ni cookie, ni retour à l’ancienne interface', () => {
    for (const [adresse, cookie] of [['/usage?ui=v5', undefined], ['/usage?ui=spatial', undefined], ['/usage', 'tt_ui=v5'], ['/onboarding', 'tt_ui=v5']] as const) {
      const r = appeler(adresse, cookie ? { cookie } : {});
      const chemin = adresse.split('?')[0]!;
      expect([adresse, r.status, r.headers.get('location'), r.cookies.get('tt_ui'), r.headers.get('x-middleware-rewrite')?.replace(/\?.*$/, '')]).toEqual([adresse, 200, null, undefined, `${HOTE}/sp${chemin}`]);
    }
  });

  it('un chemin déjà interne n’est jamais réécrit une seconde fois', () => {
    const r = appeler('/sp/usage');
    expect([r.headers.get('x-middleware-rewrite'), r.headers.get('x-middleware-next')]).toEqual([null, '1']);
  });

  it('les adresses retirées gardent leur 307', () => {
    const r = appeler('/studio');
    expect([r.status, r.headers.get('location')]).toEqual([307, `${HOTE}/studio/projets`]);
  });
});

describe('filet · la page redirect() de chaque adresse vise la même cible que le middleware', () => {
  type Page = (p: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => unknown;
  const PAGES: Record<string, () => Promise<{ default: Page }>> = {
    // Hors coquille depuis le retrait de l'ancienne interface (`app/studio/…`, plus sous `(app)`).
    '/studio': () => import('../app/studio/page') as Promise<{ default: Page }>,
    '/studio/ads': () => import('../app/studio/ads/page'),
    '/studio/image': () => import('../app/studio/image/page'),
    '/studio/video': () => import('../app/studio/video/page'),
    '/studio/textes': () => import('../app/studio/textes/page'),
    // L'ancienne page V5 est retirée (Résultats exclusif) · le filet est la page Spatial.
    '/adsmap/jarvis': () => import('../app/(spatial)/sp/adsmap/jarvis/page') as Promise<{ default: Page }>,
  };

  it('chaque adresse retirée a sa page filet', () => {
    expect(Object.keys(PAGES).sort()).toEqual([...CHEMINS_REDIRIGES_SERVEUR].sort());
  });

  it('page et middleware ⇒ même cible, cas par cas', async () => {
    for (const [adresse, cible] of CAS) {
      const u = new URL(HOTE + adresse);
      const sp: Record<string, string | string[] | undefined> = {};
      for (const [k, v] of u.searchParams) { const d = sp[k]; sp[k] = d === undefined ? v : Array.isArray(d) ? [...d, v] : [d, v]; }
      const { default: page } = await PAGES[u.pathname]!();
      let vers = '';
      try { await page({ searchParams: Promise.resolve(sp) }); } catch (e) { vers = String((e as Error).message).replace(/^redirect /, ''); }
      expect([adresse, vers]).toEqual([adresse, cible]);
    }
  });
});
