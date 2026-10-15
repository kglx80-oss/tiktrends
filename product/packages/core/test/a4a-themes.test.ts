import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  THEME_COOKIE, THEME_DEFAUT, themeDepuisCookie, themeOppose, themeCookieString, COULEUR_BARRE,
  contrasteCouleurs, lireCouleurCss, composer, ratioContraste,
  PALETTES_THEME, palettesDepuisCss, jetonsDeCouleur, mesurerPalette, PAIRES_THEME, SEUILS_CONTRASTE,
} from '../src/index';

/**
 * V5 · A4a · socle des thèmes, au RÉSULTAT.
 *
 *  1. la préférence · le cookie décide du thème, tout ce qui n'est pas
 *     exactement « clair » vaut sombre ;
 *  2. le contraste · `contrasteCouleurs` rend le rapport WCAG 2, transparence
 *     comprise, sans arrondi qui ferait passer un 4,496 ;
 *  3. `packages/ui/tokens.css` · on relit le VRAI fichier, on reconstitue les
 *     quatre palettes telles que le navigateur les résout, et :
 *       · chaque jeton de couleur du sombre est redéclaré en clair, en ADMIN+
 *         sombre et en ADMIN+ clair (sinon une valeur sombre fuit) ;
 *       · chaque paire déclarée (`PAIRES_THEME`) passe son seuil dans chaque
 *         palette · 4,5:1 texte, 3:1 bordure de contrôle et anneau de focus ;
 *       · le sombre reste celui de main (valeurs historiques clouées) ;
 *       · la couleur de barre du navigateur suit `--bg`.
 */
const CSS = readFileSync(join(__dirname, '../../ui/tokens.css'), 'utf8');
const { declarees, effectives } = palettesDepuisCss(CSS);

describe('préférence de thème · cookie tt_theme', () => {
  it('seule la valeur exacte « clair » vaut clair · le défaut est sombre', () => {
    expect(THEME_DEFAUT).toBe('sombre');
    expect(themeDepuisCookie('clair')).toBe('clair');
    for (const v of [undefined, null, '', 'sombre', 'CLAIR', ' clair', 'light', 'dark', 'clair;', '1']) {
      expect(themeDepuisCookie(v), `valeur ${JSON.stringify(v)}`).toBe('sombre');
    }
  });

  it('la bascule passe d’un thème à l’autre', () => {
    expect(themeOppose('sombre')).toBe('clair');
    expect(themeOppose('clair')).toBe('sombre');
  });

  it('le cookie dure un an, vaut pour tout le site et reste hors requêtes tierces', () => {
    for (const t of ['clair', 'sombre'] as const) {
      const c = themeCookieString(t);
      expect(c.startsWith(`${THEME_COOKIE}=${t};`)).toBe(true);
      expect(c).toContain('path=/');
      expect(c).toContain(`max-age=${60 * 60 * 24 * 365}`);
      expect(c.toLowerCase()).toContain('samesite=lax');
      // relu par la règle du serveur, la valeur posée redonne le même thème
      expect(themeDepuisCookie(c.split(';')[0]!.split('=')[1])).toBe(t);
    }
  });
});

