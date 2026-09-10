import type { ReactNode } from 'react';

/**
 * Le bandeau d'état d'une page · une seule grammaire visuelle.
 *
 * L'état « données d'exemple » avait quatre formes à travers l'outil · bannière
 * riche ici, filet mince là, pastille ailleurs. Quatre fois le même sens, quatre
 * dessins · l'œil ne les relie pas. Ici, un seul composant, trois tons, et une
 * sortie optionnelle vers le réel.
 *
 * `demo` · ces chiffres sont un échantillon. `info` · un fait de contexte.
 * `error` · la source a échoué. La `sortie` est le geste pour passer au réel ·
 * elle n'apparaît que si un geste existe (brancher un compte, créer une marque).
 */
export type TonBandeau = 'demo' | 'info' | 'error';

const TONS: Record<TonBandeau, { bg: string; border: string; emoji: string }> = {
  demo: { bg: 'rgba(245,166,35,.08)', border: 'rgba(245,166,35,.30)', emoji: '🧪' },
  info: { bg: 'rgba(122,162,255,.08)', border: 'rgba(122,162,255,.30)', emoji: 'ℹ️' },
  error: { bg: 'rgba(255,77,109,.08)', border: 'rgba(255,77,109,.35)', emoji: '⚠️' },
};

export function Bandeau({ ton = 'info', titre, sortie, children }: {
  ton?: TonBandeau;
  /** Titre court en gras · « Mode démonstration », par exemple. */
  titre?: string;
  /** Le geste vers le réel · absent quand il n'y en a pas (honnêteté). */
  sortie?: { href: string; label: string };
  children: ReactNode;
}) {
  const t = TONS[ton];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: `1px solid ${t.border}`, borderRadius: 14, background: t.bg, padding: '12px 16px', margin: '0 0 20px' }}>
      <span style={{ fontSize: 18 }}>{t.emoji}</span>
      <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
        {titre && <b style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', marginRight: 8 }}>{titre}</b>}
        {children}
      </div>
      {sortie && (
        <a href={sortie.href} style={{ padding: '9px 16px', borderRadius: 999, background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 12.5, textDecoration: 'none', whiteSpace: 'nowrap' }}>{sortie.label} ›</a>
      )}
    </div>
  );
}
