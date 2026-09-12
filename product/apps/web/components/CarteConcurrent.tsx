import Link from 'next/link';
import { domaineConcurrent } from '@tiktrends/core';
import { Icon } from './Icon';
import { AvatarSite } from './AvatarSite';

/**
 * Une carte de concurrent · plus lisible qu'une ligne grise.
 *
 * ── Ce qu'elle montre ────────────────────────────────────────────────────────
 *
 * Un avatar : la favicon du site quand un domaine est là (posée en fond CSS sur
 * un dégradé teinté · si elle ne charge pas, 404 ou blocage, le dégradé reste,
 * sans icône cassée et sans JS), sinon les initiales sur ce même dégradé, dont la
 * couleur est propre à la marque. Le nom, le domaine cliquable quand il existe
 * (« voir le site »), et l'entrée dans l'analyse.
 *
 * ── Pas d'ancre dans une ancre ───────────────────────────────────────────────
 *
 * La carte porte DEUX actions distinctes · analyser (avatar, nom, CTA) et visiter
 * le site (le domaine). Elles sont côte à côte, jamais imbriquées · un `<a>` dans
 * un `<a>` est du HTML invalide. Le domaine est le seul lien externe.
 *
 * Pur affichage · aucune action serveur, aucune donnée dérivée ici (le noyau s'en
 * charge, et un test l'exerce). Rendu et lu en test.
 */
export function CarteConcurrent({ nom, brandId }: { nom: string; brandId: string }) {
  const domaine = domaineConcurrent(nom);
  const analyser = `/brands/${brandId}/competitors/${encodeURIComponent(nom)}`;
  return (
    <div style={{
      display: 'grid', gap: 8, border: '1px solid var(--line)', borderRadius: 14,
      background: 'var(--surface)', padding: 12,
    }}>
      {/* minWidth:0 · la rangée est un enfant de grille (min-width auto par
          défaut) · sans ça, un nom long ne se rétrécit pas, pousse « Analyser ›»
          hors de la carte et la fait déborder. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <Link href={analyser} aria-label={`Analyser ${nom}`} style={{ display: 'inline-flex', flexShrink: 0, borderRadius: 11, textDecoration: 'none' }}>
          <AvatarSite nom={nom} site={nom} taille={44} rayon={11} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={analyser} style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--ink)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom}</Link>
          {domaine ? (
            <a href={`https://${domaine}`} target="_blank" rel="noopener noreferrer nofollow" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2, fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
              <Icon name="link" size={11} /> {domaine}
            </a>
          ) : (
            <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--muted)' }}>Concurrent suivi</span>
          )}
        </div>
        <Link href={analyser} style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: 'var(--accent-strong)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Analyser ›</Link>
      </div>
    </div>
  );
}
