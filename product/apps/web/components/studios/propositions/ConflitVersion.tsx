import type { ErreurProposition } from '../../../lib/studios/propositions/types';
import { texteValeur } from '@tiktrends/core';
import { boutonPrimaire, mini, signal, texte } from './styles';

/**
 * 409 · le projet a changé depuis la version de base de la proposition. On
 * montre les DIFFÉRENCES base → courante (ce que l'autre onglet a fait), on
 * n'écrase rien, et le seul geste proposé est de recharger la version courante.
 */
export function ConflitVersion({ erreur, onRecharger, enCours }: { erreur: ErreurProposition; onRecharger: () => void; enCours?: boolean }) {
  const differences = erreur.conflit?.differences ?? [];
  return (
    <div role="alert" style={{ ...signal('warn'), display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>Conflit de version · rien n’a été écrasé</p>
      <p style={texte}>{erreur.message}</p>
      {differences.length > 0 && (
        <div>
          <p style={{ ...mini, fontWeight: 600 }}>Ce qui a changé depuis la base · {differences.length}</p>
          <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {differences.slice(0, 10).map((d) => (
              <li key={d.chemin} style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{d.chemin}</code>
                <br />
                <span style={{ textDecoration: 'line-through', textDecorationColor: 'var(--muted)' }}>{texteValeur(d.base)}</span>
                {' → '}
                <span style={{ color: 'var(--ink)' }}>{texteValeur(d.courant)}</span>
              </li>
            ))}
            {differences.length > 10 && <li style={mini}>… et {differences.length - 10} autre(s)</li>}
          </ul>
        </div>
      )}
      <div>
        <button type="button" style={{ ...boutonPrimaire, opacity: enCours ? 0.6 : 1 }} disabled={enCours} aria-busy={enCours} onClick={onRecharger}>
          Recharger la version courante
        </button>
      </div>
      <p style={mini}>Identifiant support · <code style={{ fontFamily: 'var(--font-mono)' }}>{erreur.traceId}</code></p>
    </div>
  );
}
