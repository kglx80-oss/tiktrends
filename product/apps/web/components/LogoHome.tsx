import Link from 'next/link';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';

/**
 * Le logo · toujours une porte de retour vers l'accueil, à TOUTES les largeurs.
 *
 * Kevin, 29/09 · le logo ramène à l'accueil dans TOUS les états. En déplié, il
 * porte le symbole ET le mot « TikTrends ». En replié (rail 64 px), il reste ce
 * lien (symbole seul, cible 44) · l'expansion de la barre est une icône
 * SÉPARÉE, empilée à côté dans la coquille · on ne fait pas porter deux gestes
 * (aller à l'accueil / déplier) au même bouton.
 *
 * Isolé dans son fichier · le garde le rend seul, sans traîner tout le graphe
 * de la coquille (et son `server-only`) dans un test.
 */
export function LogoHome({ collapsed }: { collapsed: boolean }) {
  const marque = <span aria-hidden style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--grad-accent)', flexShrink: 0, display: 'block' }} />;
  return (
    <Link href="/dashboard" title="Accueil" aria-label="Accueil"
      style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: collapsed ? 0 : 8, minHeight: CIBLE_TACTILE_MIN, minWidth: CIBLE_TACTILE_MIN, padding: 2, borderRadius: 11, textDecoration: 'none' }}>
      {marque}
      {!collapsed && <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--ink)', whiteSpace: 'nowrap' }}>TikTrends</span>}
    </Link>
  );
}
