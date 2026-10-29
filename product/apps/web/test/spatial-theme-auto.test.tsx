// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { COULEUR_BARRE_SPATIALE, ENTETE_SECTION, MEDIA_SYSTEME_CLAIR, SELECTEUR_CLAIR, THEME_COOKIE } from '@tiktrends/core';

/**
 * Spatial · le thème « Auto » au RÉSULTAT (demande du propriétaire · « je trouve
 * pas la fonctionnalité pour mettre en clair/sombre/auto »).
 *
 *  1. cookie `tt_theme=auto` · le layout racine RENDU au serveur pose
 *     `data-theme="auto"` et le script de `<head>` ; ce script, EXÉCUTÉ tel que
 *     servi avec un `matchMedia` simulé, pose `clair` puis `sombre` selon
 *     l'appareil, et suit son changement · la feuille claire vise alors le
 *     document. La barre du navigateur a une couleur par réglage.
 *  2. la pop-up profil propose Sombre · Clair · Auto (`aria-pressed`) · « Auto »
 *     pose le cookie et le thème de l'appareil, puis suit l'appareil.
 *  3. Réglages (`/settings`) et « Mon profil » ont une section « Apparence »
 *     avec le même choix, servie déjà pressée selon le cookie.
 * La palette ⌘K · `spatial-coquille.test.tsx` (coquille entière).
 */
const etat: { cookie: string | undefined } = { cookie: undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === THEME_COOKIE && etat.cookie !== undefined ? { name: n, value: etat.cookie } : undefined) }),
  headers: async () => new Headers({ [ENTETE_SECTION]: 'veille' }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/settings', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { default: RootLayout, generateViewport } = await import('../app/layout');
const { MenuProfil } = await import('../spatial/coquille/Surcouches');
const { Espace } = await import('../spatial/vues/reglages/Espace');
const { Profil } = await import('../spatial/vues/reglages/Profil');

/** Un `matchMedia` simulé · `changer` bascule le réglage et prévient les abonnés. */
function appareil(clair: boolean) {
  const abonnes: Array<() => void> = [];
  const mql = { media: MEDIA_SYSTEME_CLAIR, matches: clair, addEventListener: (_: string, f: () => void) => abonnes.push(f), removeEventListener: () => {} };
  window.matchMedia = ((q: string) => (q === MEDIA_SYSTEME_CLAIR ? mql : { ...mql, matches: !mql.matches })) as unknown as typeof window.matchMedia;
  return { changer(c: boolean) { mql.matches = c; abonnes.forEach((f) => f()); } };
}

/** Sert le document du layout racine puis le CHARGE dans jsdom · attributs de
 *  `<html>` recopiés, `<head>` servi en place, son script exécuté. */
async function servirEtCharger(): Promise<string> {
  const html = renderToString(await RootLayout({ children: <main className="win glass">contenu</main> }));
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const a of [...doc.documentElement.attributes]) document.documentElement.setAttribute(a.name, a.value);
  document.head.innerHTML = '<meta name="theme-color" content="#000000">';
  const script = doc.querySelector('head script#tt-theme-auto')?.textContent;
  if (!script) throw new Error('script de thème absent du <head> servi');
  new Function(script)();
  return html;
}
const racineDoc = () => document.documentElement;

afterEach(() => {
  etat.cookie = undefined;
  document.cookie = `${THEME_COOKIE}=; Max-Age=0; Path=/`;
  racineDoc().removeAttribute('data-theme'); racineDoc().removeAttribute('data-theme-pref');
  document.head.innerHTML = '';
});

describe('rendu serveur · tt_theme=auto', () => {
  it('le document servi porte data-theme="auto", la préférence et le script de <head>', async () => {
    etat.cookie = 'auto';
    const doc = new DOMParser().parseFromString(renderToString(await RootLayout({ children: <p>x</p> })), 'text/html');
    expect(doc.documentElement.getAttribute('data-theme')).toBe('auto');
    expect(doc.documentElement.getAttribute('data-theme-pref')).toBe('auto');
    const s = doc.querySelector('head script#tt-theme-auto')?.textContent ?? '';
    expect(s, 'script de résolution absent du <head>').toContain(MEDIA_SYSTEME_CLAIR);
    expect(s).toContain(COULEUR_BARRE_SPATIALE.clair);
    expect((await generateViewport()).themeColor, 'la barre du navigateur doit suivre l’appareil').toEqual([
      { media: MEDIA_SYSTEME_CLAIR, color: COULEUR_BARRE_SPATIALE.clair },
      { media: '(prefers-color-scheme: dark)', color: COULEUR_BARRE_SPATIALE.sombre },
    ]);
  });

  it('appareil clair · le script servi pose clair avant la peinture · la feuille claire vise le document', async () => {
    etat.cookie = 'auto';
    appareil(true);
    await servirEtCharger();
    expect(racineDoc().getAttribute('data-theme'), 'appareil clair, thème non résolu').toBe('clair');
    expect(document.querySelector(SELECTEUR_CLAIR)).not.toBeNull();
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(COULEUR_BARRE_SPATIALE.clair);
  });

  it('appareil sombre · sombre ; l’appareil passe en clair · l’écran suit sans rechargement', async () => {
    etat.cookie = 'auto';
    const a = appareil(false);
    await servirEtCharger();
    expect(racineDoc().getAttribute('data-theme')).toBe('sombre');
    a.changer(true);
    expect(racineDoc().getAttribute('data-theme'), 'le changement de réglage de l’appareil n’est pas suivi').toBe('clair');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(COULEUR_BARRE_SPATIALE.clair);
  });

  it('cookie « clair » explicite · le script reste inerte, même appareil sombre', async () => {
    etat.cookie = 'clair';
    const a = appareil(false);
    await servirEtCharger();
    expect(racineDoc().getAttribute('data-theme')).toBe('clair');
    a.changer(false);
    expect(racineDoc().getAttribute('data-theme')).toBe('clair');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#000000');
  });
});

