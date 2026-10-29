import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { cheminPorte } from '@tiktrends/core';

/**
 * Les briques communes SANS état des vues Spatial (utilisables côté serveur) · chacune reproduit À L'IDENTIQUE le
 * balisage de la maquette (`docs/spatial/reference/*.html`). Le CSS de la
 * maquette fait le reste · aucun style n'est réécrit ici.
 */

/**
 * Planche finale · D5 · une créa RÉELLE (`.ad .ph img`) est la pub elle-même,
 * accroche comprise. Le `object-fit: cover` de la maquette la rognait en haut ·
 * le cadre `.ph` (créa 4:5 moins le bandeau) est plus large que la créa. Elle
 * s'affiche entière, jamais coupée.
 */
export const CREA_ENTIERE: CSSProperties = { objectFit: 'contain' };

/**
 * D5 · l'étiquette d'une créa (`.ad .tag`, « A · gagnante ») était posée sur
 * l'image, en haut à gauche, et masquait l'accroche. Elle passe au-dessus du
 * média, dans le cadre de la créa, sur l'encre du bandeau (`.ad .band`) · `.ad`
 * garde les mêmes couleurs dans les deux thèmes, l'étiquette aussi (blanc sur
 * #25334a · 12,7:1), sans dépendre du flou ni de l'image dessous.
 */
export const ETIQUETTE_HORS_CREA: CSSProperties = {
  position: 'static', order: -1, alignSelf: 'flex-start', margin: '8px 8px 0', background: '#25334a', backdropFilter: 'none', WebkitBackdropFilter: 'none',
};

/** Icône du sprite · `<svg class="i s"><use href="#i-…"/></svg>`. */
export function Ic({ n, s = true, c }: { n: string; s?: boolean; c?: string }) {
  return <svg className={['i', s ? 's' : '', c ?? ''].filter(Boolean).join(' ')}><use href={`#i-${n}`} /></svg>;
}

/** Le conteneur d'une vue · la maquette enveloppe chaque écran dans `div.view`. */
export function Vue({ children }: { children: ReactNode }) {
  return <div className="view">{children}</div>;
}

/**
 * Un lien interne · reste dans l'arbre Spatial (navigation client) quand la
 * destination est portée, recharge la page sinon. Les deux interfaces ne
 * partagent pas leurs feuilles de style · on ne les mélange jamais dans une
 * même page.
 */
export function Lien({ href, children, ...reste }: { href: string; children: ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  if (href.startsWith('/') && cheminPorte(href)) return <Link href={href} {...reste}>{children}</Link>;
  return <a href={href} {...reste}>{children}</a>;
}

/** L'anneau de la maquette (`ringbox ring`) · `part` de 0 à 100. */
export function Anneau({ part, taille, libelle, classe = '' }: { part: number; taille: number; libelle?: ReactNode; classe?: string }) {
  return (
    <div className={`ringbox ring ${classe}`} style={{ width: taille, height: taille }}>
      <svg viewBox="0 0 36 36">
        <circle className="tr" cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.2" />
        <circle className="pr" cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.2" pathLength={100} strokeDasharray={`${Math.max(0, Math.min(100, Math.round(part)))} 100`} />
      </svg>
      <span>{libelle}</span>
    </div>
  );
}

/** Les nombres comme la maquette (`toLocaleString("fr-FR")`). */
export const formatNombre = (n: number) => n.toLocaleString('fr-FR');

/** Les sous-sections d'une rubrique (`nav.seg.subnav`). */
export function SousNav({ items, actif }: { items: ReadonlyArray<{ href: string; libelle: ReactNode }>; actif: string }) {
  return (
    <nav className="seg subnav" aria-label="Sous-sections">
      {items.map((i) => (
        <Lien key={i.href} href={i.href} aria-current={i.href === actif ? 'page' : undefined}>{i.libelle}</Lien>
      ))}
    </nav>
  );
}

