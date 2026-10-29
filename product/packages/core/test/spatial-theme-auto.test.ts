// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  ATTRIBUT_PREFERENCE_THEME, COULEUR_BARRE, COULEUR_BARRE_SPATIALE, MEDIA_SYSTEME_CLAIR, PREFERENCES_THEME, PREFERENCE_THEME_DEFAUT,
  couleurBarreViewport, preferenceDepuisCookie, scriptThemeAuto, themeCookieString, themeDepuisCookie, themeResolu,
} from '../src';

/**
 * Le thème « Auto » (suit `prefers-color-scheme`) · règles pures et script de
 * `<head>` (`scriptThemeAuto`), EXÉCUTÉ ici en jsdom avec un `matchMedia`
 * simulé · on lit le `data-theme` et la barre du navigateur qu'il pose, pas la
 * présence d'un appel.
 */

describe('préférence · cookie tt_theme', () => {
  it('trois choix, sombre par défaut (comportement inchangé)', () => {
    expect(PREFERENCES_THEME).toEqual(['sombre', 'clair', 'auto']);
    expect(PREFERENCE_THEME_DEFAUT).toBe('sombre');
    expect(preferenceDepuisCookie('auto')).toBe('auto');
    expect(preferenceDepuisCookie('clair')).toBe('clair');
    for (const v of [undefined, null, '', 'sombre', 'AUTO', 'auto ', 'system', '<script>']) expect(preferenceDepuisCookie(v), String(v)).toBe('sombre');
    // L'ancien lecteur ne connaît pas « auto » · il rend le sombre, le défaut sûr.
    expect(themeDepuisCookie('auto')).toBe('sombre');
    expect(themeCookieString('auto').startsWith('tt_theme=auto;')).toBe(true);
  });

  it('« auto » se résout selon l’appareil, un choix explicite l’ignore', () => {
    expect(themeResolu('auto', true)).toBe('clair');
    expect(themeResolu('auto', false)).toBe('sombre');
    expect(themeResolu('sombre', true)).toBe('sombre');
    expect(themeResolu('clair', false)).toBe('clair');
  });

  it('barre du navigateur · une couleur par réglage de l’appareil en « auto »', () => {
    expect(couleurBarreViewport('clair', COULEUR_BARRE_SPATIALE)).toBe(COULEUR_BARRE_SPATIALE.clair);
    expect(couleurBarreViewport('sombre', COULEUR_BARRE)).toBe(COULEUR_BARRE.sombre);
    expect(couleurBarreViewport('auto', COULEUR_BARRE_SPATIALE)).toEqual([
      { media: MEDIA_SYSTEME_CLAIR, color: COULEUR_BARRE_SPATIALE.clair },
      { media: '(prefers-color-scheme: dark)', color: COULEUR_BARRE_SPATIALE.sombre },
    ]);
  });
});

/** Un `matchMedia` simulé · `clair` bascule le réglage et prévient les abonnés. */
function systemeSimule(clair: boolean) {
  const abonnes: Array<() => void> = [];
  const mql = { media: MEDIA_SYSTEME_CLAIR, matches: clair, addEventListener: (_: string, f: () => void) => abonnes.push(f), removeEventListener: () => {} };
  window.matchMedia = ((q: string) => (q === MEDIA_SYSTEME_CLAIR ? mql : { ...mql, matches: !mql.matches })) as unknown as typeof window.matchMedia;
  return { changer(c: boolean) { mql.matches = c; abonnes.forEach((f) => f()); } };
}

function charger(pref: string, systeme: boolean) {
  const s = systemeSimule(systeme);
  const d = document.documentElement;
  d.setAttribute('data-theme', pref);
  d.setAttribute(ATTRIBUT_PREFERENCE_THEME, pref);
  document.head.innerHTML = '<meta name="theme-color" content="#000000">';
  new Function(scriptThemeAuto(COULEUR_BARRE_SPATIALE))();
  return s;
}
const theme = () => document.documentElement.getAttribute('data-theme');
const barre = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
const microtache = () => new Promise((r) => setTimeout(r, 0));

describe('script de <head> · « auto » résolu avant la peinture', () => {
  afterEach(() => { document.documentElement.removeAttribute('data-theme'); document.documentElement.removeAttribute(ATTRIBUT_PREFERENCE_THEME); document.head.innerHTML = ''; });

  it('appareil clair · data-theme="clair" et barre claire', () => {
    charger('auto', true);
    expect(theme(), 'l’appareil est clair, « auto » doit poser clair').toBe('clair');
    expect(barre()).toBe(COULEUR_BARRE_SPATIALE.clair);
  });

  it('appareil sombre · data-theme="sombre" et barre sombre', () => {
    charger('auto', false);
    expect(theme()).toBe('sombre');
    expect(barre()).toBe(COULEUR_BARRE_SPATIALE.sombre);
  });

  it('le réglage de l’appareil change · l’écran suit, sans rechargement', () => {
    const s = charger('auto', false);
    s.changer(true);
    expect(theme(), 'le passage de l’appareil en clair n’est pas suivi').toBe('clair');
    expect(barre()).toBe(COULEUR_BARRE_SPATIALE.clair);
    s.changer(false);
    expect(theme()).toBe('sombre');
  });

  it('un choix explicite n’est jamais touché, même si l’appareil change', () => {
    const s = charger('clair', false);
    expect(theme()).toBe('clair');
    expect(barre(), 'le script a réécrit la barre d’un choix explicite').toBe('#000000');
    s.changer(false);
    expect(theme()).toBe('clair');
  });

  it('un data-theme="auto" reposé plus tard (rendu serveur rafraîchi) est résolu de nouveau', async () => {
    charger('auto', true);
    document.documentElement.setAttribute('data-theme', 'auto');
    await microtache();
    expect(theme(), '« auto » reposé reste non résolu · l’écran retomberait en sombre').toBe('clair');
  });
});
