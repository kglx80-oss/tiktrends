import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { RAYONS } from '@tiktrends/core';
import { surface, tuile, vide, panel, cadreSignal, Msg } from '../components/ui';

/**
 * Lot 19D · le RENDU des cadres partagés porte la bordure et le rayon de son
 * rôle (charte · `--line` 12 % cadres, `--line-2` 20 % contrôles, `--r-card`
 * 20, `--r-md` 12). Mesuré avant (`98fd2d64`, 37 routes à 1440) · 263 cadres
 * sur 291 hors de leur rôle · rayons 10 à 24 et `--line-2` sur des panneaux.
 *
 * On rend le composant et on LIT le HTML · pas la présence d'un appel.
 *
 * V5 · T1 · les bordures de `signal` (Empty good, Bandeau, Msg) ne portent
 * plus un `rgba(...)` littéral mais la teinte d'un rôle · `teinte('ok-text',
 * .4)` rend `color-mix(in srgb, var(--ok-text) 40%, transparent)`, qui suit le
 * thème. Le rayon, lui, ne change pas.
 */
const html = (s: React.CSSProperties) => renderToStaticMarkup(<div style={s} />);

describe('lot 19D · styles partagés, rendus', () => {
  it('surface · --line, rayon de carte', () => {
    expect(html(surface)).toBe('<div style="border:1px solid var(--line);border-radius:var(--r-card)"></div>');
  });
  it('tuile · --line, rayon moyen', () => {
    expect(html(tuile)).toBe('<div style="border:1px solid var(--line);border-radius:var(--r-md)"></div>');
  });
  it('vide · pointillé --line-2, rayon de carte', () => {
    expect(html(vide)).toBe('<div style="border:1px dashed var(--line-2);border-radius:var(--r-card)"></div>');
  });
  it('panel = surface (plus fond et respiration)', () => {
    const h = html(panel);
    expect(h).toContain('border:1px solid var(--line);border-radius:var(--r-card)');
    expect(h, 'le panneau a repris la bordure des contrôles').not.toContain('--line-2');
  });
  it('cadreSignal · garde sa couleur, prend le rayon de son niveau', () => {
    expect(html(cadreSignal('rgba(1,2,3,.4)'))).toBe('<div style="border:1px solid rgba(1,2,3,.4);border-radius:var(--r-card)"></div>');
    expect(html(cadreSignal('rgba(1,2,3,.4)', 'tuile'))).toBe('<div style="border:1px solid rgba(1,2,3,.4);border-radius:var(--r-md)"></div>');
  });
});

describe('lot 19D · composants partagés, rendus', () => {
  it('Msg · `signal` au rayon d’une surface', () => {
    const h = renderToStaticMarkup(<Msg kind="ok">fait</Msg>);
    expect(h).toContain('border:1px solid color-mix(in srgb, var(--ok) 40%, transparent);border-radius:var(--r-card)');
  });
});

describe('lot 19D · la charte et le noyau disent les mêmes rayons', () => {
  const css = readFileSync(join(process.cwd(), '..', '..', 'packages', 'ui', 'tokens.css'), 'utf8');
  const px = (nom: string) => Number(new RegExp(`--${nom}:\\s*(\\d+)px`).exec(css)?.[1]);
  it('--r-card = RAYONS.carte, --r-md = RAYONS.moyen', () => {
    expect(px('r-card')).toBe(RAYONS.carte);
    expect(px('r-md')).toBe(RAYONS.moyen);
  });
});