describe('pop-up profil · Sombre · Clair · Auto', () => {
  let racine: Root | null = null;
  let hote: HTMLElement | null = null;
  afterEach(() => { act(() => racine?.unmount()); hote?.remove(); racine = null; hote = null; });
  const ouvrir = () => {
    hote = document.createElement('section');
    document.body.appendChild(hote);
    racine = createRoot(hote);
    act(() => racine!.render(<MenuProfil utilisateur={{ nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Admin' }} equipe={null} forfaits={null} demarrage={null} deconnexion={async () => {}} />));
    return hote.querySelector<HTMLElement>('[role="group"][data-zone="choix-theme"]')!;
  };
  const presses = (g: HTMLElement) => [...g.querySelectorAll('button')].map((b) => `${b.getAttribute('data-theme-choix')}:${b.getAttribute('aria-pressed')}`);

  it('préférence « auto » servie · Auto pressé, même si le thème posé est clair', () => {
    racineDoc().setAttribute('data-theme', 'clair'); racineDoc().setAttribute('data-theme-pref', 'auto');
    expect(presses(ouvrir())).toEqual(['sombre:false', 'clair:false', 'auto:true']);
  });

  it('« Auto » · cookie auto, thème de l’appareil, puis l’appareil change et l’écran suit', async () => {
    const a = appareil(true);
    racineDoc().setAttribute('data-theme', 'sombre'); racineDoc().setAttribute('data-theme-pref', 'sombre');
    new Function((await import('@tiktrends/core')).scriptThemeAuto(COULEUR_BARRE_SPATIALE))();
    document.head.innerHTML = '<meta name="theme-color" content="#0b1220">';
    const g = ouvrir();
    act(() => g.querySelector<HTMLButtonElement>('button[data-theme-choix="auto"]')!.click());
    expect(document.cookie, 'le cookie tt_theme=auto n’est pas posé').toContain('tt_theme=auto');
    expect(racineDoc().getAttribute('data-theme'), 'Auto, appareil clair · l’écran doit passer en clair').toBe('clair');
    expect(racineDoc().getAttribute('data-theme-pref')).toBe('auto');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(COULEUR_BARRE_SPATIALE.clair);
    expect(presses(g)).toEqual(['sombre:false', 'clair:false', 'auto:true']);
    expect(hote!.querySelector('[role="status"]')?.textContent).toBe('Thème auto appliqué · il suit ton appareil');
    a.changer(false);
    expect(racineDoc().getAttribute('data-theme'), 'après « Auto », l’appareil passé en sombre n’est pas suivi').toBe('sombre');
    act(() => g.querySelector<HTMLButtonElement>('button[data-theme-choix="clair"]')!.click());
    a.changer(false);
    expect(racineDoc().getAttribute('data-theme'), 'un choix explicite doit cesser de suivre l’appareil').toBe('clair');
  });
});

describe('Réglages et Mon profil · section « Apparence »', () => {
  const espace = (theme?: 'sombre' | 'clair' | 'auto') => renderToStaticMarkup(
    <Espace sousNav={[]} espace="E" plan="Core" marques={[]} inclus="x" ajouter={null} formules={[]}
      preferences={{ langue: 'fr', fuseau: 'Europe/Paris', devise: 'Euro (€)', nommage: null }} video={null} theme={theme} />,
  );
  const lire = (html: string) => {
    const t = document.createElement('template'); t.innerHTML = html;
    const s = t.content.querySelector('section#apparence');
    return s && {
      titre: s.querySelector('.lbl')?.textContent,
      choix: [...s.querySelectorAll('[role="group"][data-zone="choix-theme"] button')].map((b) => `${b.querySelector('strong')?.textContent}:${b.getAttribute('aria-pressed')}`),
    };
  };

  it('/settings · Sombre · Clair · Auto, la préférence du cookie déjà pressée au rendu serveur', () => {
    expect(lire(espace('auto')), 'section Apparence absente des Réglages').toEqual({ titre: 'Apparence', choix: ['Sombre:false', 'Clair:false', 'Auto:true'] });
    expect(lire(espace('clair'))?.choix).toEqual(['Sombre:false', 'Clair:true', 'Auto:false']);
    expect(lire(espace()), 'sans préférence fournie, l’écran reste celui de la maquette').toBeNull();
  });

  it('/profile (toute session) · la même section', () => {
    const html = renderToStaticMarkup(
      <Profil identite={{ nom: 'K', email: 'k@x.fr', avatar: '', masquer: false }} acces={{ espace: 'E', role: 'Membre', abonnement: 'Core' }}
        liens={[]} enregistrer={null} changerMotDePasse={null} motDePasseMin={8} retours={{}} theme="sombre" />,
    );
    expect(lire(html)).toEqual({ titre: 'Apparence', choix: ['Sombre:true', 'Clair:false', 'Auto:false'] });
  });
});
