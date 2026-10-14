// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { pastilleLogo } from '@tiktrends/core';
import { LogoMarque, MARQUES_LOGO, TAILLES_LOGO_MARQUE, type MarqueLogo, type TailleLogoMarque } from '../components/LogoMarque';
import { DESSINS_LOGOS, TRACES_SIMPLE_ICONS } from '../components/logos-outils';
import { CLES_MULTICOLORES_LOCALES, LogoOutil } from '../components/BrandIcons';

/** Ce que la donnée annonce pour une marque · nom, viewBox, fond de pastille. */
function annonce(m: MarqueLogo): { nom: string; viewBox: string; fond: string } {
  if (m in DESSINS_LOGOS) { const d = DESSINS_LOGOS[m as keyof typeof DESSINS_LOGOS]; return { nom: d.nom, viewBox: d.viewBox, fond: d.fond }; }
  const t = TRACES_SIMPLE_ICONS[m as keyof typeof TRACES_SIMPLE_ICONS];
  return { nom: t.titre, viewBox: '0 0 24 24', fond: pastilleLogo(t.hex).fond };
}
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Lot V5 · A1 · `LogoMarque` · on MONTE chaque logo, à chaque taille, en DOM
 * réel, et on lit ce qui sort.
 *
 * ── Ce qu'on empêche ────────────────────────────────────────────────────────
 *
 *  · un logo qui ne rend rien (svg absent, dessin vide) ou à la mauvaise taille ;
 *  · un logo muet pour un lecteur d'écran (ni `role="img"` + nom, ni masqué) ;
 *  · TikTok en noir sur blanc (sa présentation officielle est sur noir) ou une
 *    note noire sur fond noir (invisible) ;
 *  · un trait hérité du contexte qui épaissit le logo ;
 *  · un attribut actif (`on*`, `href`) ou une balise exécutable dans le SVG ;
 *  · un dégradé partagé entre deux instances (id dupliqué).
 */

/** Les tailles relevées sur la référence V5 (`.blg.xs/.sm/.md/.lg`) · côté, arrondi, logo. */
const MESURE: Record<TailleLogoMarque, [number, number, number]> = {
  xs: [22, 6, 14], sm: [32, 9, 20], md: [36, 10, 22], lg: [60, 16, 35],
};
const TAILLES = Object.keys(MESURE) as TailleLogoMarque[];

let hote: HTMLDivElement;
let root: Root;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); root = createRoot(hote); });
afterEach(() => { act(() => root.unmount()); hote.remove(); });

function monter(el: React.ReactElement): HTMLElement {
  act(() => root.render(el));
  return hote;
}

/** Tous les éléments du sous-arbre, racine comprise. */
const tous = (el: Element): Element[] => [el, ...el.querySelectorAll('*')];

