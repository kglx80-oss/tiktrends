import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { teinte, resoudreTeinte, lireCouleurCss, palettesDepuisCss, mesurerPalette, PAIRES_THEME, PALETTES_THEME } from '../src/index';

/**
 * V5 · T1 · tokenisation des composants partagés, au RÉSULTAT.
 *
 *  1. `teinte(jeton, part)` écrit le `color-mix` attendu, et ce mélange, résolu
 *     dans la palette SOMBRE, redonne exactement chaque `rgba(...)` que le lot a
 *     remplacé (le sombre ne bouge pas · complément des captures pixel à pixel) ;
 *  2. chaque rôle ajouté garde en sombre la valeur du littéral qu'il remplace ;
 *  3. les paires ajoutées passent leur seuil dans chaque palette où elles sont
 *     exigées, et une paire restreinte ne l'est que pour une dette sombre écrite.
 */
const CSS = readFileSync(join(__dirname, '../../ui/tokens.css'), 'utf8');
const { declarees, effectives } = palettesDepuisCss(CSS);

describe('teinte · règle pure', () => {
  it('écrit un color-mix sur le jeton, à la part donnée', () => {
    expect(teinte('err', 0.4)).toBe('color-mix(in srgb, var(--err) 40%, transparent)');
    expect(teinte('ok-text', 0.1)).toBe('color-mix(in srgb, var(--ok-text) 10%, transparent)');
    // un ancien suffixe hexadécimal `22` · 34/255
    expect(teinte('warn', 0x22 / 255)).toBe('color-mix(in srgb, var(--warn) 13.3333%, transparent)');
  });

  it('refuse un jeton ou une part illisible plutôt que d’écrire un CSS faux', () => {
    expect(() => teinte('--err', 0.4)).toThrow(/jeton illisible/);
    expect(() => teinte('err)', 0.4)).toThrow(/jeton illisible/);
    expect(() => teinte('err', 0)).toThrow(/part hors/);
    expect(() => teinte('err', 40)).toThrow(/part hors/);
  });
});

/** Chaque teinte posée par le lot, avec le littéral qu'elle remplace. */
const REMPLACEES: Array<[jeton: string, part: number, litteral: string]> = [
  ['err', 0.4, 'rgba(255,77,109,.4)'], ['err', 0.1, 'rgba(255,77,109,.10)'], ['err', 0.08, 'rgba(255,77,109,.08)'],
  ['err', 0.35, 'rgba(255,77,109,.35)'], ['err', 0.45, 'rgba(255,77,109,.45)'], ['err', 0.55, 'rgba(255,77,109,.55)'],
  ['ok', 0.4, 'rgba(24,204,140,.4)'], ['ok', 0.1, 'rgba(24,204,140,.10)'], ['ok', 0.08, 'rgba(24,204,140,.08)'], ['ok', 0.45, 'rgba(24,204,140,.45)'],
  ['warn', 0.4, 'rgba(245,166,35,.4)'], ['warn', 0.1, 'rgba(245,166,35,.10)'], ['warn', 0.08, 'rgba(245,166,35,.08)'],
  ['warn', 0.07, 'rgba(245,166,35,.07)'], ['warn', 0.3, 'rgba(245,166,35,.30)'], ['warn', 0.35, 'rgba(245,166,35,.35)'],
  ['ok-text', 0.4, 'rgba(126,232,191,.4)'], ['ok-text', 0.35, 'rgba(126,232,191,.35)'], ['ok-text', 0.18, 'rgba(126,232,191,.18)'],
  ['ok-text', 0.12, 'rgba(126,232,191,.12)'], ['ok-text', 0.1, 'rgba(126,232,191,.10)'],
  ['info-text', 0.08, 'rgba(122,162,255,.08)'], ['info-text', 0.3, 'rgba(122,162,255,.30)'], ['info', 0.1, 'rgba(59,130,246,.10)'],
  ['accent', 0.06, 'rgba(254,44,85,.06)'], ['accent', 0.07, 'rgba(254,44,85,.07)'], ['accent', 0.16, 'rgba(254,44,85,.16)'],
  ['accent', 0.35, 'rgba(254,44,85,.35)'], ['accent', 0.5, 'rgba(254,44,85,.5)'], ['accent-strong', 0.08, 'rgba(255,92,138,.08)'],
  ['ambre-strong', 0.5, 'rgba(255,202,107,.5)'],
  ['ombre', 0.35, 'rgba(0,0,0,.35)'], ['ombre', 0.5, 'rgba(0,0,0,.5)'], ['ombre', 0.55, 'rgba(0,0,0,.55)'], ['ombre', 0.6, 'rgba(0,0,0,.6)'],
  ['ombre', 0.7, 'rgba(0,0,0,.7)'], ['ombre', 0.8, 'rgba(0,0,0,.8)'],
  ['voile-teinte', 0.5, 'rgba(6,4,8,.5)'], ['voile-teinte', 0.55, 'rgba(6,4,8,.55)'], ['voile-teinte', 0.62, 'rgba(6,4,8,.62)'],
  ['sombre-fixe', 0.65, 'rgba(0,0,0,.65)'], ['sombre-fixe', 0.16, 'rgba(0,0,0,.16)'], ['clair-fixe', 0.22, 'rgba(255,255,255,.22)'],
  ['bg', 0.55, 'rgba(18,8,16,.55)'],
  // suffixes hexadécimaux d'hier (`${c}22`, `${c}66`, `${c}1a`)
  ['warn', 0x22 / 255, '#f5a62322'], ['info-text', 0x22 / 255, '#7aa2ff22'], ['ok', 0x22 / 255, '#18cc8c22'],
  ['warn', 0x66 / 255, '#f5a62366'], ['ok', 0x66 / 255, '#18cc8c66'], ['info', 0x66 / 255, '#3b82f666'],
  ['warn', 0x1a / 255, '#f5a6231a'], ['ok', 0x1a / 255, '#18cc8c1a'], ['info', 0x1a / 255, '#3b82f61a'],
];

