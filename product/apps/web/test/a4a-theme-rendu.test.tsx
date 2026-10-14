// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { THEME_COOKIE } from '@tiktrends/core';

/**
 * V5 · A4a · le thème au RÉSULTAT.
 *
 *  1. le layout racine, RENDU côté serveur (`renderToString`), pose
 *     `data-theme` sur `<html>` selon le cookie `tt_theme` · sombre sans
 *     cookie, clair avec « clair », sombre pour toute valeur invalide. C'est ce
 *     HTML qui part au premier octet · aucun flash ;
 *  2. la couleur de barre du navigateur (`generateViewport`) suit le thème ;
 *  3. la bascule client pose le cookie, l'attribut et la barre ;
 *  4. la barre de défilement ne porte plus de littéral · elle suit les jetons.
 *
 * Les variables CSS ne se résolvent pas en jsdom · le contraste et la
 * complétude des palettes sont gardés sur `tokens.css` lui-même
 * (`packages/core/test/a4a-themes.test.ts`).
 */
const etat: { cookie: string | undefined } = { cookie: undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === THEME_COOKIE && etat.cookie !== undefined ? { name: n, value: etat.cookie } : undefined) }),
  headers: async () => new Headers(),
}));

const { default: RootLayout, generateViewport } = await import('../app/layout');
const { appliquerTheme, basculerTheme, themeCourant } = await import('../lib/theme-preference');

async function htmlRendu(): Promise<string> {
  return renderToString(await RootLayout({ children: <p>contenu</p> }));
}
const attributTheme = (html: string) => /<html\b[^>]*\bdata-theme="([^"]*)"/.exec(html)?.[1] ?? null;

afterEach(() => { etat.cookie = undefined; });

describe('layout racine · data-theme posé au rendu serveur', () => {
  it('sans cookie · sombre', async () => {
    const html = await htmlRendu();
    expect(attributTheme(html), 'le thème par défaut doit être sombre').toBe('sombre');
    expect(html).toContain('lang="fr"');
    expect(html).toContain('contenu');
  });

  it('cookie « clair » · clair', async () => {
    etat.cookie = 'clair';
    expect(attributTheme(await htmlRendu()), 'le cookie clair doit poser data-theme="clair"').toBe('clair');
  });

  for (const invalide of ['sombre', '', 'CLAIR', 'light', '<script>', 'clair%20']) {
    it(`cookie ${JSON.stringify(invalide)} · sombre`, async () => {
      etat.cookie = invalide;
      expect(attributTheme(await htmlRendu()), `valeur ${JSON.stringify(invalide)} acceptée`).toBe('sombre');
    });
  }

  it('la barre du navigateur suit le thème', async () => {
    expect((await generateViewport()).themeColor).toBe('#120810');
    etat.cookie = 'clair';
    expect((await generateViewport()).themeColor).toBe('#fbf5f6');
    const v = await generateViewport();
    expect(v.width).toBe('device-width');
    expect(v.initialScale).toBe(1);
  });
});

describe('bascule client · cookie, attribut, barre', () => {
  afterEach(() => {
    document.cookie = `${THEME_COOKIE}=; Max-Age=0; Path=/`;
    document.documentElement.removeAttribute('data-theme');
    document.head.innerHTML = '';
  });

  it('appliquerTheme pose les trois d’un coup', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#120810">';
    document.documentElement.setAttribute('data-theme', 'sombre');
    expect(appliquerTheme('clair')).toBe('clair');
    expect(document.documentElement.getAttribute('data-theme')).toBe('clair');
    expect(document.cookie).toContain(`${THEME_COOKIE}=clair`);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#fbf5f6');
  });

  it('basculerTheme alterne et part du thème posé', () => {
    document.documentElement.setAttribute('data-theme', 'sombre');
    expect(basculerTheme()).toBe('clair');
    expect(themeCourant()).toBe('clair');
    expect(basculerTheme()).toBe('sombre');
    expect(document.documentElement.getAttribute('data-theme')).toBe('sombre');
    expect(document.cookie).toContain(`${THEME_COOKIE}=sombre`);
  });
});

describe('barre de défilement · en jetons', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
  const regles = css.match(/(?:html\s*\{[^}]*scrollbar[^}]*\}|::-webkit-scrollbar[^{]*\{[^}]*\})/g) ?? [];

  it('aucune règle de barre ne porte de couleur littérale', () => {
    expect(regles.length, 'règles de barre introuvables').toBeGreaterThanOrEqual(4);
    for (const r of regles) expect(r, `couleur littérale dans « ${r.split('{')[0]!.trim()} »`).not.toMatch(/rgba?\(|#[0-9a-f]{3,8}\b/i);
    expect(css).toMatch(/scrollbar-color:\s*var\(--scroll-thumb-thin\)\s+transparent/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*var\(--scroll-thumb\)/);
  });
});
