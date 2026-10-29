// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ENTETE_SECTION, PAPIER_CLAIR, SELECTEUR_CLAIR, THEME_COOKIE } from '@tiktrends/core';

/**
 * Spatial · le thème CLAIR au RÉSULTAT (l'ancienne interface l'avait · la
 * fonction n'est pas retirée, elle est portée).
 *
 *  1. Sur un écran Spatial, le layout racine RENDU côté serveur pose
 *     `data-theme="clair"` sur `<html>` quand le cookie le demande · c'est CE
 *     document que vise la feuille dérivée (`html[data-theme="clair"] …`), dès
 *     le premier octet, sans flash. La barre du navigateur prend le papier.
 *  2. La pop-up profil Spatial porte le choix « Sombre · Clair » · un clic pose
 *     le cookie, l'attribut et la barre (mécanisme existant `appliquerTheme`),
 *     l'état pressé suit, et l'annonce est lue.
 * Contrastes de la palette · `packages/core/test/spatial-theme-clair.test.ts`.
 * Dérivation exacte de la feuille · `spatial-fondation`.
 */
const etat: { cookie: string | undefined } = { cookie: undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === THEME_COOKIE && etat.cookie !== undefined ? { name: n, value: etat.cookie } : undefined) }),
  headers: async () => new Headers({ [ENTETE_SECTION]: 'veille' }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/veille', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const { default: RootLayout, generateViewport } = await import('../app/layout');
const { MenuProfil } = await import('../spatial/coquille/Surcouches');

const WEB = join(__dirname, '..');

afterEach(() => {
  etat.cookie = undefined;
  document.cookie = `${THEME_COOKIE}=; Max-Age=0; Path=/`;
  document.documentElement.removeAttribute('data-theme'); document.documentElement.removeAttribute('data-theme-pref');
  document.head.innerHTML = '';
});

describe('Spatial · thème clair · posé au rendu serveur, sans flash', () => {
  const documentRendu = async () => {
    const html = renderToString(await RootLayout({ children: <main className="win glass">contenu</main> }));
    return new DOMParser().parseFromString(html, 'text/html');
  };

  it('cookie « clair » · le document servi est visé par la feuille du thème clair', async () => {
    etat.cookie = 'clair';
    const doc = await documentRendu();
    expect(doc.querySelector(SELECTEUR_CLAIR), 'le sélecteur du thème clair ne vise pas le document servi').not.toBeNull();
    expect(doc.querySelector(`${SELECTEUR_CLAIR} body[data-sec="veille"] .win`), 'écran Spatial servi hors du thème clair').not.toBeNull();
    expect((await generateViewport()).themeColor, 'la barre du navigateur reste sombre en clair').toBe(PAPIER_CLAIR);
  });

  it('sans cookie · sombre, la feuille du thème clair ne vise rien', async () => {
    const doc = await documentRendu();
    expect(doc.querySelector(SELECTEUR_CLAIR)).toBeNull();
    expect(doc.documentElement.getAttribute('data-theme')).toBe('sombre');
    expect((await generateViewport()).themeColor).toBe('#0b1220');
  });

  it('la feuille du thème clair est chargée par l’arbre Spatial, après la maquette', () => {
    const src = readFileSync(join(WEB, 'app', '(spatial)', 'layout.tsx'), 'utf8');
    const ordre = [...src.matchAll(/^import '([^']+\.css)';/gm)].map((m) => m[1]);
    expect(ordre.at(-1), 'spatial-clair.css absente ou chargée avant la maquette').toBe('../../spatial/spatial-clair.css');
  });
});

describe('Spatial · thème clair · aucun texte blanc écrit en dur sur le verre', () => {
  // Un style en ligne ne passe pas par la feuille dérivée · `color: '#fff'` sur
  // un champ ou une tuile de verre reste blanc en clair, donc invisible (texte
  // saisi, initiales, montant). `var(--fg)` vaut #ffffff en sombre (aucun
  // changement) et l'encre en clair. Seuls les monogrammes posés sur un APLAT
  // DE COULEUR (logos de fournisseur, de marque) gardent leur blanc.
  const MONOGRAMMES: Record<string, number> = {
    'admin/Couts.tsx': 1, 'admin/Modeles.tsx': 1, 'admin/Paiements.tsx': 1, 'reglages/Espace.tsx': 1,
  };
  it('chaque `color` blanc en ligne d’une vue Spatial est un monogramme sur aplat', () => {
    const vues = join(WEB, 'spatial');
    const trouves: Record<string, number> = {};
    const parcourir = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) parcourir(p);
        else if (n.endsWith('.tsx')) {
          const k = (readFileSync(p, 'utf8').match(/\bcolor:\s*'#fff(?:fff)?'/g) ?? []).length;
          if (k) trouves[p.slice(vues.length + 1).replace(/^vues\//, '')] = k;
        }
      }
    };
    parcourir(vues);
    expect(trouves, 'texte blanc en dur sur le verre · écrire var(--fg)').toEqual(MONOGRAMMES);
  });
});

