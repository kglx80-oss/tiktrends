'use client';

import { useEffect, useState, useTransition, type CSSProperties } from 'react';
import {
  radarViewAction, setRadarAction, runRadarNowAction, radarCostPreviewAction,
  type RadarView,
} from '../../../actions/adsmap-radar';

/**
 * Le radar, et son interrupteur.
 *
 * L'écran est construit autour d'un seul principe : **le coût est affiché avant
 * l'interrupteur, pas à côté**. C'est la première fonction qui dépense sans
 * qu'on ait cliqué, et le chiffre montré est le pire cas — trente nuits pleines
 * au plafond choisi. Personne ne se fait surprendre par une moyenne.
 */

const carte: CSSProperties = {
  border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px',
  background: 'var(--surface)', display: 'grid', gap: 12,
};

const usd = (n: number) => `${n.toFixed(2)} $`;

export function Radar() {
  const [view, setView] = useState<RadarView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cap, setCap] = useState(3);
  const [apercu, setApercu] = useState<{ nightly: number; monthly: number } | null>(null);
  const [busy, lance] = useTransition();

  const charger = async () => {
    const r = await radarViewAction();
    if (r.error) setErr(r.error);
    else { setErr(null); setView(r.view ?? null); if (r.view) setCap(r.view.state.cap); }
  };

  useEffect(() => { void charger(); }, []);
  useEffect(() => { void radarCostPreviewAction(cap).then(setApercu); }, [cap]);

  if (err) return <div style={{ ...carte, borderColor: '#ff8095', color: '#ff8095', fontSize: 13 }}>{err}</div>;
  if (!view) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</div>;

  const { state, findings, spend } = view;
  const restant = Math.max(0, spend.capUsd - spend.spentUsd);

  const basculer = (armed: boolean) => lance(async () => {
    const r = await setRadarAction({ armed, cap });
    if (r.error) { setMsg(r.error); return; }
    setMsg(armed
      ? `Radar armé · au plus ${usd(apercu?.nightly ?? 0)} par nuit.`
      : 'Radar éteint · plus aucune dépense en arrière-plan.');
    await charger();
  });

  const passer = () => lance(async () => {
    setMsg('Passage en cours…');
    const r = await runRadarNowAction();
    setMsg(r.error ?? `${r.digest ?? ''}${r.analyzed ? ` · ${usd(r.spentUsd ?? 0)} dépensés.` : ''}`);
    await charger();
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Le coût vient AVANT l'interrupteur · c'est tout le propos de l'écran. */}
      <div style={{ ...carte, borderColor: state.armed ? '#7ee8bf' : 'var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: state.armed ? '#7ee8bf' : 'var(--muted)' }}>
            {state.armed ? 'Armé' : 'Éteint'}
          </span>
          <span style={{ flex: 1 }} />
          {state.lastRunAt && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              dernier passage {new Date(state.lastRunAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
            Créas décrites par nuit
            <input
              type="number" min={1} max={20} value={cap}
              onChange={(e) => setCap(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              style={{ width: 62, marginLeft: 10, padding: '6px 9px', borderRadius: 9, border: '1px solid var(--line-2)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13 }}
            />
          </label>
          {apercu && (
            <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>
              soit <b>{usd(apercu.nightly)}</b> par nuit · <b>{usd(apercu.monthly)}</b> sur 30 nuits pleines
            </span>
          )}
        </div>

        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          Chiffre du pire cas · une nuit sans créa ayant franchi de cap ne coûte rien.
          Le plafond global reste au-dessus de tout : {spend.summary} Il reste <b style={{ color: restant > 1 ? 'var(--ink)' : '#ffcf8f' }}>{usd(restant)}</b> sur la fenêtre de 30 jours,
          et le radar s’arrête net s’il est atteint.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => basculer(!state.armed)} disabled={busy || state.followed === 0}
            style={{ padding: '9px 18px', borderRadius: 999, border: 'none', background: state.armed ? 'var(--line-2)' : 'var(--grad-accent)', color: state.armed ? 'var(--ink)' : '#0d070c', fontWeight: 800, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer' }}
          >
            {state.armed ? 'Éteindre le radar' : 'Armer le radar'}
          </button>
          {state.armed && (
            <button
              onClick={passer} disabled={busy}
              style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer' }}
            >
              Passer maintenant
            </button>
          )}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {state.followed} concurrent(s) suivi(s)
          </span>
        </div>

        {state.followed === 0 && (
          <p style={{ margin: 0, fontSize: 12.5, color: '#ffcf8f', lineHeight: 1.6 }}>
            Aucun concurrent suivi · le radar n’aurait rien à surveiller. Ajoute des marques depuis la veille avant de l’armer.
          </p>
        )}

        {msg && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.6 }}>{msg}</p>}
      </div>

      {!findings.length ? (
        <div style={{ ...carte, textAlign: 'center', padding: '28px 20px' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink)', fontWeight: 700 }}>Aucune trouvaille pour l’instant.</p>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
            Le radar ne signale pas les pubs qui sortent · il signale celles qui <b>tiennent</b>. Une créa
            encore diffusée après trois semaines est une créa que son annonceur continue de payer en connaissant
            ses chiffres · c’est le seul vote crédible qu’on puisse observer de l’extérieur.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {findings.map((f) => (
            <div key={f.externalId} style={{ ...carte, gap: 7, padding: '13px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13.5, color: 'var(--ink)' }}>{f.advertiser ?? 'Concurrent'}</strong>
                <span style={{ fontSize: 11.5, padding: '2px 9px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}>
                  {f.signalLabel}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{f.daysRunning} j en ligne</span>
                <span style={{ flex: 1 }} />
                {f.reportedAt && (
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    {new Date(f.reportedAt).toLocaleDateString('fr-FR')}
                  </span>
                )}
              </div>
              {f.summary && (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>{f.summary}</p>
              )}
              {f.reason && (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55 }}>{f.reason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
