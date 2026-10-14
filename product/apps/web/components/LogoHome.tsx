import Link from 'next/link';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';

/**
 * Le logo · toujours une porte de retour vers l'accueil, à TOUTES les largeurs.
 *
 * Kevin, 29/09 · le logo ramène à l'accueil dans TOUS les états. En replié
 * (rail 64 px), il reste ce lien (cible 44) · l'expansion de la barre est une
 * icône SÉPARÉE, empilée dessous dans la coquille · on ne fait pas porter deux
 * gestes (aller à l'accueil / déplier) au même bouton.
 *
 * V5 (lot V5 · B, R01 · R02) · le mot-symbole « tiktrends. » (le nom du
 * produit, pas une marque tierce), le point à l'accent · 20 px, interlettrage
 * −0,7 px, mesurés sur la référence. Replié · « t. ». Le carré dégradé d'avant
 * disparaît.
 *
 * Isolé dans son fichier · le garde le rend seul, sans traîner tout le graphe
 * de la coquille (et son `server-only`) dans un test.
 */
export function LogoHome({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/dashboard" title="Accueil" aria-label="Accueil"
      style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', minHeight: CIBLE_TACTILE_MIN, minWidth: CIBLE_TACTILE_MIN, padding: collapsed ? 0 : '0 6px', borderRadius: 8, textDecoration: 'none' }}>
      <span aria-hidden data-logo style={{ fontSize: 20, lineHeight: '30px', fontWeight: 400, letterSpacing: '-0.7px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>
        {collapsed ? 't' : 'tiktrends'}<b style={{ color: 'var(--accent-strong)', fontWeight: 700 }}>.</b>
      </span>
    </Link>
  );
}
