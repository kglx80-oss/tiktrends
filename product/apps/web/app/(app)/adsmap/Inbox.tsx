'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  listDecisionsAction, refreshDecisionsAction, resolveDecisionAction,
  type Inbox as InboxData, type InboxItem,
} from '../../actions/adsmap-decisions';
import { AdDrawer } from './AdDrawer';

/**
 * File de décisions du jour.
 *
 * La Table dit où en est chaque test, la Carte ce qui n'a pas été essayé. Cette
 * file dit **ce qu'il faut décider maintenant** · c'est le seul des trois écrans
 * qu'on peut ouvrir cinq minutes le matin et refermer.
 *
 * Deux choix d'interface découlent du reste :
 *
 *  - le montant en jeu est affiché sur chaque ligne, parce que c'est lui qui
 *    justifie l'ordre · sans lui, la file ressemble à un tri arbitraire ;
 *  - « Fait » et « Pas un problème » sont deux boutons distincts. Le premier
 *    disparaît au recalcul si les faits ont suivi, le second empêche la
 *    reproposition · les confondre ferait revenir chaque nuit ce qu'on a
 *    délibérément écarté.
 */

const TYPE_LABEL: Record<string, string> = {
  kill_suggested: 'À couper',
  unmapped_ad: 'Non mesurée',
  validate_verdict: 'À arbitrer',
  protocol_violation: 'Protocole',
  prelaunch_warning: 'Avant lancement',
  accept_iteration: 'À itérer',
  coverage_gap: 'Territoire',
};

const TON: Record<number, { bd: string; fg: string }> = {
  1: { bd: 'rgba(254,44,85,.45)', fg: '#ff8095' },
  2: { bd: 'rgba(245,166,35,.4)', fg: '#ffcf8f' },
  3: { bd: 'var(--line-2)', fg: 'var(--ink-2)' },
  4: { bd: 'var(--line)', fg: 'var(--muted)' },
};

export function Inbox() {
  const [data, setData] = useState<InboxData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ouverte, setOuverte] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const r = await listDecisionsAction();
    if (r.error) { setError(r.error); return; }
    setError(''); setData(r.inbox!);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  async function recalculer() {
    if (busy) return;
    setBusy(true); setError('');
    const r = await refreshDecisionsAction();
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setData(r.inbox!);
  }

  async function fermer(item: InboxItem, status: 'done' | 'dismissed') {
    if (busy) return;
    setBusy(true);
    // Retrait optimiste · la ligne disparaît sous le doigt, comme dans une liste
    // de tâches. Le recalcul confirmera.
    setData((d) => (d ? { ...d, items: d.items.filter((x) => x.id !== item.id) } : d));
    const r = await resolveDecisionAction(item.id, status);
    setBusy(false);
    if (r.error) { setError(r.error); await charger(); }
  }

  if (error && !data) return <p style={{ color: '#ff8095', fontSize: 13 }}>{error}</p>;
  if (!data) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</p>;

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14,
        padding: '12px 15px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)',
      }}>
        <span style={{ flex: '1 1 320px', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.5 }}>
          {data.summary}
        </span>
        <button type="button" onClick={recalculer} disabled={busy} style={{
          padding: '7px 15px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent',
          color: 'var(--ink)', fontWeight: 700, fontSize: 12, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        }}>
          {busy ? '…' : 'Recalculer'}
        </button>
      </div>

      {error && <p style={{ color: '#ff8095', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}

      {data.items.length === 0 ? (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 16, padding: '34px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 26 }}>✓</div>
          <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink)', fontWeight: 700 }}>Rien à décider.</p>
          <p style={{ margin: '6px auto 0', fontSize: 12.5, color: 'var(--muted)', maxWidth: 460, lineHeight: 1.6 }}>
            La file se remplit après chaque mesure · lance « Mesurer maintenant », ou attends la synchro
            de la nuit. {data.dismissed > 0 && `${data.dismissed} décision(s) écartée(s) ne reviendront pas.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {data.items.map((it) => {
            const ton = TON[it.priority] ?? TON[3]!;
            return (
              <div key={it.id} style={{
                border: `1px solid ${ton.bd}`, borderRadius: 12, background: 'var(--surface)', padding: '12px 15px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '2px 9px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '.04em', color: ton.fg, border: `1px solid ${ton.bd}`,
                  }}>
                    {TYPE_LABEL[it.type] ?? it.type}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.45 }}>
                    {it.title}
                  </span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{it.action}</p>

                <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
                  {it.targetKind === 'ad' && (
                    <button type="button" onClick={() => setOuverte(it.targetId)} style={{ ...petit, color: 'var(--accent-strong)' }}>
                      Ouvrir la fiche
                    </button>
                  )}
                  <button type="button" onClick={() => fermer(it, 'done')} disabled={busy} style={petit}>Fait</button>
                  <button type="button" onClick={() => fermer(it, 'dismissed')} disabled={busy} style={{ ...petit, color: 'var(--muted)' }}
                    title="Ne plus proposer cette décision">
                    Pas un problème
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ouverte && (
        <AdDrawer adId={ouverte} onClose={() => setOuverte(null)} onChanged={() => { void recalculer(); }} />
      )}
    </div>
  );
}

const petit: CSSProperties = {
  padding: '4px 11px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper)',
  color: 'var(--ink-2)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
};
