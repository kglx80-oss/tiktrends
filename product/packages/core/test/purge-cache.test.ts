import { describe, it, expect } from 'vitest';
import { purgeCacheAFaire, entetesPurgeCache, regleEnTetesPurgeCache, VERSION_CACHE_MEDIAS } from '../src';

/**
 * Purge du cache navigateur, une fois · on lit la décision et les en-têtes
 * rendus. L'évaluation de la règle par le moteur de Next vit côté web
 * (`purge-cache-config.test.ts`).
 */

const HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

describe('purgeCacheAFaire · une fois par navigateur, sessions ouvertes, pages HTML', () => {
  it.each([
    ['session, HTML, sans cookie de version', { session: true, accepte: HTML, cookieVersion: null }, true],
    ['session, HTML, ancienne version', { session: true, accepte: HTML, cookieVersion: '1' }, true],
    ['session, HTML, version « 22 » (pas exactement 2)', { session: true, accepte: HTML, cookieVersion: '22' }, true],
    ['session, HTML, version courante · déjà purgé', { session: true, accepte: HTML, cookieVersion: '2' }, false],
    ['sans session', { session: false, accepte: HTML, cookieVersion: null }, false],
    ['requête non HTML (image, JSON)', { session: true, accepte: 'image/avif,image/webp,*/*', cookieVersion: null }, false],
    ['sans Accept', { session: true, accepte: null, cookieVersion: null }, false],
  ])('%s', (_n, r, attendu) => expect(purgeCacheAFaire(r)).toBe(attendu));
});

describe('en-têtes posés', () => {
  it('Clear-Site-Data "cache" et cookie de version pour un an, sur tout le site', () => {
    expect(VERSION_CACHE_MEDIAS).toBe(2);
    expect(entetesPurgeCache()).toEqual([
      { key: 'Clear-Site-Data', value: '"cache"' },
      { key: 'Set-Cookie', value: 'tt_cache_v=2; Max-Age=31536000; Path=/; SameSite=Lax' },
    ]);
  });
  it('la règle porte ces en-têtes', () => {
    expect(regleEnTetesPurgeCache().headers).toEqual(entetesPurgeCache());
  });
});
