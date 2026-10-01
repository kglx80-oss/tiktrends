import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { BORDURES, EXCEPTIONS_LECTURE, LECTURE } from '@tiktrends/core';
import { cadrePage, colonneLecture } from '../components/ui';

/**
 * B2 (#118) · TOUS les écrans de l'application posent le même cadre extérieur.
 *
 * Mesuré avant B2 (build de production, 1440) · neuf largeurs de cadre et le
 * titre de page de x=60 à x=234. Le cadre vit dans `cadrePage` (valeurs au
 * noyau) · ce garde parcourt chaque `page.tsx` et refuse une largeur extérieure
 * posée à la main, ou une lecture resserrée hors de la liste nommée au noyau.
 * La mesure en navigateur (recette B2) prouve le rendu ; ce garde empêche la
 * dérive de revenir.
 */
const APP = join(process.cwd(), 'app', '(app)');
const pages: string[] = [];
(function parcourir(d: string) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) parcourir(p);
    else if (n === 'page.tsx') pages.push(p);
  }
})(APP);
const routeDe = (p: string) => '/' + relative(APP, p).split(sep).slice(0, -1).join('/');

describe('B2 · le cadre extérieur commun, rendu', () => {
  it('cadrePage · 1200 au plus, centré, gouttières 32/16', () => {
    const h = renderToStaticMarkup(<main style={cadrePage} />);
    expect(h).toContain('max-width:1200px');
    expect(h).toContain('margin:0 auto');
    expect(h).toContain('clamp(16px, 4vw, 32px)');
  });
  it('colonneLecture · resserre sans recentrer (pas de margin auto)', () => {
    const h = renderToStaticMarkup(<div style={colonneLecture('formulaire')} />);
    expect(h).toBe(`<div style="max-width:${LECTURE.formulaire}px"></div>`);
  });
});

describe('B2 · chaque écran pose cadrePage, sans largeur extérieure à la main', () => {
  it('on parcourt bien tous les écrans', () => {
    expect(pages.length).toBeGreaterThanOrEqual(45);
  });
  for (const p of pages) {
    const route = routeDe(p);
    const src = readFileSync(p, 'utf8');
    it(route, () => {
      const mains = [...src.matchAll(/<main style=\{([^\n]*?)\}>/g)].map((m) => m[1]!);
      // Tout <main> doit être lu par ce garde · une écriture qu'il ne reconnaît pas passerait en silence.
      expect(mains.length, `${route} · un <main> échappe au garde`).toBe((src.match(/<main\b/g) ?? []).length);
      for (const s of mains) {
        expect(s, `${route} · <main> pose sa propre largeur`).not.toMatch(/maxWidth/);
        expect(s === 'wrap' || /cadrePage/.test(s), `${route} · <main style={${s}}> n'utilise pas cadrePage`).toBe(true);
      }
      if (mains.includes('wrap')) {
        const def = /const wrap = ([^;]*);/.exec(src)?.[1] ?? '';
        expect(def, `${route} · wrap ne vient pas de cadrePage`).toMatch(/^(cadrePage|\{ \.\.\.cadrePage[^}]*\})$/);
        expect(def, `${route} · wrap repose une largeur extérieure`).not.toMatch(/maxWidth|padding/);
      }
      const lectures = [...src.matchAll(/colonneLecture\('(\w+)'\)/g)].map((m) => m[1]!);
      for (const l of lectures) {
        expect(EXCEPTIONS_LECTURE[route], `${route} · lecture resserrée sans exception nommée au noyau`).toBeDefined();
        expect(l, `${route} · lecture « ${l} » ≠ exception nommée`).toBe(EXCEPTIONS_LECTURE[route]!.lecture);
      }
    });
  }
  it('chaque exception nommée au noyau existe encore comme écran', () => {
    const routes = new Set(pages.map(routeDe));
    for (const r of Object.keys(EXCEPTIONS_LECTURE)) expect(routes.has(r), r).toBe(true);
  });
});

describe('B2 · les bordures de la charte · jetons', () => {
  const css = readFileSync(join(process.cwd(), '..', '..', 'packages', 'ui', 'tokens.css'), 'utf8');
  const alpha = (nom: string) => Number(new RegExp(`--${nom}:\\s*rgba\\(255,255,255,([0-9.]+)\\)`).exec(css)?.[1]);
  it('--line = cadre 12 %, --line-2 = contrôle 20 %', () => {
    expect(alpha('line')).toBe(BORDURES.cadre);
    expect(alpha('line-2')).toBe(BORDURES.controle);
  });
});
