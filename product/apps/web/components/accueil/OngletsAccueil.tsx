import Link from 'next/link';
import { CIBLE_TACTILE_MIN, type OngletAccueil } from '@tiktrends/core';

/**
 * Le sélecteur de vue de l'Accueil · lot 19A.
 *
 * De VRAIS liens (`?vue=`), pas un état local · la vue survit au rechargement,
 * au bouton Retour et au partage d'adresse. L'onglet actif s'annonce
 * (`aria-current="page"`), pas seulement par sa couleur · 44 px au doigt
 * (`CIBLE_TACTILE_MIN`) · le focus clavier suit le `:focus-visible` global.
 *
 * Les onglets viennent du noyau (`resoudreAccueil`) · une liste vide (rôle qui
 * n'ouvre pas Analytics) ne rend RIEN · l'Accueil reste celui d'avant.
 */
export function OngletsAccueil({ onglets }: { onglets: readonly OngletAccueil[] }) {
  if (onglets.length === 0) return null;
  return (
    <nav aria-label="Vues de l’accueil" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', margin: '0 0 14px' }}>
      {onglets.map((o) => (
        <Link
          key={o.vue}
          href={o.href}
          aria-current={o.actif ? 'page' : undefined}
          style={{
            display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', marginBottom: -1,
            fontSize: 14, fontWeight: o.actif ? 700 : 600, textDecoration: 'none', whiteSpace: 'nowrap',
            color: o.actif ? 'var(--ink)' : 'var(--muted)',
            borderBottom: `2px solid ${o.actif ? 'var(--accent-strong)' : 'transparent'}`,
          }}
        >
          {o.libelle}
        </Link>
      ))}
    </nav>
  );
}
