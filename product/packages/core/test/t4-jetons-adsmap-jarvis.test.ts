import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { palettesDepuisCss, mesurerPalette, PAIRES_ADSMAP_JARVIS, PAIRES_THEME, PALETTES_THEME, lireCouleurCss } from '../src/index';

/**
 * V5 · T4 · tokenisation d'Adsmap (Résultats) et de Jarvis, au RÉSULTAT.
 *
 * Les écrans ne portent plus de couleur littérale (cliquet ·
 * `apps/web/test/a4a-litteraux-cliquet.test.ts`). Ce qui garantit que le
 * SOMBRE n'a pas bougé · chaque rôle vaut, en sombre, exactement le littéral
 * qu'il remplace, et chaque teinte `color-mix(var(--x) N%, transparent)` part
 * d'un rôle dont la valeur sombre est la couleur de base de l'ancien
 * `rgba(r,g,b,N)`. Ce qui garantit le CLAIR · les quatre palettes déclarent
 * chaque rôle, et ses paires passent leur seuil dans chacune.
 */
const CSS = readFileSync(join(__dirname, '../../ui/tokens.css'), 'utf8');
const { declarees, effectives } = palettesDepuisCss(CSS);

/** Le littéral d'avant (main 70ab234), rôle par rôle · le sombre doit le rendre
 *  à l'identique. --grad-violet est À PART · ce lot l'assombrit exprès (fix). */
const AVANT: Record<string, string> = {
  'warn-text': '#ffcf8f', 'warn-strong': '#f5b043', 'err-strong': '#ff8095',
  'ok-pale': '#9fe6b3', 'ok-strong': '#3ddc97',
  'err-pale': '#ffb3c0', 'recul-text': '#ffb86b', 'info-pale': '#9fb4ff', signal: '#ff5a78',
  violet: '#7a5aff', 'violet-text': '#c9b8ff', 'violet-08': 'rgba(120,90,255,0.08)', 'violet-35': 'rgba(120,90,255,0.35)',
  'on-violet': '#ffffff', 'grad-ok-doux': 'linear-gradient(90deg,#4fd1a5,#7ee8bf)',
  'carte-noeud': '#4a4a52', 'voile-leger': 'rgba(0,0,0,0.35)', 'sh-tiroir': '-20px 0 50px -20px rgba(0,0,0,0.60)',
};

/** Les bases des anciens `rgba(r,g,b,a)` · désormais `color-mix` du rôle. */
const BASES_TEINTES: Record<string, string> = {
  'ok-text': '126,232,191', warn: '245,166,35', accent: '254,44,85', err: '255,77,109', signal: '255,90,120',
};

describe('T4 · le sombre reste celui de main', () => {
  it('chaque rôle T4 vaut, en sombre, le littéral qu’il remplace', () => {
    for (const [j, v] of Object.entries(AVANT)) expect(declarees.sombre[j], `--${j} en sombre`).toBe(v);
  });

  it('--grad-violet est la seule valeur sombre volontairement changée · assombrie pour que le blanc passe', () => {
    // le sombre de main était linear-gradient(135deg,#7a5aff,#e6007e), blanc à 4,45:1 · corrigé
    expect(declarees.sombre['grad-violet']).toBe('linear-gradient(135deg,#6848e0,#d10072)');
    expect(declarees.sombre['grad-violet']).not.toContain('#7a5aff');
  });

  it('--ok-sur-teinte n’existe plus · la pastille cochée lit désormais en --ok-text', () => {
    expect('ok-sur-teinte' in declarees.sombre).toBe(false);
  });

  it('chaque teinte color-mix part de la couleur de base de l’ancien rgba()', () => {
    for (const [j, rgb] of Object.entries(BASES_TEINTES)) {
      const [r, g, b, a] = lireCouleurCss(effectives.sombre[j]!);
      expect(`${r},${g},${b}`, `--${j} · base de teinte`).toBe(rgb);
      expect(a).toBe(1);
    }
  });
});

describe('T4 · le clair et ADMIN+ déclarent chaque rôle, à des valeurs mesurées', () => {
  for (const p of ['clair', 'admin-sombre', 'admin-clair'] as const) {
    it(`${p} · chaque rôle T4 est redéclaré`, () => {
      expect(Object.keys(AVANT).filter((j) => !(j in declarees[p]))).toEqual([]);
    });
  }

  it('le clair change bien les textes (sinon la valeur sombre, pâle, resterait sur fond clair)', () => {
    for (const j of ['warn-text', 'warn-strong', 'err-strong', 'ok-pale', 'err-pale', 'recul-text', 'info-pale', 'violet-text']) {
      expect(effectives.clair[j], `--${j} en clair`).not.toBe(AVANT[j]);
    }
  });

  it('les paires T4 sont déclarées et passent leur seuil dans les quatre palettes', () => {
    expect(PAIRES_ADSMAP_JARVIS.length).toBeGreaterThan(40);
    for (const q of PAIRES_ADSMAP_JARVIS) expect(PAIRES_THEME).toContain(q);
    for (const p of PALETTES_THEME) {
      const echecs = mesurerPalette(p, effectives[p], PAIRES_ADSMAP_JARVIS).filter((m) => !m.ok)
        .map((m) => `${p} · --${m.dessus} sur --${m.fond} · ${m.ratio.toFixed(2)} < ${m.seuil}`);
      expect(echecs).toEqual([]);
    }
  });
});
