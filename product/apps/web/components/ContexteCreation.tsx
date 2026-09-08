'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
  const [described, setDescribed] = useState<number | null>(null);

  useEffect(() => {
    let vivant = true;
    marketCoverageAction().then((r) => { if (vivant) setDescribed(r.described); }).catch(() => {});
    return () => { vivant = false; };
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 18, fontSize: 12.5, color: 'var(--muted)' }}>
      <span style={{ fontSize: 14 }}>🎯</span>
      {brandName && <><b style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{brandName}</b><Sep /></>}

      {/* Ce que la catégorie a appris · lu au montage, en clair et sans bouton. */}
      {described === null ? (
        <span>catégorie · lecture…</span>
      ) : described === 0 ? (
        <span>catégorie pas encore décrite · <Link href="/veille" style={lien}>suivre des concurrents ›</Link></span>
      ) : (
        <span>ta catégorie suit <b style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{described}</b> concurrent{described > 1 ? 's' : ''} · tes pubs en suivent la grammaire</span>
      )}

      {/* Jarvis · admin seulement, réduit à une puce cliquable. Plus d'encart. */}
      {isAdmin && (
        <>
          <Sep />
          <Link href="/jarvis" style={{ ...lien, color: edenCount ? '#7ee8bf' : 'var(--accent-strong)' }}>
            🧠 {edenCount ? `${edenCount} règle${edenCount > 1 ? 's' : ''} maison` : 'Jarvis à configurer'} ›
          </Link>
        </>
      )}
    </div>
  );
}

function Sep() {
  return <span style={{ color: 'var(--line-2)' }}>·</span>;
}

const lien = { color: 'var(--accent-strong)', fontWeight: 600, textDecoration: 'none' } as const;
