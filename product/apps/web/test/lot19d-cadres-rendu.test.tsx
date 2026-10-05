import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { RAYONS } from '@tiktrends/core';
import { surface, tuile, vide, panel, cadreSignal, Msg } from '../components/ui';
import { Empty } from '../components/Empty';
import { Bandeau } from '../components/Bandeau';
import { PageInfo } from '../components/PageInfo';

/**
 * Lot 19D · le RENDU des cadres partagés porte la bordure et le rayon de son
 * rôle (charte · `--line` 12 % cadres, `--line-2` 20 % contrôles, `--r-card`
 * 20, `--r-md` 12). Mesuré avant (`98fd2d64`, 37 routes à 1440) · 263 cadres
 * sur 291 hors de leur rôle · rayons 10 à 24 et `--line-2` sur des panneaux.
 *
 * On rend le composant et on LIT le HTML · pas la présence d'un appel.
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
  it('Empty todo · cadre `vide` (pointillé --line-2, r-card)', () => {
    const h = renderToStaticMarkup(<Empty tone="todo" title="Rien" action={{ label: 'Faire', href: '/x' }} />);
    expect(h).toContain('border:1px dashed var(--line-2);border-radius:var(--r-card)');
  });
  it('Empty wait · cadre `surface` (--line, r-card)', () => {
    const h = renderToStaticMarkup(<Empty tone="wait" title="Rien" />);
    expect(h).toContain('border:1px solid var(--line);border-radius:var(--r-card)');
  });
  it('Empty good · `signal` (sa couleur, r-card)', () => {
    const h = renderToStaticMarkup(<Empty tone="good" title="Rien" />);
    expect(h).toContain('border:1px solid rgba(126,232,191,.4);border-radius:var(--r-card)');
  });
  it('Bandeau · `signal` au rayon d’une surface', () => {
    const h = renderToStaticMarkup(<Bandeau ton="demo">Exemple</Bandeau>);
    expect(h).toContain('border:1px solid rgba(245,166,35,.30);border-radius:var(--r-card)');
  });
  it('Msg · `signal` au rayon d’une surface', () => {
    const h = renderToStaticMarkup(<Msg kind="ok">fait</Msg>);
    expect(h).toContain('border:1px solid rgba(24,204,140,.4);border-radius:var(--r-card)');
  });
  it('PageInfo · l’encart déplié est une `tuile` (--line, r-md), le déclencheur reste un contrôle', () => {
    const h = renderToStaticMarkup(<PageInfo>Aide.</PageInfo>);
    // Le déclencheur (pilule) garde la bordure des contrôles.
    expect(h).toMatch(/<summary[^>]*border:1px solid var\(--line-2\)/);
    // L'encart déplié · le cadre d'une tuile, plus la bordure des contrôles.
    const encart = /<div style="([^"]*position:absolute[^"]*)"/.exec(h)?.[1] ?? '';
    expect(encart, 'encart du mode d’emploi introuvable').not.toBe('');
    expect(encart).toContain('border:1px solid var(--line);border-radius:var(--r-md)');
    expect(encart, 'l’encart reprend la bordure des contrôles').not.toContain('--line-2');
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
