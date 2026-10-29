import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CIBLE_TEXTE_CLAIR, COULEUR_BARRE_SPATIALE, ENCRE_CLAIRE, PALETTE_CLAIRE_SPATIALE, PAPIER_CLAIR,
  PART_FOND_SURCOUCHE, assombrirPourTexte, contrasteCouleurs, fantomeSousSurcouche, deriverThemeClairCss, estNeutre, fondsClairsPireCas, inverserNeutre, mesurerThemeClair,
  COULEURS_EN_LIGNE, INK_MAQUETTE, PASTILLES_TEINTE_EN_LIGNE, PART_TEINTE_FOND_VIF, couleurEnLigneClaire, mesurerPastillesClaires, accentTexteClair, ACCENTS_SECTION,
} from '../src';

const SPATIAL = readFileSync(join(__dirname, '..', '..', '..', 'apps', 'web', 'spatial', 'spatial.css'), 'utf8');

/**
 * Spatial · thème clair · contrastes MESURÉS (29/10/2026, cible des textes
 * saturés 7,5:1 sur blanc · elle était à 6,5), pire cas · créa
 * NOIRE sous le voile, fenêtre `--glass` #ffffffcc (fond résolu ≈ #dfdfe0),
 * tuile `--glass2` #ffffff99 (≈ #f2f2f2), bouton `--glass3` (≈ #d0d1d2).
 *
 * | texte                         | fenêtre | tuile | bouton |
 * | ----------------------------- | ------- | ----- | ------ |
 * | --fg #0b1220                  | 14,09   | 16,77 | 12,23  |
 * | --fg2 #0b1220d1               |  8,98   | 10,15 |  8,11  |
 * | --fg3 #0b1220ad               |  5,72   |  6,19 |  5,34  |
 * | --good #0b6131                |  5,71   |  6,79 |  ·     |
 * | --chg #005989                 |  5,66   |  6,74 |  ·     |
 * | --warn #774b00                |  5,66   |  6,74 |  ·     |
 * | --bad #ae0000                 |  5,64   |  6,72 |  ·     |
 * | accent de section (pire, 40 %)|  4,93   |  5,87 |  ·     |
 * | baisse en ligne #ad001d       |  5,65   |  6,73 |  ·     |
 *
 * Le pire accent est le bleu ciel de Jarvis (#8fd8ff) mêlé à 40 % à l'encre.
 * Un statut n'est jamais écrit sur un bouton neutre · son pire fond est sa
 * PASTILLE (12 % de sa teinte) sur une tuile teintée à 26 % par l'accent ·
 *
 * | cible sur blanc | pire pastille (rouge sur tuile rose) | banc (« Faible », Analytics) |
 * | --------------- | ------------------------------------ | ---------------------------- |
 * | 6,5 (avant)     | 4,09 · sous AA                       | 4,17                         |
 * | 7,5             | 4,70                                 | 4,78                         |
 */
