import { describe, it, expect } from 'vitest';
import robots from '../app/robots';
import sitemap from '../app/sitemap';

/**
 * Le référencement, vérifié sur ce qui SORT · pas sur la présence d'un fichier.
 * On appelle robots() et sitemap() (modules purs, aucune dépendance serveur) et
 * on lit la structure produite.
 */

describe('SEO · robots', () => {
  const r = robots();
  const rule = (Array.isArray(r.rules) ? r.rules[0] : r.rules)!;

  it('ouvre le public et pointe le sitemap', () => {
    expect(r.sitemap, 'le sitemap n’est pas déclaré').toContain('/sitemap.xml');
    expect(rule.allow, 'le public n’est pas autorisé').toContain('/');
  });

  it('ferme l’application derrière l’authentification', () => {
    const dis = ([] as string[]).concat(rule.disallow ?? []);
    for (const route of ['/dashboard', '/studio', '/adsmap', '/billing']) {
      expect(dis, `${route} ne doit pas être indexable`).toContain(route);
    }
  });
});

describe('SEO · sitemap', () => {
  const urls = sitemap().map((e) => e.url);

  it('liste les pages publiques (accueil, tarifs, inscription)', () => {
    expect(urls, 'accueil absent du sitemap').toContain('https://app.tiktrends.co/');
    expect(urls, 'tarifs absent du sitemap').toContain('https://app.tiktrends.co/tarifs');
    expect(urls, 'inscription absente du sitemap').toContain('https://app.tiktrends.co/signup');
  });

  it('n’expose aucune route applicative privée', () => {
    const fuite = urls.find((u) => /\/(dashboard|studio|adsmap|billing|veille)/.test(u));
    expect(fuite, `route privée exposée : ${fuite}`).toBeUndefined();
  });
});
