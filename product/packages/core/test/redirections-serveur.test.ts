import { describe, it, expect } from 'vitest';
import { redirectionServeur, paramsDepuisRecherche, CHEMINS_REDIRIGES_SERVEUR, ANCIENNES_ADRESSES_STUDIO } from '../src';

/**
 * La règle des redirections SERVEUR (lue par `apps/web/middleware.ts`).
 * Les cibles attendues sont écrites EN CLAIR · jamais recalculées par la règle.
 */
const REF = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ITER = 'ada00000-0000-4000-8000-000000000002';

describe('redirectionServeur · la cible d’une adresse retirée, contexte repris', () => {
  const CAS: Array<[string, string, string]> = [
    ['/studio', '', '/studio/projets'],
    ['/studio', '?angle=x', '/studio/projets'],
    ['/studio/ads', '', '/studio/projets'],
    ['/studio/ads', '?mode=clone', '/studio/projets'],
    ['/studio/ads', `?mode=clone&ref=${REF.toUpperCase()}&angle=Avant%2Fapr%C3%A8s&src=meta%3A123&srcnom=Glow&depuis=veille&rv=q%3Dserum%26p%3Dmeta%23ad-meta-123`,
      `/studio/projets/nouveau?type=ads&angle=Avant%2Fapr%C3%A8s&ref=${REF}&src=meta%3A123&srcnom=Glow&depuis=veille&rv=q%3Dserum%26p%3Dmeta%23ad-meta-123`],
    ['/studio/ads', `?iter=${ITER}`, `/studio/projets/nouveau?type=ads&iter=${ITER}`],
    ['/studio/image', '?mode=x', '/studio/projets'],
    ['/studio/video', '?prompt=Plan+serr%C3%A9', '/studio/projets/nouveau?type=video&angle=Plan+serr%C3%A9'],
    ['/studio/textes', '?brand=S%C3%A9rum&inspo=Avant', '/studio/projets/nouveau?type=text&angle=Avant&produit=S%C3%A9rum'],
    ['/adsmap/jarvis', '', '/jarvis'],
    ['/adsmap/jarvis', '?x=1', '/jarvis'],
  ];

  it('chaque adresse retirée ⇒ sa cible exacte', () => {
    for (const [chemin, recherche, cible] of CAS) expect([chemin, recherche, redirectionServeur(chemin, recherche)]).toEqual([chemin, recherche, cible]);
  });

  it('la recherche se lit en chaîne ou en URLSearchParams, avec ou sans « ? »', () => {
    const attendu = '/studio/projets/nouveau?type=video&angle=Plan';
    expect(redirectionServeur('/studio/video', 'prompt=Plan')).toBe(attendu);
    expect(redirectionServeur('/studio/video', '?prompt=Plan')).toBe(attendu);
    expect(redirectionServeur('/studio/video', new URLSearchParams('prompt=Plan'))).toBe(attendu);
  });

  it('valeur répétée ⇒ la PREMIÈRE, comme la page le lisait', () => {
    expect(redirectionServeur('/studio/video', '?prompt=premier&prompt=second')).toBe('/studio/projets/nouveau?type=video&angle=premier');
    expect(paramsDepuisRecherche('?a=1&b=2&a=3&a=4')).toEqual({ a: ['1', '3', '4'], b: '2' });
  });

  it('valeurs forgées ⇒ ignorées, jamais d’hôte étranger', () => {
    expect(redirectionServeur('/studio/ads', '?ref=../../x&iter=javascript:alert(1)&depuis=veille&rv=https://evil.test')).toBe('/studio/projets');
  });

  it('chemin non concerné ⇒ null (la requête passe inchangée)', () => {
    for (const c of ['/', '/studio/projets', '/studio/projets/nouveau', '/studio/ads/x', '/studio/', '/jarvis', '/adsmap', '/adsmap/tri', '/analytics', '/dashboard', '/constructor', '/__proto__', '/toString'])
      expect([c, redirectionServeur(c, '?angle=x')]).toEqual([c, null]);
  });

  it('chaque cible est un chemin du site, hors de toute adresse retirée · aucune boucle', () => {
    const recherches = ['', '?angle=x&prompt=y&inspo=z&brand=w', `?iter=${ITER}`];
    for (const chemin of CHEMINS_REDIRIGES_SERVEUR) for (const r of recherches) {
      const cible = redirectionServeur(chemin, r) ?? '';
      expect(cible.startsWith('/') && !cible.startsWith('//')).toBe(true);
      expect(CHEMINS_REDIRIGES_SERVEUR).not.toContain(new URL(cible, 'https://x.test').pathname);
    }
  });

  it('toutes les anciennes adresses de création sont servies par le serveur', () => {
    for (const a of ANCIENNES_ADRESSES_STUDIO) expect(CHEMINS_REDIRIGES_SERVEUR).toContain(a);
  });
});
