import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { CHEMINS_REDIRIGES_SERVEUR } from '@tiktrends/core';
import { middleware, config } from '../middleware';

/**
 * Le middleware · les adresses retirées sortent en VRAIE 307 HTTP, avant tout
 * rendu (une page `redirect()` sous `(app)` sort en 200 diffusé et le
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

/** Chemins qui ne sont PAS des adresses retirées · ni appariés, ni touchés. */
// `/studio/projets` (liste) et Résultats sont des écrans Spatial EXCLUSIFS depuis la vague 2 · réécrits même en mode V5, gardés plus bas.
const NON_CONCERNES = ['/', '/login', '/dashboard', '/analytics', '/studio/projets/nouveau?type=ads&angle=x', '/studio/projets/abc/image', '/studio/ads/x', '/saved', '/assets', '/veille', '/api/health', '/_next/static/chunks/main.js'];

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

  it('chemin non concerné ⇒ passe inchangé (aucune redirection)', () => {
    // En mode V5 · la réécriture Spatial (défaut) est gardée à part, plus bas.
    for (const adresse of NON_CONCERNES) {
      const r = appeler(adresse, { cookie: 'tt_ui=v5' });
      expect([adresse, r.status, r.headers.get('location'), r.headers.get('x-middleware-next')]).toEqual([adresse, 200, null, '1']);
    }
  });

  it('Jarvis est exclusif (vague 3) · même en mode V5, ses écrans sont servis par Spatial', () => {
    for (const adresse of ['/jarvis', '/jarvis/sources', '/jarvis/veille']) {
      const r = appeler(adresse, { cookie: 'tt_ui=v5' });
      expect([adresse, r.status, r.headers.get('location'), r.headers.get('x-middleware-rewrite')]).toEqual([adresse, 200, null, `${HOTE}/sp${adresse}`]);
    }
  });

  it('Résultats est exclusif · même en mode V5, ses adresses sont servies par Spatial (sans redirection)', () => {
    for (const adresse of ['/adsmap', '/adsmap/tri', '/adsmap/lots', '/adsmap/tests/abc']) {
      const r = appeler(adresse, { cookie: 'tt_ui=v5' });
      expect([adresse, r.status, r.headers.get('location'), r.headers.get('x-middleware-rewrite')]).toEqual([adresse, 200, null, `${HOTE}/sp${adresse}`]);
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

describe('middleware · bascule Spatial (cookie tt_ui)', () => {
  const avec = (adresse: string, ui?: string) => appeler(adresse, ui ? { cookie: `tt_ui=${ui}` } : {});

  it('?ui=spatial ⇒ pose le cookie et revient à la même adresse sans le paramètre', () => {
    const r = appeler('/usage?ui=spatial&x=1');
    expect([r.status, r.headers.get('location')]).toEqual([307, `${HOTE}/usage?x=1`]);
    expect(r.cookies.get('tt_ui')?.value).toBe('spatial');
    expect(appeler('/usage?ui=v5').cookies.get('tt_ui')?.value).toBe('v5');
    // Une valeur inconnue est ignorée · aucun cookie, aucune redirection.
    const n = appeler('/usage?ui=rose');
    expect([n.status, n.cookies.get('tt_ui')]).toEqual([200, undefined]);
  });

  it('mode Spatial + écran porté ⇒ réécrit vers l’arbre interne, section transmise, adresse inchangée', () => {
    const r = avec('/usage', 'spatial');
    expect(r.status).toBe(200);
    expect(r.headers.get('location')).toBeNull();
    expect(r.headers.get('x-middleware-rewrite')).toBe(`${HOTE}/sp/usage`);
    expect(r.headers.get('x-middleware-request-x-tt-section')).toBe('reglages');
  });

  it('sans cookie ⇒ Spatial par défaut · l’écran porté est réécrit', () => {
    const r = avec('/usage');
    expect([r.status, r.headers.get('x-middleware-rewrite')]).toEqual([200, `${HOTE}/sp/usage`]);
  });

  it('mode V5, ou écran non porté ⇒ aucune réécriture', () => {
    for (const [adresse, ui] of [['/dashboard', 'v5'], ['/console', 'spatial'], ['/console', undefined], ['/sp/usage', 'spatial']] as const) {
      const r = avec(adresse, ui);
      expect([adresse, ui, r.headers.get('x-middleware-rewrite'), r.headers.get('x-middleware-next')]).toEqual([adresse, ui, null, '1']);
    }
  });

  it('Studios · un écran EXCLUSIF (page V5 retirée) est réécrit même en mode V5 · la fiche, la préparation et l’éditeur restent V5', () => {
    for (const adresse of ['/studio/projets', '/studio/prompts', '/studio/iterer', '/studio/projets/nouveau/concept', '/studio/projets/abc/produit', '/studio/projets/abc/textes', '/studio/projets/abc/identites', '/studio/projets/abc/export', '/studio/projets/abc/video']) {
      expect([adresse, avec(adresse, 'v5').headers.get('x-middleware-rewrite')]).toEqual([adresse, `${HOTE}/sp${adresse}`]);
    }
    for (const adresse of ['/studio/projets/nouveau', '/studio/projets/abc', '/studio/projets/abc/image', '/studio/projets/abc/produit/fichier/a1']) {
      expect([adresse, avec(adresse, 'v5').headers.get('x-middleware-rewrite')]).toEqual([adresse, null]);
    }
  });

  it('les adresses retirées gardent leur 307 en mode Spatial', () => {
    const r = avec('/studio', 'spatial');
    expect([r.status, r.headers.get('location')]).toEqual([307, `${HOTE}/studio/projets`]);
  });
});

describe('filet · la page redirect() de chaque adresse vise la même cible que le middleware', () => {
  type Page = (p: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => unknown;
  const PAGES: Record<string, () => Promise<{ default: Page }>> = {
    '/studio': () => import('../app/(app)/studio/page') as Promise<{ default: Page }>,
    '/studio/ads': () => import('../app/(app)/studio/ads/page'),
    '/studio/image': () => import('../app/(app)/studio/image/page'),
    '/studio/video': () => import('../app/(app)/studio/video/page'),
    '/studio/textes': () => import('../app/(app)/studio/textes/page'),
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
