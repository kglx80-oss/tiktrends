'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { useIsMobile } from './useIsMobile';
import { marketCoverageAction } from '../app/actions/market-learn';

/**
 * Le contexte de création · UNE ligne, jamais un panneau.
 *
 * ── Ce que cette ligne remplace ──────────────────────────────────────────────
 *
 * L'écran de création ouvrait sur trois blocs empilés avant la moindre pub · un
 * encart « générer des pubs » qui explique ce que le chemin guidé rend évident,
 * un encart Jarvis (admin) haut de deux lignes, et un panneau « Ta catégorie »
 * avec ses boutons. Trois blocs, deux CTA, pour un contexte qu'on lit d'un coup
 * d'œil et qu'on ne décide pas ici.
 *
 * Le contexte INFORME, il n'interrompt pas. Il tient sur une ligne : la marque,
 * ce que la catégorie a appris, et — pour l'admin — l'état de Jarvis. Enrichir
 * la catégorie et régler Jarvis sont des gestes d'analyse · ils vivent où l'on
 * analyse (Veille, Jarvis), pas sur le chemin de création. Ici, juste des liens.
 *
 * ── Coût ─────────────────────────────────────────────────────────────────────
 *
 * Une seule requête légère au montage · le COMPTE de concurrents décrits, pas la
 * grammaire. Un échec de lecture laisse la ligne sans le compte, jamais en erreur.
 */
export function ContexteCreation({ brandName, edenCount, isAdmin }: {
  brandName: string | null;
  edenCount: number;
  isAdmin: boolean;
}) {
  // Deux unités DISTINCTES · les créas décrites (`count(*)`) et les concurrents
  // qui les portent (`count(distinct advertiser)`). Les confondre affichait « 16
  // concurrents » là où il y avait 16 créas de 2 concurrents (CDC v8 · F05).
  const [couverture, setCouverture] = useState<{ described: number; advertisers: number } | null>(null);
  // Sur téléphone, le contexte DÉTAILLÉ (catégorie, concurrents, Jarvis) mange
  // trois lignes avant la moindre commande · il passe derrière un accès
  // « Contexte », l'info reste à un geste. Sur grand écran, il tient sur une
  // ligne et s'affiche tel quel. `false` au SSR, corrigé par matchMedia.
  const compact = useIsMobile('(max-width: 768px)');
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    let vivant = true;
    marketCoverageAction().then((r) => { if (vivant) setCouverture({ described: r.described, advertisers: r.advertisers }); }).catch(() => {});
    return () => { vivant = false; };
  }, []);
  const described = couverture?.described ?? null;
  const advertisers = couverture?.advertisers ?? 0;

  // Le repli mobile · un déclencheur compact (cible 44) qui montre/masque le
  // détail. Le détail lui-même est le MÊME bloc que sur grand écran.
  if (compact && !ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} aria-expanded={false} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN, marginBottom: 14,
        padding: '0 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
      }}>
        <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="target" size={14} /></span>
        Contexte{brandName ? <> · <b style={{ fontWeight: 700 }}>{brandName}</b></> : ''}
        <span aria-hidden style={{ color: 'var(--muted)' }}>▾</span>
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 18, fontSize: 12.5, color: 'var(--muted)' }}>
      {compact && (
        <button type="button" onClick={() => setOuvert(false)} aria-expanded aria-label="Masquer le contexte" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN,
          padding: 0, borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', flexShrink: 0,
        }}>▴</button>
      )}
      <span style={{ display: "inline-flex" }}><Icon name="target" size={14} /></span>
      {brandName && <><b style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{brandName}</b><Sep /></>}

      {/* Ce que la catégorie a appris · lu au montage, en clair et sans bouton. */}
      {described === null ? (
        <span>catégorie · lecture…</span>
      ) : described === 0 ? (
        <span>catégorie pas encore décrite · <Link href="/veille" style={lien}>suivre des concurrents ›</Link></span>
      ) : (
        <CouvertureMarche described={described} advertisers={advertisers} />
      )}

      {/* Jarvis · admin seulement, réduit à une puce cliquable. Plus d'encart. */}
      {isAdmin && (
        <>
          <Sep />
          <Link href="/jarvis" style={{ ...lien, color: edenCount ? '#7ee8bf' : 'var(--accent-strong)' }}>
            <span style={{ display: 'inline-flex', verticalAlign: '-2px', marginRight: 4 }}><Icon name="brain" size={14} /></span>{edenCount ? `${edenCount} règle${edenCount > 1 ? 's' : ''} maison` : 'Jarvis à configurer'} ›
          </Link>
        </>
      )}
    </div>
  );
}

/**
 * La couverture du marché · deux unités DISTINCTES, jamais confondues (F05) · les
 * créas décrites d'un côté, les concurrents qui les portent de l'autre. « 16
 * créas de 2 concurrents » ne se dit pas « 16 concurrents ».
 */
export function CouvertureMarche({ described, advertisers }: { described: number; advertisers: number }) {
  const gras = { color: 'var(--ink-2)', fontWeight: 700 } as const;
  return (
    <span>
      ta catégorie · <b style={gras}>{described}</b> créa{described > 1 ? 's' : ''} décrite{described > 1 ? 's' : ''}
      {advertisers > 0 && <> chez <b style={gras}>{advertisers}</b> concurrent{advertisers > 1 ? 's' : ''}</>}
      {' '}· tes pubs en suivent la grammaire
    </span>
  );
}

function Sep() {
  return <span style={{ color: 'var(--line-2)' }}>·</span>;
}

const lien = { color: 'var(--accent-strong)', fontWeight: 600, textDecoration: 'none' } as const;