describe('le sombre ne bouge pas · chaque teinte redonne le littéral remplacé', () => {
  it.each(REMPLACEES)('teinte(%s, %s) = %s', (jeton, part, litteral) => {
    const [r, g, b, a] = resoudreTeinte(effectives.sombre, jeton, part);
    const [R, G, B, A] = lireCouleurCss(litteral);
    expect([r, g, b]).toEqual([R, G, B]);
    // l'alpha peint est quantifié sur 8 bits · même octet
    expect(Math.round(a * 255)).toBe(Math.round(A * 255));
  });
});

describe('tokens.css · rôles T1', () => {
  it('chaque rôle ajouté garde en sombre la valeur du littéral qu’il remplace', () => {
    expect(declarees.sombre).toMatchObject({
      'warn-text': '#ffcf8f', 'warn-strong': '#f5b043', 'info-text': '#7aa2ff', fatigue: '#ff8c42', 'accent-fin': '#ff2d8f',
      ombre: '#000000', 'voile-teinte': '#060408',
      'grad-ok': 'linear-gradient(90deg,#3ddc97,#7ee8bf)', 'grad-croissance': 'linear-gradient(135deg, #1f9d63, #16794c)',
      damier: 'repeating-conic-gradient(#3a2a37 0% 25%, #2a1826 0% 50%) 50% / 24px 24px',
      ambre: '#f5a623', 'ambre-strong': '#ffca6b', 'ambre-soft': '#2a2110',
      'grad-ambre': 'linear-gradient(135deg,#f5a623 0%,#ff8c42 100%)', 'bg-ambre': '#130d07',
      'clair-fixe': '#ffffff', 'sombre-fixe': '#000000', 'pastille-media': 'rgba(8,5,10,0.72)',
    });
  });

  it('les fixes ne suivent pas le thème · même valeur dans les quatre palettes', () => {
    for (const j of ['clair-fixe', 'sombre-fixe', 'pastille-media', 'voile-media']) {
      for (const p of PALETTES_THEME) expect(effectives[p][j], `--${j} en ${p}`).toBe(effectives.sombre[j]);
    }
  });

  it('en clair, ombre et voile s’allègent dans le rapport du clair existant', () => {
    // 0,33 × 0,6 ≈ 0,20 · le --sh-lift clair ; 0,45 × 0,62 ≈ 0,28 · le --voile clair
    expect(resoudreTeinte(effectives.clair, 'ombre', 0.6)[3]).toBeCloseTo(0.2, 2);
    expect(resoudreTeinte(effectives.clair, 'voile-teinte', 0.62)[3]).toBeCloseTo(0.28, 2);
  });

  it('chaque rôle de texte ajouté est mesuré · présent dans PAIRES_THEME', () => {
    const dessus = new Set(PAIRES_THEME.map((p) => p.dessus));
    for (const j of ['warn-text', 'warn-strong', 'info-text', 'ambre-strong']) expect(dessus.has(j), `--${j} sans paire mesurée`).toBe(true);
  });

  it('une paire restreinte l’est pour une dette sombre écrite, et passe ailleurs', () => {
    for (const p of PAIRES_THEME.filter((x) => x.palettes)) {
      expect(p.usage, `paire --${p.dessus}/--${p.fond} restreinte sans raison`).toMatch(/sombre/);
      expect(p.palettes).not.toContain('sombre');
      // la dette est RÉELLE · mesurée en sombre, sous le seuil (sinon la restriction est à retirer)
      const [m] = mesurerPalette('sombre', effectives.sombre, [{ ...p, palettes: undefined }]);
      expect(m!.ok, `--${p.dessus}/--${p.fond} passe en sombre · retirer la restriction`).toBe(false);
    }
  });
});