describe('contrasteCouleurs · règle pure', () => {
  it('rend les bornes et des valeurs de référence', () => {
    expect(contrasteCouleurs('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrasteCouleurs('#000', '#000')).toBeCloseTo(1, 5);
    expect(contrasteCouleurs('#777777', '#ffffff')).toBeCloseTo(4.48, 2); // le gris qui échoue AA de peu
    expect(contrasteCouleurs('#ffffff', '#c8295f')).toBeCloseTo(5.33, 2);
  });

  it('est symétrique et rejoint la mesure historique sur des couleurs opaques', () => {
    for (const [a, b] of [['#f6eef4', '#1c121b'], ['#9a8a98', '#2a1826'], ['#3b82f6', '#2a1826']] as const) {
      expect(contrasteCouleurs(a, b)).toBeCloseTo(contrasteCouleurs(b, a), 10);
      expect(Math.abs(contrasteCouleurs(a, b) - ratioContraste(a, b))).toBeLessThan(0.006);
    }
  });

  it('compose la transparence sur le fond avant de mesurer', () => {
    expect(lireCouleurCss('rgba(255,255,255,0.12)')).toEqual([255, 255, 255, 0.12]);
    expect(lireCouleurCss('#ffffff1f')[3]).toBeCloseTo(0x1f / 255, 5);
    // un trait blanc à 12 % sur #120810 = la couleur composée, opaque
    const [r, g, b] = composer('rgba(255,255,255,0.12)', '#120810');
    const opaque = `rgb(${r},${g},${b})`;
    expect(contrasteCouleurs('rgba(255,255,255,0.12)', '#120810')).toBeCloseTo(contrasteCouleurs(opaque, '#120810'), 10);
    expect(contrasteCouleurs('rgba(255,255,255,0.12)', '#120810')).toBeLessThan(contrasteCouleurs('#ffffff', '#120810'));
  });

  it('n’arrondit pas · 4,496 reste sous 4,5', () => {
    // #767676 sur blanc = 4,54 ; #777777 = 4,48 · la frontière se joue au centième
    expect(contrasteCouleurs('#767676', '#ffffff')).toBeGreaterThanOrEqual(SEUILS_CONTRASTE.texte);
    expect(contrasteCouleurs('#777777', '#ffffff')).toBeLessThan(SEUILS_CONTRASTE.texte);
  });

  it('refuse une couleur illisible plutôt que de mesurer n’importe quoi', () => {
    expect(() => lireCouleurCss('var(--ink)')).toThrow(/illisible/);
  });
});

describe('tokens.css · quatre palettes complètes', () => {
  const couleurs = jetonsDeCouleur(declarees.sombre);

  it('le sombre déclare les rôles historiques ET les rôles V5', () => {
    for (const j of ['bg', 'surface', 'rail', 'paper', 'ink', 'ink-2', 'muted', 'line', 'line-2', 'accent', 'accent-strong', 'accent-soft', 'on-accent', 'grad-accent', 'ok', 'warn', 'err', 'info', 'sh-sm', 'sh-card', 'sh-lift',
      'surface-raised', 'hover', 'selected', 'ok-text', 'err-text', 'accent-10', 'accent-28', 'line-strong', 'voile', 'voile-fort', 'voile-media', 'scroll-thumb', 'scroll-thumb-hover', 'scroll-thumb-thin']) {
      expect(couleurs, `jeton --${j} absent du sombre`).toContain(j);
    }
  });

  for (const p of ['clair', 'admin-sombre', 'admin-clair'] as const) {
    it(`chaque jeton de couleur du sombre est redéclaré en ${p}`, () => {
      const manquants = couleurs.filter((j) => !(j in declarees[p]));
      expect(manquants, `jetons non redéclarés en ${p} · la valeur sombre fuirait`).toEqual([]);
    });
  }

  it('le clair déclare color-scheme: light', () => {
    expect(CSS).toMatch(/:root\[data-theme="clair"\]\s*\{[^}]*color-scheme:\s*light/);
  });

  it('le sombre reste celui de main (valeurs historiques)', () => {
    expect(declarees.sombre).toMatchObject({
      bg: '#120810', surface: '#1c121b', rail: '#0d070c', paper: '#2a1826',
      ink: '#f6eef4', 'ink-2': '#cbbcc7', muted: '#9a8a98',
      line: 'rgba(255,255,255,0.12)', 'line-2': 'rgba(255,255,255,0.20)',
      accent: '#fe2c55', 'accent-strong': '#ff5c8a', 'accent-soft': '#2a1320', 'on-accent': '#120810',
      'grad-accent': 'linear-gradient(135deg, #fe2c55 0%, #ff2d8f 100%)',
      ok: '#18cc8c', warn: '#f5a623', err: '#ff4d6d', info: '#3b82f6',
      'sh-sm': '0 1px 2px rgba(0,0,0,0.45)', 'sh-card': '0 2px 12px rgba(0,0,0,0.40)', 'sh-lift': '0 14px 34px -10px rgba(0,0,0,0.60)',
      // littéraux d'aujourd'hui, promus en rôles sans changer de valeur
      'ok-text': '#7ee8bf', 'err-text': '#ff9db0',
    });
  });

  it('l’accent clair porte un texte blanc (V5 #c8295f)', () => {
    expect(effectives.clair.accent).toBe('#c8295f');
    expect(effectives.clair['on-accent']).toBe('#ffffff');
  });

  it('ADMIN+ remappe les rôles créatifs sur bleu nuit / menthe', () => {
    expect(effectives['admin-sombre']).toMatchObject({ bg: '#0b1922', accent: '#90e0c2', 'on-accent': '#0a2026' });
    expect(effectives['admin-clair']).toMatchObject({ bg: '#f1f7f6', accent: '#0e6f57', 'on-accent': '#ffffff' });
  });

  it('la barre du navigateur suit --bg', () => {
    expect(COULEUR_BARRE.sombre).toBe(effectives.sombre.bg);
    expect(COULEUR_BARRE.clair).toBe(effectives.clair.bg);
  });
});

describe('tokens.css · contraste de chaque paire déclarée, dans chaque palette', () => {
  for (const p of PALETTES_THEME) {
    it(`palette ${p} · aucune paire sous son seuil`, () => {
      const echecs = mesurerPalette(p, effectives[p]).filter((m) => !m.ok)
        .map((m) => `contraste insuffisant · ${p} · --${m.dessus} sur --${m.fond} · ${m.ratio.toFixed(2)} < ${m.seuil} (${m.usage})`);
      expect(echecs).toEqual([]);
    });
  }

  it('les paires couvrent texte, statuts, accent plein, dégradé, bordures et focus', () => {
    expect(PAIRES_THEME.length).toBeGreaterThan(40);
    expect(PAIRES_THEME.some((q) => q.fond === 'grad-accent')).toBe(true);
    expect(PAIRES_THEME.some((q) => q.dessus === 'line-strong' && q.nature === 'interface')).toBe(true);
  });
});
