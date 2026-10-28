import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CIBLE_TEXTE_CLAIR, COULEUR_BARRE_SPATIALE, ENCRE_CLAIRE, PALETTE_CLAIRE_SPATIALE, PAPIER_CLAIR,
  assombrirPourTexte, contrasteCouleurs, deriverThemeClairCss, estNeutre, fondsClairsPireCas, inverserNeutre, mesurerThemeClair,
} from '../src';

const SPATIAL = readFileSync(join(__dirname, '..', '..', '..', 'apps', 'web', 'spatial', 'spatial.css'), 'utf8');

/**
 * Spatial · thème clair · contrastes MESURÉS (28/10/2026), pire cas · créa
 * NOIRE sous le voile, fenêtre `--glass` #ffffffcc (fond résolu ≈ #dfdfe0),
 * tuile `--glass2` #ffffff99 (≈ #f2f2f2), bouton `--glass3` (≈ #d0d1d2).
 *
 * | texte                         | fenêtre | tuile | bouton |
 * | ----------------------------- | ------- | ----- | ------ |
 * | --fg #0b1220                  | 14,09   | 16,77 | 12,23  |
 * | --fg2 #0b1220d1               |  8,98   | 10,15 |  8,11  |
 * | --fg3 #0b1220ad               |  5,72   |  6,19 |  5,34  |
 * | --good #0d6c37                |  4,91   |  5,85 |  ·     |
 * | --chg #006297                 |  4,95   |  5,89 |  ·     |
 * | --warn #845300                |  4,91   |  5,84 |  ·     |
 * | --bad #bf0000                 |  4,91   |  5,85 |  ·     |
 * | accent de section (pire, 40 %)|  4,93   |  5,87 |  ·     |
 *
 * Le pire accent est le bleu ciel de Jarvis (#8fd8ff) mêlé à 40 % à l'encre.
 * Les statuts sont assombris à 6,5:1 sur blanc pour tenir 4,5 sur la fenêtre
 * au pire cas · un statut n'est jamais écrit sur un bouton neutre.
 */
describe('Spatial · thème clair · contrastes mesurés', () => {
  const mesures = mesurerThemeClair();

  it('chaque paire principale passe AA (4,5:1) au pire cas', () => {
    expect(mesures.filter((m) => !m.ok).map((m) => `${m.texte} sur ${m.fond} · ${m.ratio.toFixed(2)}`)).toEqual([]);
  });

  it('le tableau écrit est celui mesuré (au centième)', () => {
    const r = (t: string, f: string) => mesures.find((m) => m.texte === t && m.fond === f)!.ratio.toFixed(2);
    expect([r('--fg', 'fenetre'), r('--fg2', 'fenetre'), r('--fg3', 'fenetre'), r('--fg3', 'tuile'), r('--fg3', 'bouton')]).toEqual(['14.09', '8.98', '5.72', '6.19', '5.34']);
    expect([r('--good', 'fenetre'), r('--chg', 'fenetre'), r('--warn', 'fenetre'), r('--bad', 'fenetre')]).toEqual(['4.91', '4.95', '4.91', '4.91']);
    const accents = mesures.filter((m) => m.texte.startsWith('accent') && m.fond === 'fenetre');
    expect(Math.min(...accents.map((m) => m.ratio)).toFixed(2)).toBe('4.93');
    expect(fondsClairsPireCas().fenetre).toMatch(/^rgb\(223\./);
  });

  it('la barre du navigateur suit le thème · le fond de la maquette en sombre, le papier en clair', () => {
    expect(COULEUR_BARRE_SPATIALE).toEqual({ sombre: '#0b1220', clair: PAPIER_CLAIR });
    expect(PALETTE_CLAIRE_SPATIALE.ink).toBe(PAPIER_CLAIR);
  });
});

describe('Spatial · thème clair · la dérivation', () => {
  it('un neutre s’inverse le long de l’axe encre ↔ papier, alpha gardé', () => {
    expect(inverserNeutre('#fff')).toBe(ENCRE_CLAIRE);
    expect(inverserNeutre('#ffffff1a')).toBe(`${ENCRE_CLAIRE}1a`);
    expect(inverserNeutre('#0b1220b3')).toBe(`${PAPIER_CLAIR}b3`);
    expect(estNeutre('#1b2433e6')).toBe(true);
    expect(estNeutre('#7ef0b0')).toBe(false);
    expect(estNeutre('#032a1e')).toBe(false);
  });

  it('un pastel posé en texte descend jusqu’à la cible sur blanc, même teinte', () => {
    const v = assombrirPourTexte('#7ef0b0');
    expect(contrasteCouleurs(v, '#ffffff')).toBeGreaterThanOrEqual(CIBLE_TEXTE_CLAIR);
    expect(contrasteCouleurs(v, '#ffffff')).toBeLessThan(CIBLE_TEXTE_CLAIR + 0.1);
    expect(assombrirPourTexte('#032a1e')).toBe('#032a1e');
  });

  const clair = deriverThemeClairCss(SPATIAL);
  const regle = (sel: string) => clair.split('\n').find((l) => l.startsWith(`html[data-theme="clair"] ${sel}{`));

  it('un texte blanc devient encre, un fond blanc plein devient encre et son texte papier (bouton principal neutre)', () => {
    expect(regle('.btn.pri')).toBe('html[data-theme="clair"] .btn.pri{background:#0b1220;color:var(--ink);border-color:#0b1220}');
    expect(regle('.dots b')).toBe('html[data-theme="clair"] .dots b{background:#0b1220}');
  });

  it('les longues d’un raccourci suivent (titre en dégradé · `background-clip:text` repris)', () => {
    expect(regle('.top h1')).toContain('-webkit-background-clip:text;background-clip:text;color:transparent');
  });

  it('une ombre portée reste sombre (alpha ÷ 2), un reflet intérieur reste tel quel, un anneau suit les bordures', () => {
    expect(regle('.rail .badge')).toBe(`html[data-theme="clair"] .rail .badge{background:var(--good);box-shadow:0 0 0 2px ${PAPIER_CLAIR}}`);
    expect(regle('.node')).toContain('box-shadow:0 14px 30px -18px #00000066');
    expect(regle('.tg i')).toBe('html[data-theme="clair"] .tg i{background:#0b1220;box-shadow:0 2px 6px #00000033}');
  });

  it('un accent de section posé en texte est mêlé à l’encre · posé en fond, il reste vif', () => {
    expect(regle('.rvlead b')).toBe('html[data-theme="clair"] .rvlead b{color:color-mix(in srgb,var(--acc) 40%,#0b1220)}');
  });

  it('les créas ne suivent jamais le thème · les accents par adresse passent après, tels quels', () => {
    expect(clair).not.toMatch(/ \.ad[{ .:]/);
    expect(clair).not.toContain('#c4e6ef');
    const derniere = clair.trimEnd().split('\n').slice(-2, -1)[0]!;
    expect(derniere).toBe('html[data-theme="clair"] .qa2[data-route="veille"] .ico,html[data-theme="clair"] .qa2[data-route="jarvis"] .ico,html[data-theme="clair"] .qa2[data-route="importer"] .ico{color:#111}');
  });
});
