import Link from 'next/link';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';

/**
 * Le logo · une porte de retour vers l'accueil.
 *
 * Il ne menait nulle part · on cliquait dessus par réflexe (toute app ramène à
 * l'accueil par son logo) et rien ne bougeait. Déplié, c'est un lien vers le
 * Dashboard. Replié, la barre n'a la place que d'un geste · le logo la rouvre,
 * et le retour reste au fil d'Ariane et au rail.
 *
 * Isolé dans son fichier · le garde le rend seul, sans traîner tout le graphe
 * de la coquille (et son `server-only`) dans un test.
 */
export function LogoHome({ collapsed, onExpand }: { collapsed: boolean; onExpand: () => void }) {
  const marque = <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--grad-accent)', flexShrink: 0, display: 'block' }} />;
  if (collapsed) {
    return (
      <button type="button" onClick={onExpand} title="Déplier la barre" aria-label="Déplier la barre"
        style={{ width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}>
        {marque}
      </button>
    );
  }
  return (
    <Link href="/dashboard" title="Accueil" aria-label="Accueil"
      style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, minWidth: CIBLE_TACTILE_MIN, padding: 2, borderRadius: 11, textDecoration: 'none' }}>
      {marque}
    </Link>
  );
}
