'use client';

import Link from 'next/link';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';

/**
 * Le bandeau d'accueil · le SEUL hero de l'application.
 *
 * ── Pourquoi une exception au « pas de hero » ────────────────────────────────
 *
 * Le reste de l'app suit une charte sobre sans hero (halo, grille de fond). La
 * Home est l'exception assumée (Kevin, 30/09, inspiration Flora) · elle mène par
 * un bandeau visuel qui dit ce que l'outil fait gagner et ouvre sur une action.
 *
 * ── Contenu produit RÉEL, jamais une fausse promo ────────────────────────────
 *
 * Le message porte la valeur produit et le CTA pointe une action qui EXISTE
 * (studio, choix de marque). Aucun prix, partenariat ni promotion fictive. Le
 * contenu vient d'UNE source (`contenu`) · l'emplacement est prêt à recevoir une
 * vraie campagne le moment venu, sans qu'on ait à créer une régie pour ça.
 */
export interface BandeauAccueil {
  titre: string;
  sous: string;
  ctaLabel: string;
  /** Destination RÉELLE · une route existante de l'app. */
  href: string;
}

export function HomeBandeau({ contenu }: { contenu: BandeauAccueil }) {
  return (
    <section
      aria-label="À la une"
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: 18,
        border: '1px solid var(--line-2)', background: 'var(--grad-accent)',
        padding: 'clamp(20px, 4vw, 32px)', marginBottom: 24,
      }}
    >
      <div style={{ position: 'relative', maxWidth: 620, minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 'clamp(20px, 3.2vw, 26px)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.01em', color: 'var(--on-accent)' }}>
          {contenu.titre}
        </h2>
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--on-accent)', opacity: 0.92 }}>
          {contenu.sous}
        </p>
        <Link
          href={contenu.href}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN,
            marginTop: 16, padding: '0 18px', borderRadius: 999,
            background: 'var(--on-accent)', color: 'var(--ink)', fontWeight: 700, fontSize: 13.5, textDecoration: 'none',
          }}
        >
          {contenu.ctaLabel}<span aria-hidden>›</span>
        </Link>
      </div>
    </section>
  );
}