describe('Spatial · pop-up profil · le choix du thème', () => {
  let racine: Root | null = null;
  let hote: HTMLElement | null = null;
  afterEach(() => { act(() => racine?.unmount()); hote?.remove(); racine = null; hote = null; });

  const ouvrir = () => {
    hote = document.createElement('section');
    document.body.appendChild(hote);
    racine = createRoot(hote);
    act(() => racine!.render(
      <MenuProfil utilisateur={{ nom: 'Kevin G.', initiales: 'KG', email: 'k@x.fr', role: 'Admin' }} equipe={null} forfaits={null} demarrage={null} deconnexion={async () => {}} />,
    ));
    const groupe = hote.querySelector<HTMLElement>('[role="group"][data-zone="choix-theme"]');
    if (!groupe) throw new Error('le choix du thème est absent de la pop-up profil');
    return groupe;
  };
  const bouton = (g: HTMLElement, t: string) => g.querySelector<HTMLButtonElement>(`button[data-theme-choix="${t}"]`)!;

  it('un groupe nommé « Thème », trois boutons Sombre · Clair · Auto, le courant pressé (lu sur <html>)', () => {
    document.documentElement.setAttribute('data-theme', 'clair');
    const g = ouvrir();
    expect(document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent).toBe('Thème');
    expect([...g.querySelectorAll('button')].map((b) => b.querySelector('strong')?.textContent)).toEqual(['Sombre', 'Clair', 'Auto']);
    expect(bouton(g, 'auto').getAttribute('aria-pressed')).toBe('false');
    expect(bouton(g, 'clair').getAttribute('aria-pressed')).toBe('true');
    expect(bouton(g, 'sombre').getAttribute('aria-pressed')).toBe('false');
  });

  it('« Clair » pose le cookie, l’attribut et la barre · l’état et l’annonce suivent ; « Sombre » revient', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#0b1220">';
    document.documentElement.setAttribute('data-theme', 'sombre');
    const g = ouvrir();
    act(() => bouton(g, 'clair').click());
    expect(document.cookie, 'le cookie tt_theme n’est pas posé · le prochain rendu serveur repartirait en sombre').toContain('tt_theme=clair');
    expect(document.documentElement.getAttribute('data-theme'), 'l’écran ne bascule pas sans rechargement').toBe('clair');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(PAPIER_CLAIR);
    expect(bouton(g, 'clair').getAttribute('aria-pressed')).toBe('true');
    expect(hote!.querySelector('[role="status"]')?.textContent).toBe('Thème clair appliqué');
    act(() => bouton(g, 'sombre').click());
    expect(document.cookie).toContain('tt_theme=sombre');
    expect(document.documentElement.getAttribute('data-theme')).toBe('sombre');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0b1220');
  });
});
