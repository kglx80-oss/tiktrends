import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { cadrePage, h1 } from '../components/ui';

vi.mock('next/navigation', () => ({ usePathname: () => '/veille/scale' }));
const { Breadcrumb } = await import('../components/Breadcrumb');

/**
 * Lot 19 · même alignement sur chaque écran (mandat du 5/10).
 *
 * Mesuré au navigateur sur `98fd2d64` (43 routes, 1440 · 1280 · 390 × 720) ·
 * le bord du <main> et l'axe gauche du titre tombaient déjà au même endroit
 * partout (B2). Deux dérives restaient :
 *
 * | Mesure (1440)                        | Avant                                          |
 * | ------------------------------------ | ---------------------------------------------- |
 * | fil d'Ariane, premier maillon        | x = 220 · titre à 244 (24 px à gauche) · 1280 : 220 contre 216 |
 * | titre de page, taille · graisse      | 32/500 (charte) · 30/500 · 27/800 · 25/800 · 24/800 · 22/800 |
 * | titre, hauteur sous le fil           | 151 · 153 · 159 · 161 (marges hautes de 2, 8, 10 px écrites à la main) |
 *
 * Le fil prend donc l'axe du cadre de page, et chaque titre d'écran le jeton
 * `h1` de la charte, sans marge haute · le titre tombe au même endroit partout.
 */

describe('Lot 19 · le fil d’Ariane est sur l’axe du cadre de page', () => {
  it('même largeur, même gouttière, centré comme le <main>', () => {
    const html = renderToStaticMarkup(<Breadcrumb brandName="Neva" brandId="b1" brands={[{ id: 'b1', name: 'Neva' }]} />);
    const nav = /<nav[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';
    const main = renderToStaticMarkup(<main style={cadrePage} />);
    const de = (s: string, k: string) => new RegExp(`${k}:([^;"]*)`).exec(s)?.[1];
    expect(nav, 'le fil n’est pas rendu').not.toBe('');
    expect(de(nav, 'max-width'), 'largeur du fil ≠ largeur du cadre').toBe(de(main, 'max-width'));
    expect(de(nav, 'padding'), 'gouttière du fil ≠ gouttière du cadre').toBe(`0 ${de(main, 'padding')!.split(' ').slice(1, -1).join(' ')}`);
    expect(de(nav, 'margin'), 'le fil n’est pas centré comme le cadre').toMatch(/^\S+ auto /);
  });
});

/** Les écrans dont le titre n'est PAS un titre de page de l'application. */
const HORS_TITRE_DE_PAGE: Record<string, string> = {
  // Lot 19 · fichiers d'un autre propriétaire pendant ce lot (agents A, B) ou
  // interdits (admin/equipe) · traités à leur fusion.
  'admin/page.tsx': 'en-tête de l’espace ADMIN+ · fichier partagé avec le lot 19B',
  'admin/equipe/page.tsx': 'écran Équipe ADMIN+ · hors périmètre (consigne)',
  'jarvis/page.tsx': 'conversation · le titre est la question d’accueil (charte Jarvis)',
  'jarvis/sources/page.tsx': 'zone du lot 19B',
  'jarvis/error.tsx': 'zone du lot 19B',
  'saved/page.tsx': 'zone du lot 19C',
};

const APP = join(process.cwd(), 'app', '(app)');
const fichiers: string[] = [];
(function parcourir(d: string) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) parcourir(p);
    else if (/\.tsx$/.test(n)) fichiers.push(p);
  }
})(APP);
fichiers.push(join(process.cwd(), 'components', 'RenameMarque.tsx'));

describe('Lot 19 · chaque titre d’écran porte le jeton h1 de la charte', () => {
  it('le jeton · 28 → 32 px, graisse 500, aucune marge', () => {
    expect(renderToStaticMarkup(<h1 style={h1} />)).toBe('<h1 style="margin:0;font-size:clamp(28px, 4vw, 32px);font-weight:500;letter-spacing:-0.01em;color:var(--ink)"></h1>');
  });
  const avecTitre = fichiers.filter((f) => /<h1\b/.test(readFileSync(f, 'utf8')));
  it('on parcourt bien les écrans titrés', () => {
    expect(avecTitre.length).toBeGreaterThanOrEqual(30);
  });
  for (const f of avecTitre) {
    const nom = relative(APP, f).split(sep).join('/');
    if (HORS_TITRE_DE_PAGE[nom]) continue;
    it(nom, () => {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<h1\b([^>]*)>/g)) {
        const attrs = m[1]!;
        expect(attrs, `${nom} · <h1${attrs}> n’utilise pas le jeton h1`).toMatch(/style=\{(h1|\{ \.\.\.h1\b)/);
        expect(attrs, `${nom} · <h1> réécrit la taille, la graisse ou la marge haute du jeton`).not.toMatch(/fontSize|fontWeight|margin:|marginTop/);
      }
      // La rangée du titre ne repousse pas le titre vers le bas.
      for (const m of src.matchAll(/<div style=\{\{([^}]*)\}\}>\s*(?:<[A-Z]\w*[^>]*\/>\s*<div[^>]*>\s*)?<h1\b/g)) {
        expect(m[1], `${nom} · la rangée du titre pose une marge haute`).not.toMatch(/margin: '(?!0[ ']|0$)\d|marginTop: [1-9]/);
      }
    });
  }
});
