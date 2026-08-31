'use client';

import { useEffect, useState, useTransition, type CSSProperties } from 'react';
import { iterationPlanAction, createIterationAction, type IterationPlanView, type IterationRow } from '../../../actions/adsmap-iterate';
import { Empty } from '../../../../components/Empty';
import { draftConceptAction, type DraftView } from '../../../actions/adsmap-draft';

/**
 * Le plan d'itération, et le geste qui le transforme en test.
 *
 * ── Ce qu'on affiche en premier ──────────────────────────────────────────────
 *
 * Pas la variable à changer · **ce qu'il ne faut pas toucher**. C'est
 * contre-intuitif à l'écran comme dans la tête, et c'est le seul endroit où
 * l'outil apporte quelque chose qu'un humain pressé ne fera pas tout seul :
 * quand une créa n'a pas converti, le réflexe est de tout refaire, et tout
 * refaire jette trois réponses déjà payées.
 *
 * ── Pourquoi l'hypothèse est obligatoire ici aussi ───────────────────────────
 *
 * On pourrait pré-remplir et laisser partir. Une itération sans pari écrit rend
 * un chiffre que personne ne saura interpréter · le champ reste à remplir, et
 * la raison est affichée plutôt que la contrainte.
 */

const TON: Record<string, string> = { more: '#7ee8bf', better: '#ffcf8f', new: '#9fb4ff' };

const carte: CSSProperties = {
  border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px',
  background: 'var(--surface)', display: 'grid', gap: 10,
};

