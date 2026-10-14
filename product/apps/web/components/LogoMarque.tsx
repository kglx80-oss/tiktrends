import { createElement, useId, type ReactElement, type ReactNode } from 'react';
import { contrasteWcag, pastilleLogo } from '@tiktrends/core';
import { DESSINS_LOGOS, TRACES_SIMPLE_ICONS, type NoeudSvg } from './logos-outils';

/**
 * Le logo officiel d'une marque tierce, posé sur sa pastille (lot V5 · A1 ·
 * référence `brandLogo()` et `.blg` du prototype V5). Il puise dans le jeu
 * unique du dépôt (`logos-outils.ts`) · dessin multicolore si la marque en a
 * un, sinon son tracé Simple Icons dans sa teinte officielle.
 *
 *  · SVG en ligne · aucune requête réseau, aucun SVG injecté en chaîne.
 *  · Aucun trait hérité · `stroke="none"` à la racine, aucun nœud n'en pose ·
 *    un `stroke` posé par le contexte (bouton, icône au trait) ne déborde pas
 *    sur le logo.
 *  · Quatre tailles mesurées sur la référence (`TAILLES_LOGO_MARQUE`).
 *  · Fond · blanc, sauf présentation officielle sur fond (TikTok sur noir) ou
 *    teinte trop pâle pour le blanc (Snapchat · `pastilleLogo`, seuil mesuré) ;
 *    la bordure s'inverse sur un fond sombre.
 *  · Accessibilité · `role="img"` + `aria-label` du nom quand le logo parle
 *    seul ; `decoratif` quand le nom est déjà écrit à côté (tout est alors
 *    `aria-hidden`).
 *
 * Il ne dit rien d'une connexion · un écran qui représente une connexion ne le
 * pose que pour une clé de `CONNEXIONS_REELLES` (`@tiktrends/core` · garde
 * `logo-marque-connexions-rendu.test.tsx`).
 */

export type MarqueLogo = keyof typeof DESSINS_LOGOS | keyof typeof TRACES_SIMPLE_ICONS;

/** Les marques dont un logo est embarqué · dessins multicolores puis tracés. */
export const MARQUES_LOGO = [...Object.keys(DESSINS_LOGOS), ...Object.keys(TRACES_SIMPLE_ICONS)] as MarqueLogo[];

/**
 * Les tailles de pastille, MESURÉES sur la référence V5 (`tt-v5-r13.css`,
 * classes `.blg.xs/.sm/.md/.lg`) ·
 *
 *   taille  côté   arrondi  logo (part du côté)       ombre
 *   xs      22 px   6 px    64 % → 14 px              aucune
 *   sm      32 px   9 px    62 % → 20 px              0 1px 2px rgba(0,0,0,.06)
 *   md      36 px  10 px    62 % → 22 px              idem
 *   lg      60 px  16 px    58 % → 35 px              idem
 *
 * Le logo est inscrit dans un carré de ce côté, proportions conservées.
 */
export const TAILLES_LOGO_MARQUE = {
  xs: { cote: 22, arrondi: 6, logo: 14, ombre: false },
  sm: { cote: 32, arrondi: 9, logo: 20, ombre: true },
  md: { cote: 36, arrondi: 10, logo: 22, ombre: true },
  lg: { cote: 60, arrondi: 16, logo: 35, ombre: true },
} as const;
export type TailleLogoMarque = keyof typeof TAILLES_LOGO_MARQUE;

const estDessin = (m: string): m is keyof typeof DESSINS_LOGOS => Object.prototype.hasOwnProperty.call(DESSINS_LOGOS, m);

/** Le nom, le fond de pastille et le contenu SVG d'une marque. */
function aspect(marque: MarqueLogo, prefixe: string): { nom: string; fond: string; viewBox: string; contenu: ReactNode } {
  if (estDessin(marque)) {
    const d = DESSINS_LOGOS[marque];
    return { nom: d.nom, fond: d.fond, viewBox: d.viewBox, contenu: d.dessin.map((n, i) => rendreNoeud(n, i, prefixe)) };
  }
  const t = TRACES_SIMPLE_ICONS[marque];
  const { fond, trait } = pastilleLogo(t.hex);
  return { nom: t.titre, fond, viewBox: '0 0 24 24', contenu: <path fill={trait} d={t.d} /> };
}

/** Un préfixe d'id par instance · un dégradé (Meta) ne se prête pas d'un logo à l'autre. */
function usePrefixe(): string {
  return `lm${useId().replace(/[^A-Za-z0-9_-]/g, '')}-`;
}

/**
 * Le dessin multicolore nu d'une marque (sans pastille), décoratif · pour la
 * pastille de la feuille de route (`BrandTile`) et les titres.
 */
export function DessinLogo({ cle, size }: { cle: keyof typeof DESSINS_LOGOS; size: number }) {
  const prefixe = usePrefixe();
  const d = DESSINS_LOGOS[cle];
  return (
    <svg viewBox={d.viewBox} width={size} height={size} stroke="none" focusable="false" aria-hidden style={{ display: 'block' }}>
      {d.dessin.map((n, i) => rendreNoeud(n, i, prefixe))}
    </svg>
  );
}

export function LogoMarque({ marque, taille = 'md', decoratif = false }: { marque: MarqueLogo; taille?: TailleLogoMarque; decoratif?: boolean }) {
  const t = TAILLES_LOGO_MARQUE[taille];
  const a = aspect(marque, usePrefixe());
  const sombre = contrasteWcag(a.fond, '#FFFFFF') >= 4.5;
  return (
    <span
      data-logo-marque={marque}
      data-taille={taille}
      aria-hidden={decoratif ? true : undefined}
      style={{
        display: 'inline-grid', placeItems: 'center', flexShrink: 0, boxSizing: 'border-box',
        width: t.cote, height: t.cote, borderRadius: t.arrondi, background: a.fond,
        border: `1px solid ${sombre ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.08)'}`,
        boxShadow: t.ombre ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
      }}
    >
      <svg
        viewBox={a.viewBox}
        width={t.logo}
        height={t.logo}
        stroke="none"
        focusable="false"
        style={{ display: 'block' }}
        {...(decoratif ? { 'aria-hidden': true } : { role: 'img', 'aria-label': a.nom })}
      >
        {a.contenu}
      </svg>
    </span>
  );
}

function rendreNoeud(n: NoeudSvg, cle: number, prefixe: string): ReactElement {
  const [balise, attrs, enfants] = n;
  const props: Record<string, string | number> = { key: cle };
  for (const [nom, valeur] of Object.entries(attrs)) {
    if (valeur === undefined) continue;
    if (nom === 'id') props.id = `${prefixe}${valeur}`;
    else if (nom === 'fill' && valeur.startsWith('url(#')) props.fill = `url(#${prefixe}${valeur.slice(5)}`;
    else props[nom] = valeur;
  }
  return createElement(balise, props, enfants?.map((e, i) => rendreNoeud(e, i, prefixe)));
}