describe('Spatial · thème clair · contrastes mesurés', () => {
  const mesures = mesurerThemeClair();

  it('chaque paire principale passe AA (4,5:1) au pire cas', () => {
    expect(mesures.filter((m) => !m.ok).map((m) => `${m.texte} sur ${m.fond} · ${m.ratio.toFixed(2)}`)).toEqual([]);
  });

  it('le tableau écrit est celui mesuré (au centième)', () => {
    const r = (t: string, f: string) => mesures.find((m) => m.texte === t && m.fond === f)!.ratio.toFixed(2);
    expect([r('--fg', 'fenetre'), r('--fg2', 'fenetre'), r('--fg3', 'fenetre'), r('--fg3', 'tuile'), r('--fg3', 'bouton')]).toEqual(['14.09', '8.98', '5.72', '6.19', '5.34']);
    expect([r('--good', 'fenetre'), r('--chg', 'fenetre'), r('--warn', 'fenetre'), r('--bad', 'fenetre')]).toEqual(['5.71', '5.66', '5.66', '5.64']);
    const accents = mesures.filter((m) => m.texte.startsWith('accent') && m.fond === 'fenetre');
    expect(Math.min(...accents.map((m) => m.ratio)).toFixed(2)).toBe('4.93');
    expect(fondsClairsPireCas().fenetre).toMatch(/^rgb\(223\./);
  });

  it('une pastille de statut sur une tuile teintée passe AA · à l’ancienne cible (6,5), non', () => {
    const pire = (c?: number) => Math.min(...mesurerPastillesClaires(c).map((m) => m.ratio)).toFixed(2);
    expect(mesurerPastillesClaires().filter((m) => !m.ok).map((m) => `${m.statut} sur ${m.section}`)).toEqual([]);
    expect([pire(), pire(6.5)]).toEqual(['4.70', '4.09']);
    expect(CIBLE_TEXTE_CLAIR).toBe(7.5);
  });

  it('les couleurs en ligne passent AA au pire cas (variation en baisse, accent écrit)', () => {
    const f = fondsClairsPireCas();
    expect(contrasteCouleurs(couleurEnLigneClaire('baisse'), f.fenetre).toFixed(2)).toBe('5.65');
    expect(Math.min(...Object.values(ACCENTS_SECTION).map(([a]) => contrasteCouleurs(accentTexteClair(a), f.fenetre)))).toBeGreaterThanOrEqual(4.5);
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
    const derniere = clair.trimEnd().split('\n').slice(-3, -2)[0]!;
    expect(derniere).toBe('html[data-theme="clair"] .qa2[data-route="veille"] .ico,html[data-theme="clair"] .qa2[data-route="jarvis"] .ico,html[data-theme="clair"] .qa2[data-route="importer"] .ico{color:#111}');
  });
});

describe('Spatial · thème clair · relevés D1 et D6 · la règle, pas une liste de sélecteurs', () => {
  const clair = deriverThemeClairCss(SPATIAL);
  const regle = (sel: string) => clair.split('\n').find((l) => l.startsWith(`html[data-theme="clair"] ${sel}{`));
  const regles = (sel: string) => clair.split('\n').filter((l) => l.startsWith(`html[data-theme="clair"] ${sel}{`));

  it('une encre posée sur un fond vif garde sa valeur sombre, `var(--ink)` compris (orbe de Jarvis, pastille « 21 j + »)', () => {
    expect(SPATIAL).toContain(`--ink:${INK_MAQUETTE}`);
    expect(regle('.orb'), 'orbe « J » · encre nuit sur l’arc-en-ciel, pas le papier').toContain(`;color:${INK_MAQUETTE};`);
    expect(regle('.scale')).toBe(`html[data-theme="clair"] .scale{background:#7ef0b0e6;color:${INK_MAQUETTE}}`);
    expect(regle('.nic.t-jarvis')).toContain(`color:${INK_MAQUETTE}`);
  });

  it('une pastille d’identité (teinte posée en ligne) garde son encre · nuit sur pastel, blanc sur aplat de marque', () => {
    expect(PASTILLES_TEINTE_EN_LIGNE).toEqual(['.av', '.savav', '.logo2']);
    expect(regle('.av')).toBe(`html[data-theme="clair"] .av{color:${INK_MAQUETTE}}`);
    expect(regle('.savav')).toBe(`html[data-theme="clair"] .savav{color:${INK_MAQUETTE}}`);
    expect(regle('.xh .av'), 'initiales des cartes de la Veille').toBe('html[data-theme="clair"] .xh .av{color:#25334a;box-shadow:0 0 0 2px #0b122030}');
    expect(regle('.logo2')).toBe('html[data-theme="clair"] .logo2{color:#fff}');
    // Une règle plus précise qui POSE un fond n'est plus une pastille · son encre suit le thème.
    expect(regle('.btn.pri')).toBe('html[data-theme="clair"] .btn.pri{background:#0b1220;color:var(--ink);border-color:#0b1220}');
  });

  it(`une teinte mêlée à moins de ${PART_TEINTE_FOND_VIF} % ou à du transparent n’est qu’un voile · le texte blanc posé dessus devient l’encre`, () => {
    expect(clair).toContain('html[data-theme="clair"] .dsec button.on,html[data-theme="clair"] .tn.on{background:color-mix(in srgb,var(--acc) 30%,transparent);color:#0b1220}');
    expect(regle('.tnr.on .tnb')).toBe('html[data-theme="clair"] .tnr.on .tnb{background:color-mix(in srgb,var(--acc) 22%,transparent);color:#0b1220}');
    expect(regle('.btabs button.on b')).toBe('html[data-theme="clair"] .btabs button.on b{background:color-mix(in srgb,var(--acc) 25%,transparent);color:#0b1220}');
    expect(regle('.vtr b'), 'libellés de scène de l’atelier Vidéo').toBe('html[data-theme="clair"] .vtr b{background:color-mix(in srgb,var(--acc) 28%,#0b12200a);color:#0b1220}');
    // Un accent OPAQUE reste un fond vif · son encre est gardée.
    expect(regles('.ico')).toContain('html[data-theme="clair"] .ico{background:linear-gradient(135deg,var(--acc),var(--acc2));color:var(--on)}');
    expect(regle('.tnr.on .tni')).toBe('html[data-theme="clair"] .tnr.on .tni{background:var(--tc,var(--acc));color:var(--on)}');
  });

  it('une variable de teinte (tag, dossier, étape) posée en texte se mêle à l’encre, repli compris', () => {
    expect(regle('.dfold')).toBe('html[data-theme="clair"] .dfold{background:color-mix(in srgb,var(--fc) 26%,transparent);color:color-mix(in srgb,var(--fc) 40%,#0b1220)}');
    expect(regle('.tni')).toContain('color:color-mix(in srgb,color-mix(in srgb,var(--tc,var(--acc)) 40%,#0b1220) 70%,#0b1220)');
    expect(regle('.stat2 .ring .pr')).toBe('html[data-theme="clair"] .stat2 .ring .pr{stroke:color-mix(in srgb,var(--q1,var(--acc)) 40%,#0b1220)}');
  });

  it('un fond vif remplacé par un verre neutre reçoit l’encre du thème · une règle vive plus tardive garde le dernier mot', () => {
    expect(regles('.feed .it .ico')).toEqual(['html[data-theme="clair"] .feed .it .ico{background:#0b12201f}', 'html[data-theme="clair"] .feed .it .ico{color:var(--fg)}']);
    const qa2 = clair.split('\n').map((l, i) => [l, i] as const).filter(([l]) => l.startsWith('html[data-theme="clair"] .qa2 .ico{'));
    expect(qa2.map(([l]) => l).at(-1)).toBe('html[data-theme="clair"] .qa2 .ico{background:linear-gradient(135deg,var(--q1,var(--acc)),var(--q2,var(--acc2)));color:#fff}');
  });

  it('les couleurs en ligne · dérivées par la règle de la feuille, posées sur body (où `--acc` est fixé par la section)', () => {
    expect(Object.keys(COULEURS_EN_LIGNE)).toEqual(['voile-carte', 'voile-verrou', 'baisse', 'acc']);
    expect(couleurEnLigneClaire('voile-carte')).toBe(inverserNeutre('#0d1424b3'));
    expect(couleurEnLigneClaire('voile-verrou')).toBe(`${PAPIER_CLAIR}cc`);
    expect(contrasteCouleurs(couleurEnLigneClaire('baisse'), '#ffffff')).toBeGreaterThanOrEqual(CIBLE_TEXTE_CLAIR);
    expect(couleurEnLigneClaire('acc')).toBe('color-mix(in srgb,var(--acc) 40%,#0b1220)');
    expect(clair.trimEnd().split('\n').at(-1)).toBe('html[data-theme="clair"] body{--clair-voile-carte:#ebeef3b3;--clair-voile-verrou:#eef1f6cc;--clair-baisse:#ad001d;--clair-acc:color-mix(in srgb,var(--acc) 40%,#0b1220)}');
    expect(() => couleurEnLigneClaire('inconnue')).toThrow(/inconnue/);
  });
});

describe('Spatial · pop-up profil · la page ne se lit plus au travers (G17)', () => {
  // Mesuré · le pire texte de la page (blanc en sombre, encre en clair) vu sous la
  // pop-up, sans flou · la maquette (#1b2433 à 85 %) 1,60 en sombre ; à 85 % de
  // --ink, 1,53 en sombre et 1,37 en clair · lisible ; à 96 %, 1,09 et 1,08.
  it('à 96 %, le fantôme reste sous 1,15:1 dans les deux thèmes · la maquette (85 %) dépassait 1,5', () => {
    expect(PART_FOND_SURCOUCHE).toBe(96);
    const sombre = fantomeSousSurcouche('#0b1220', '#ffffff'), clair = fantomeSousSurcouche(PAPIER_CLAIR, ENCRE_CLAIRE);
    expect([sombre.toFixed(2), clair.toFixed(2)]).toEqual(['1.09', '1.08']);
    expect(Math.max(sombre, clair)).toBeLessThan(1.15);
    expect(fantomeSousSurcouche('#1b2433', '#ffffff', 85).toFixed(2)).toBe('1.60');
  });
});