describe('LogoMarque · chaque marque, chaque taille, au DOM rendu', () => {
  it('la table des tailles est celle mesurée sur la référence', () => {
    for (const t of TAILLES) {
      const { cote, arrondi, logo } = TAILLES_LOGO_MARQUE[t];
      expect([cote, arrondi, logo], `taille ${t} · écart avec la mesure du prototype`).toEqual(MESURE[t]);
    }
  });

  for (const m of MARQUES_LOGO) {
    for (const t of TAILLES) {
      it(`${m} · ${t}`, () => {
        const [cote, arrondi, logo] = MESURE[t];
        const h = monter(<LogoMarque marque={m} taille={t} />);
        const pastille = h.querySelector<HTMLElement>(`[data-logo-marque="${m}"]`);
        expect(pastille, `${m} · pastille absente`).not.toBeNull();
        expect(pastille!.getAttribute('data-taille')).toBe(t);
        expect(pastille!.style.width, `${m} ${t} · largeur`).toBe(`${cote}px`);
        expect(pastille!.style.height, `${m} ${t} · hauteur`).toBe(`${cote}px`);
        expect(pastille!.style.borderRadius, `${m} ${t} · arrondi`).toBe(`${arrondi}px`);

        const svg = pastille!.querySelector('svg');
        expect(svg, `${m} ${t} · aucun svg rendu`).not.toBeNull();
        expect(svg!.getAttribute('width'), `${m} ${t} · logo à la mauvaise taille`).toBe(String(logo));
        expect(svg!.getAttribute('height')).toBe(String(logo));
        expect(svg!.getAttribute('viewBox')).toBe(annonce(m).viewBox);
        // Un dessin réel · au moins une forme, chacune peinte (sinon noire par défaut).
        const formes = [...svg!.querySelectorAll('path, ellipse')];
        expect(formes.length, `${m} · dessin vide`).toBeGreaterThan(0);
        for (const f of formes) expect(f.getAttribute('fill'), `${m} · une forme sans fill (noire par défaut)`).toBeTruthy();
        for (const p of svg!.querySelectorAll('path')) expect((p.getAttribute('d') ?? '').length, `${m} · tracé vide`).toBeGreaterThan(40);

        // Accessibilité · le logo parle seul · role img + nom.
        expect(svg!.getAttribute('role'), `${m} · pas de role="img"`).toBe('img');
        expect(svg!.getAttribute('aria-label'), `${m} · nom accessible absent`).toBe(annonce(m).nom);
        expect(pastille!.getAttribute('aria-hidden')).toBeNull();

        // Aucun trait hérité · la racine coupe le stroke, aucun nœud n'en pose.
        expect(svg!.getAttribute('stroke'), `${m} · stroke hérité possible`).toBe('none');
        for (const el of svg!.querySelectorAll('*')) {
          expect(el.getAttribute('stroke'), `${m} · un nœud pose un stroke`).toBeNull();
          expect(el.getAttribute('stroke-width')).toBeNull();
        }

        // Rien d'actif · ni on*, ni href, ni balise exécutable ou étrangère.
        for (const el of tous(pastille!)) {
          const actifs = [...el.attributes].map((a) => a.name).filter((n) => /^on/i.test(n) || /href$/i.test(n));
          expect(actifs, `${m} · attribut actif sur <${el.tagName}>`).toEqual([]);
        }
        expect(pastille!.querySelector('script, style, foreignObject, image, use, a'), `${m} · balise interdite`).toBeNull();

        // Chaque dégradé référencé existe DANS ce svg.
        for (const el of svg!.querySelectorAll('[fill^="url(#"]')) {
          const id = el.getAttribute('fill')!.slice(5, -1);
          expect(svg!.querySelector(`[id="${id}"]`), `${m} · dégradé ${id} introuvable`).not.toBeNull();
        }
      });
    }
  }

  it('décoratif · tout est masqué, aucun nom annoncé en double', () => {
    for (const m of MARQUES_LOGO) {
      const h = monter(<LogoMarque marque={m} taille="sm" decoratif />);
      const pastille = h.querySelector<HTMLElement>(`[data-logo-marque="${m}"]`)!;
      expect(pastille.getAttribute('aria-hidden'), `${m} · pastille décorative non masquée`).toBe('true');
      const svg = pastille.querySelector('svg')!;
      expect(svg.getAttribute('role'), `${m} · role img sur un logo décoratif`).toBeNull();
      expect(svg.getAttribute('aria-label')).toBeNull();
      expect(svg.getAttribute('focusable')).toBe('false');
    }
  });
});

describe('fonds · présentation officielle', () => {
  it('TikTok · sur fond NOIR, note centrale blanche (visible)', () => {
    const h = monter(<LogoMarque marque="tiktok" taille="md" />);
    const pastille = h.querySelector<HTMLElement>('[data-logo-marque="tiktok"]')!;
    expect(pastille.style.background, 'TikTok n’est pas sur fond noir').toBe('rgb(0, 0, 0)');
    expect(pastille.style.border, 'bordure sombre invisible sur fond sombre').toContain('rgba(255, 255, 255');
    const fills = [...pastille.querySelectorAll('path')].map((p) => p.getAttribute('fill')?.toUpperCase());
    expect(fills, 'la note blanche de TikTok manque').toContain('#FFFFFF');
    expect(fills, 'un tracé noir sur fond noir disparaîtrait').not.toContain('#000000');
  });
  it('Snapchat · fantôme à l’encre sur son jaune, pas un jaune invisible sur blanc', () => {
    const h = monter(<LogoMarque marque="snapchat" />);
    const pastille = h.querySelector<HTMLElement>('[data-logo-marque="snapchat"]')!;
    expect(pastille.style.background).toBe('rgb(255, 252, 0)');
    expect(pastille.querySelector('path')!.getAttribute('fill')).toBe('#111111');
  });
  it('les autres · fond blanc, sauf présentation officielle ou teinte trop pâle', () => {
    const fonds = Object.fromEntries(MARQUES_LOGO.map((m) => {
      const h = monter(<LogoMarque marque={m} />);
      return [m, h.querySelector<HTMLElement>(`[data-logo-marque="${m}"]`)!.style.background];
    })) as Record<MarqueLogo, string>;
    for (const m of MARQUES_LOGO) {
      const attendu = m === 'tiktok' ? 'rgb(0, 0, 0)' : rgb(annonce(m).fond);
      if (['meta', 'shopify', 'googledrive', 'slack', 'stripe'].includes(m)) expect(attendu, `${m} · doit être sur blanc`).toBe('rgb(255, 255, 255)');
      expect(fonds[m], `${m} · fond inattendu`).toBe(attendu);
    }
  });
});

