'use client';

import type { ReactNode } from 'react';
import type { DraftView } from '../app/actions/adsmap-draft';

/**
 * Le brouillon de Jarvis, affiché.
 *
 * Il existait en un seul endroit (les suites) et allait en exister un second
 * (le radar). Deux copies d'un même affichage divergent toujours, et celle qui
 * divergerait ici est **la mention de la réécriture** · c'est la seule chose
 * qui distingue Jarvis d'un générateur, et elle serait tombée en premier.
 *
 * ── L'ordre de lecture est délibéré ──────────────────────────────────────────
 *
 * La correction d'abord (« il s'est repris »), l'accroche ensuite, le déroulé,
 * puis l'hypothèse, puis les réserves. On lit ce qui met en doute avant de lire
 * ce qui rassure · l'inverse fait valider avant d'avoir douté.
 */
export function DraftCard({ view, children }: { view: DraftView; children?: ReactNode }) {
  return (
    <div style={{
      border: '1px solid var(--line-2)', borderRadius: 12, padding: '12px 14px',
      display: 'grid', gap: 8, background: 'var(--paper)',
    }}>
      {/* Jarvis s'est corrigé · on le dit avant de montrer le résultat. */}
      {view.rewritten && (
        <p style={{ margin: 0, fontSize: 11.5, color: '#7ee8bf', fontWeight: 700, lineHeight: 1.5 }}>
          Jarvis a réécrit son accroche · la première reprenait une formulation qui avait déjà perdu ici.
        </p>
      )}

      <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.45 }}>
        « {view.draft.headline} »
      </p>

      <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3 }}>
        {view.draft.beats.map((b, i) => (
          <li key={i} style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{b}</li>
        ))}
      </ol>

      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--ink-2)' }}>Hypothèse ·</b> {view.draft.hypothesis}
      </p>

      {view.warning && (
        <p style={{ margin: 0, fontSize: 11.5, color: '#ffcf8f', lineHeight: 1.5 }}>{view.warning}</p>
      )}

      {/* Pourquoi cette proposition · calculé depuis la mémoire, jamais rédigé
          par le modèle. Une proposition muette se subit ; une proposition qui
          s'explique se conteste. */}
      {view.draft.rationale?.map((r, i) => (
        <p key={i} style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>{r}</p>
      ))}

      {children}
    </div>
  );
}