export function Suites() {
  const [view, setView] = useState<IterationPlanView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [charge, lance] = useTransition();

  useEffect(() => {
    void (async () => {
      const r = await iterationPlanAction();
      if (r.error) setErr(r.error); else setView(r.view ?? null);
    })();
  }, []);

  const recharger = () => lance(async () => {
    const r = await iterationPlanAction();
    if (r.error) setErr(r.error); else { setErr(null); setView(r.view ?? null); }
  });

  if (err) {
    return <div style={{ ...carte, borderColor: '#ff8095', color: '#ff8095', fontSize: 13 }}>{err}</div>;
  }
  if (!view) {
    return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Lecture des verdicts arbitrés…</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', flex: 1, minWidth: 260, lineHeight: 1.6 }}>
          {view.summary}
        </p>
        <button
          onClick={recharger} disabled={charge}
          style={{ padding: '7px 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: charge ? 'wait' : 'pointer' }}
        >
          {charge ? 'Calcul…' : 'Recalculer'}
        </button>
      </div>

      {!view.rows.length && (
        <Empty
          tone="wait" title="Rien à itérer pour l’instant."
          why="Ce plan se remplit dès qu’un verdict est arbitré. Un verdict calculé ne suffit pas · engager une dépense sur une conclusion non prise, c’est parier sur un chiffre qui peut encore bouger."
        />
      )}

      {view.rows.map((r, i) => (
        <Ligne
          key={`${r.adId}-${r.changedVariable}-${i}`}
          row={r}
          ouvert={ouvert === `${r.adId}-${i}`}
          onToggle={() => setOuvert(ouvert === `${r.adId}-${i}` ? null : `${r.adId}-${i}`)}
          onCree={recharger}
        />
      ))}
    </div>
  );
}

function Ligne({ row, ouvert, onToggle, onCree }: {
  row: IterationRow; ouvert: boolean; onToggle: () => void; onCree: () => void;
}) {
  const [hypo, setHypo] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [envoi, lance] = useTransition();
  const [brouillon, setBrouillon] = useState<DraftView | null>(null);
  const [redige, ecrit] = useTransition();
  const ton = TON[row.mode] ?? 'var(--muted)';

  /**
   * Jarvis rédige la suite qu'il vient de conseiller.
   *
   * On lui passe le GEL tel quel · c'est la contrainte que la suite a calculée,
   * et la lui reformuler la diluerait.
   */
  const ecrire = () => ecrit(async () => {
    setMsg(null);
    const r = await draftConceptAction({
      origin: 'suite',
      intent: row.rationale,
      freeze: row.freezeLabels,
      changedVariable: row.variableLabel,
    });
    if (r.error) { setMsg(r.error); return; }
    setBrouillon(r.view ?? null);
  });

  const creer = () => lance(async () => {
    const r = await createIterationAction({
      parentAdId: row.adId, mode: row.mode,
      changedVariable: row.changedVariable, stageTargeted: row.stageTargeted,
      hypothesis: hypo,
    });
    if (r.error) { setMsg(r.error); return; }
    setMsg(r.asIteration
      ? 'Créée en itération · la filiation est enregistrée, l’ad attend son brief.'
      : 'Créée en nouveau concept · le parent n’est pas gagnant, la filiation n’aurait rien voulu dire.');
    setHypo('');
    onCree();
  });

  return (
    <div style={{ ...carte, borderLeft: `3px solid ${ton}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: ton, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {row.modeLabel}
        </span>
        <strong style={{ fontSize: 13.5, color: 'var(--ink)' }}>{row.label}</strong>
        {row.spend !== null && row.spend > 0 && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {Math.round(row.spend)} € engagés</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
          change <b style={{ color: 'var(--ink)' }}>{row.variableLabel}</b>
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.65 }}>{row.rationale}</p>

      {/* Ce qui est acquis passe avant ce qui change · c'est l'information que
          personne ne se donne tout seul. */}
      {row.freezeLabels.length > 0 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>Ne touche pas :</span>
          {row.freezeLabels.map((f) => (
            <span key={f} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}>
              {f}
            </span>
          ))}
        </div>
      )}

      {!row.edgeLegal && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6 }}>
          Le parent n’est pas gagnant · ce sera enregistré comme nouveau concept, pas comme itération.
          Repartir d’un perdant en le déclarant descendance reproduirait ce qui n’a pas marché.
        </p>
      )}

      {/* Le brouillon · c'est ici que le conseil devient un texte à tourner.
          Jarvis se relit avant de le montrer, et le dit quand il s'est corrigé. */}
      {brouillon && (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 12, padding: '12px 14px', display: 'grid', gap: 8, background: 'var(--paper)' }}>
          {brouillon.rewritten && (
            <p style={{ margin: 0, fontSize: 11.5, color: '#7ee8bf', fontWeight: 700 }}>
              Jarvis a réécrit son accroche · la première reprenait une formulation qui avait déjà perdu ici.
            </p>
          )}
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.45 }}>
            « {brouillon.draft.headline} »
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3 }}>
            {brouillon.draft.beats.map((b, i) => (
              <li key={i} style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{b}</li>
            ))}
          </ol>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            <b style={{ color: 'var(--ink-2)' }}>Hypothèse ·</b> {brouillon.draft.hypothesis}
          </p>
          {brouillon.warning && (
            <p style={{ margin: 0, fontSize: 11.5, color: '#ffcf8f', lineHeight: 1.5 }}>{brouillon.warning}</p>
          )}
          {brouillon.draft.rationale?.map((r, i) => (
            <p key={i} style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>{r}</p>
          ))}
          <button
            onClick={() => { setHypo(brouillon.draft.hypothesis); onToggle(); }}
            style={{ justifySelf: 'start', padding: '7px 14px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}
          >
            Créer la suite avec ce concept
          </button>
        </div>
      )}

      {!ouvert ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={onToggle}
            style={{ padding: '7px 14px', borderRadius: 999, border: `1px solid ${ton}`, background: 'transparent', color: ton, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
          >
            Créer la suite
          </button>
          {!brouillon && (
            <button
              onClick={ecrire} disabled={redige}
              style={{ padding: '7px 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontWeight: 700, fontSize: 12.5, cursor: redige ? 'wait' : 'pointer' }}
            >
              {redige ? 'Jarvis écrit…' : 'Demander le concept à Jarvis'}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>
            Ce que ce test parie · sans hypothèse écrite, son résultat n’apprendra rien
          </label>
          <textarea
            value={hypo} onChange={(e) => setHypo(e.target.value)} rows={2}
            placeholder={`En changeant ${row.variableLabel}, j’attends…`}
            style={{ width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={creer} disabled={envoi || hypo.trim().length < 10}
              style={{ padding: '8px 16px', borderRadius: 999, border: 'none', background: hypo.trim().length < 10 ? 'var(--line-2)' : 'var(--grad-accent)', color: hypo.trim().length < 10 ? 'var(--muted)' : '#0d070c', fontWeight: 800, fontSize: 12.5, cursor: envoi ? 'wait' : 'pointer' }}
            >
              {envoi ? 'Création…' : 'Créer'}
            </button>
            <button
              onClick={onToggle}
              style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--muted)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
            >
              Annuler
            </button>
            {msg && <span style={{ fontSize: 12, color: msg.startsWith('Créée') ? '#7ee8bf' : '#ff8095' }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
