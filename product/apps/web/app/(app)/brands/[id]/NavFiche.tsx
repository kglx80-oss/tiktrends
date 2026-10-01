import Link from 'next/link';
import type { ReactNode } from 'react';
import { extensionCible, FICHE_MARQUE_MESURES } from '@tiktrends/core';

/**
 * La navigation de la fiche Marque · retour, liens d'en-tête, onglets.
 *
 * Recette #106b · chaque cible offre 44 px de zone cliquable SANS grossir le
 * rendu validé · rembourrage transparent compensé (noyau `extensionCible`,
 * hauteurs mesurées `FICHE_MARQUE_MESURES`). L'onglet actif s'annonce
 * (`aria-current`), pas seulement par sa couleur.
 */

const extRetour = extensionCible(FICHE_MARQUE_MESURES.retour.visuel, { libreBas: FICHE_MARQUE_MESURES.retour.libreBas });
const extOnglet = extensionCible(FICHE_MARQUE_MESURES.onglet.visuel, { libreBas: FICHE_MARQUE_MESURES.onglet.libreBas });
const extEntete = extensionCible(FICHE_MARQUE_MESURES.lienEntete.visuel, { libreBas: FICHE_MARQUE_MESURES.lienEntete.libreBas });

/** « ‹ Marques » · lien EN LIGNE · son rembourrage vertical étend la zone sans occuper de place. */
export function RetourMarques() {
  return (
    <Link href="/brands" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', paddingTop: extRetour.haut, paddingBottom: extRetour.bas }}>‹ Marques</Link>
  );
}

/** Lien d'en-tête · la PILULE visible garde sa taille, le lien autour est étendu puis compensé. */
export function LienEnteteMarque({ href, title, children }: { href: string; title?: string; children: ReactNode }) {
  return (
    <Link href={href} title={title} style={{ display: 'inline-flex', alignItems: 'center', paddingTop: extEntete.haut, paddingBottom: extEntete.bas, marginTop: -extEntete.haut, marginBottom: -extEntete.bas, textDecoration: 'none' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, boxSizing: 'border-box', padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontWeight: 700, fontSize: 12.5 }}>
        {children}
      </span>
    </Link>
  );
}

/** Les onglets · zone étendue AU-DESSUS seulement, le soulignement reste posé sur le filet. */
export function OngletsFiche({ id, actif, onglets }: { id: string; actif: string; onglets: Array<{ key: string; label: string; count?: number }> }) {
  return (
    <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--line)', margin: '16px 0 20px', flexWrap: 'wrap' }}>
      {onglets.map((t) => {
        const active = t.key === actif;
        return (
          <Link key={t.key} href={`/brands/${id}?tab=${t.key}`} aria-current={active ? 'page' : undefined} style={{
            padding: `${9 + extOnglet.haut}px 14px ${9 + extOnglet.bas}px`, marginTop: -extOnglet.haut, fontSize: 13.5, fontWeight: active ? 800 : 600, textDecoration: 'none',
            color: active ? 'var(--accent-strong)' : 'var(--muted)',
            borderBottom: `2px solid ${active ? 'var(--accent-strong)' : 'transparent'}`, marginBottom: -1,
          }}>{t.label}{t.count ? <span style={{ fontSize: 11, marginLeft: 6, color: 'var(--muted)' }}>{t.count}</span> : null}</Link>
        );
      })}
    </div>
  );
}
