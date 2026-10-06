'use client';

import Link from 'next/link';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { surface } from './ui';

/**
 * Le bandeau d'accueil · le SEUL hero de l'application (exception assumée de la
 * Home, Kevin 30/09 · inspiration Flora).
 *
 * ── Une composition, pas un aplat ────────────────────────────────────────────
 *
 * Texte + CTA à GAUCHE, un visuel abstrait d'ITÉRATION à droite. Fond CALME
 * (surface sombre) avec un accent rose CIBLÉ (une lueur, le CTA primaire) · pas
 * un rectangle rose saturé. Le visuel est une composition SVG/CSS liée aux
 * créations/itérations · aucune image générée, aucun chiffre inventé.
 *
 * ── L'analyse d'abord ────────────────────────────────────────────────────────
 *
 * Notre priorité est analyse → itération, pas la génération en premier. Le CTA
 * PRIMAIRE mène à l'analyse (les tests, le marché) ; la création reste
 * accessible en SECONDAIRE. Le contenu vient d'UNE source (`contenu`) ·
 * l'emplacement accueillera une vraie campagne le moment venu, sans régie à
 * créer, et sans prix/partenariat fictif.
 */
export interface BandeauAccueil {
  titre: string;
  sous: string;
  /** CTA primaire · une action d'ANALYSE existante. */
  ctaLabel: string;
  href: string;
  /** CTA secondaire · la création, accessible sans être mise en avant. */
  ctaSecLabel?: string;
  hrefSec?: string;
}

/** Visuel abstrait d'itération · trois « créations » empilées, une mise en
 *  avant, et une boucle qui suggère « on reprend et on affine ». Décoratif. */
function VisuelIteration() {
  return (
    <svg aria-hidden viewBox="0 0 200 132" preserveAspectRatio="xMidYMid meet" style={{ flex: '1 1 150px', minWidth: 0, maxWidth: 220, width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="bh-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fe2c55" /><stop offset="1" stopColor="#ff2d8f" />
        </linearGradient>
      </defs>
      {/* deux cadres en retrait · les itérations passées */}
      <rect x="30" y="34" width="86" height="74" rx="12" fill="var(--paper)" stroke="var(--line-2)" transform="rotate(-9 73 71)" />
      <rect x="52" y="26" width="86" height="74" rx="12" fill="var(--surface)" stroke="var(--line-2)" transform="rotate(-3 95 63)" />
      {/* le cadre en avant · la piste courante, accent rose */}
      <rect x="78" y="22" width="92" height="80" rx="13" fill="var(--paper)" stroke="url(#bh-a)" strokeWidth="1.6" />
      {/* contenu abstrait dans le cadre · aucune donnée, juste des barres */}
      <rect x="90" y="34" width="68" height="30" rx="6" fill="var(--surface)" />
      <rect x="90" y="72" width="48" height="6" rx="3" fill="var(--line-2)" />
      <rect x="90" y="84" width="34" height="6" rx="3" fill="var(--line)" />
      {/* la boucle d'itération */}
      <path d="M60 116 q40 16 96 -2" fill="none" stroke="url(#bh-a)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1 6" />
      <path d="M150 110 l8 4 l-4 8" fill="none" stroke="#ff2d8f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HomeBandeau({ contenu }: { contenu: BandeauAccueil }) {
  return (
    <section
      aria-label="À la une"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
        overflow: 'hidden', ...surface,
        // Fond CALME · surface sombre + une lueur rose ciblée en haut à droite.
        background: 'radial-gradient(120% 150% at 100% 0%, rgba(254,44,85,.16), transparent 58%), var(--surface)',
        padding: 'clamp(20px, 4vw, 30px)', marginBottom: 20,
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 320px', maxWidth: 560 }}>
        <h2 style={{ margin: 0, fontSize: 'clamp(20px, 3.2vw, 26px)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
          {contenu.titre}
        </h2>
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
          {contenu.sous}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <Link
            href={contenu.href}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN, padding: '0 18px',
              borderRadius: 999, background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: 13.5, textDecoration: 'none',
            }}
          >
            {contenu.ctaLabel}<span aria-hidden>›</span>
          </Link>
          {contenu.hrefSec && contenu.ctaSecLabel && (
            <Link
              href={contenu.hrefSec}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, padding: '0 16px',
                borderRadius: 999, background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontWeight: 600, fontSize: 13, textDecoration: 'none',
              }}
            >
              {contenu.ctaSecLabel}
            </Link>
          )}
        </div>
      </div>
      <VisuelIteration />
    </section>
  );
}
