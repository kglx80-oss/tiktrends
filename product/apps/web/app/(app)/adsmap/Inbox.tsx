'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  listDecisionsAction, refreshDecisionsAction, resolveDecisionAction,
  type Inbox as InboxData, type InboxItem,
} from '../../actions/adsmap-decisions';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { AdDrawer } from './AdDrawer';
import { Empty } from '../../../components/Empty';
import { Bandeau } from '../../../components/Bandeau';

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

export function Inbox({ peutPartager = false }: { peutPartager?: boolean }) {
  const [data, setData] = useState<InboxData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ouverte, setOuverte] = useState<string | null>(null);
  // Raisons longues repliées · on déplie ligne par ligne sans jamais perdre le texte.
  const [deplie, setDeplie] = useState<Set<string>>(() => new Set());
  const basculer = (id: string) =>
    setDeplie((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

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

  if (error && !data) return <Bandeau ton="error">{error}</Bandeau>;
  if (!data) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</p>;

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12,
        padding: '9px 13px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)',
      }}>
        <span style={{ flex: '1 1 200px', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.45 }}>
          {data.summary}
        </span>
        <button type="button" onClick={recalculer} disabled={busy} style={{
          minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center',
          padding: '7px 15px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent',
          color: 'var(--ink)', fontWeight: 700, fontSize: 12, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        }}>
          {busy ? '…' : 'Recalculer'}
        </button>
      </div>

      {error && <Bandeau ton="error">{error}</Bandeau>}

      {data.items.length === 0 ? (
        <Empty
          tone="good" icon="check" title="Rien à décider."
          why={<>La file se remplit après chaque mesure · lance « Mesurer maintenant », ou attends la synchro
            de la nuit. {data.dismissed > 0 && `${data.dismissed} décision(s) écartée(s) ne reviendront pas.`}</>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.items.map((it) => {
            const ton = TON[it.priority] ?? TON[3]!;
            // Une raison longue se replie · le texte reste entier, on n'en montre
            // qu'une ligne tant qu'on n'a pas déplié.
            const long = it.action.length > 110;
            const ouvertRaison = deplie.has(it.id);
            return (
              <div key={it.id} style={{
                border: `1px solid ${ton.bd}`, borderRadius: 12, background: 'var(--surface)', padding: '10px 13px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: 9.5, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '.04em', color: ton.fg, border: `1px solid ${ton.bd}`,
                  }}>
                    {TYPE_LABEL[it.type] ?? it.type}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.4 }}>
                    {it.title}
                  </span>
                </div>
                {it.action && (
                  <p style={{
                    margin: '5px 0 0', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45,
                    ...(long && !ouvertRaison ? { display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : null),
                  }}>{it.action}</p>
                )}
                {long && (
                  <button type="button" onClick={() => basculer(it.id)} style={lienReplier}>
                    {ouvertRaison ? 'Replier' : 'Déplier'}
                  </button>
                )}

                <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
                  {/* Ouvrir la fiche · action PRIMAIRE (là où on décide vraiment).
                      Fait / Pas un problème restent accessibles, en retrait. */}
                  {it.targetKind === 'ad' && (
                    <button type="button" onClick={() => setOuverte(it.targetId)} style={principal}>
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
        <AdDrawer adId={ouverte} onClose={() => setOuverte(null)} onChanged={() => { void recalculer(); }} peutPartager={peutPartager} />
      )}
    </div>
  );
}

const petit: CSSProperties = {
  minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center',
  padding: '4px 13px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper)',
  color: 'var(--ink-2)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
};

/** L'action primaire de chaque décision · où l'on ouvre vraiment le test. */
const principal: CSSProperties = {
  minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center',
  padding: '4px 15px', borderRadius: 8, border: '1px solid var(--accent-strong)', background: 'var(--accent-soft)',
  color: 'var(--accent-strong)', fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
};

/** Le repli d'une raison longue · discret, mais tappable à la cible du noyau. */
const lienReplier: CSSProperties = {
  minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center',
  padding: 0, background: 'none', border: 'none',
  color: 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline',
};