describe('dégradés · un id par instance', () => {
  it('deux logos Meta dans la même page ne partagent aucun id', () => {
    const h = monter(<><LogoMarque marque="meta" /><LogoMarque marque="meta" taille="xs" /></>);
    const ids = [...h.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.length, 'Meta · dégradés absents').toBe(4);
    expect(new Set(ids).size, 'id de dégradé dupliqué entre deux instances').toBe(ids.length);
  });
});

describe('les sources · aucun SVG en chaîne, rien d’actif', () => {
  const COMPOSANT = readFileSync(join(process.cwd(), 'components/LogoMarque.tsx'), 'utf8');
  const DONNEES = readFileSync(join(process.cwd(), 'components/logos-outils.ts'), 'utf8');
  // Les commentaires citent ce qu'on interdit · on lit le code seul.
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('pas de dangerouslySetInnerHTML ni de requête', () => {
    for (const [f, s] of [['LogoMarque.tsx', COMPOSANT], ['logos-outils.ts', DONNEES]] as const) {
      expect(code(s), `${f} injecte du HTML`).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
      expect(code(s), `${f} fait une requête`).not.toMatch(/\bfetch\(|https?:\/\//);
    }
  });
  it('les données ne contiennent ni <script>, ni on*=, ni href, ni le fournisseur interne', () => {
    const c = code(DONNEES);
    expect(c, 'une balise <script> dans les données de logos').not.toMatch(/<script/i);
    expect(c, 'un attribut on* dans les données de logos').not.toMatch(/\bon[a-z]+\s*[:=]/i);
    expect(c, 'un href dans les données de logos').not.toMatch(/href/i);
    expect(DONNEES, 'le fournisseur interne est cité').not.toMatch(/trend\s*track/i);
  });
});

describe('un seul jeu de logos dans le dépôt', () => {
  it('une marque a UN dessin · tracé monochrome OU dessin multicolore', () => {
    const doubles = Object.keys(DESSINS_LOGOS).filter((k) => k in TRACES_SIMPLE_ICONS);
    expect(doubles, 'marque dessinée deux fois dans logos-outils.ts').toEqual([]);
  });
  it('aucune marque n’est redessinée à la main dans BrandIcons', () => {
    const doubles = CLES_MULTICOLORES_LOCALES.filter((k) => k in DESSINS_LOGOS || k in TRACES_SIMPLE_ICONS);
    expect(doubles, 'second dessin d’une marque dans BrandIcons.tsx').toEqual([]);
  });
  it('la feuille de route (LogoOutil / BrandTile) rend le MÊME dessin que LogoMarque', () => {
    const corps = (html: string) => html.replace(/^<svg[^>]*>|<\/svg>$/g, '').replace(/lm[^"#)]*-/g, 'lm-');
    for (const cle of Object.keys(DESSINS_LOGOS) as Array<keyof typeof DESSINS_LOGOS>) {
      const outil = corps(renderToStaticMarkup(<LogoOutil cle={cle} />));
      const marque = renderToStaticMarkup(<LogoMarque marque={cle} />).replace(/^[\s\S]*?<svg[^>]*>|<\/svg><\/span>$/g, '').replace(/lm[^"#)]*-/g, 'lm-');
      expect(outil, `${cle} · la feuille de route dessine un autre logo que LogoMarque`).toBe(marque);
    }
  });
  it('aucun autre fichier n’embarque un tracé de logo', () => {
    const traces = [
      ...Object.values(TRACES_SIMPLE_ICONS).map((t) => t.d),
      ...Object.values(DESSINS_LOGOS).flatMap((d) => JSON.stringify(d.dessin).match(/"d","([^"]+)"|"d":"([^"]+)"/g) ?? []),
    ].map((x) => x.replace(/^"d"[,:]"/, '').slice(0, 48)).filter((x) => x.length >= 40);
    expect(traces.length, 'lecture des tracés cassée').toBeGreaterThan(30);
    const fichiers: string[] = [];
    const parcourir = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) parcourir(p); else if (/\.(tsx?|json)$/.test(p)) fichiers.push(p); } };
    for (const d of ['app', 'components', 'lib']) parcourir(join(process.cwd(), d));
    for (const f of fichiers) {
      if (f.endsWith(join('components', 'logos-outils.ts'))) continue;
      const src = readFileSync(f, 'utf8');
      const copie = traces.find((t) => src.includes(t));
      expect(copie, `${f} embarque un second tracé de logo`).toBeUndefined();
    }
  });
});
