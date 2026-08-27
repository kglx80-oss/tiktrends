'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { listAdsAction, exportAdsCsvAction, type AdRow, type AdFilters } from '../../actions/adsmap';
import { conceptBriefAction } from '../../actions/adsmap-bridge';
import { AdDrawer } from './AdDrawer';

/**
 * Vue Table d'ADSMAP.
 *
 * Elle est livrée avant le canvas à dessein : elle valide tout le modèle
 * (filiation, verdicts, protocole) sans dépendre du rendu, et c'est elle qui
 * porte la compatibilité descendante avec le tableur que l'équipe utilise.
 */

const VERDICT_LABEL: Record<string, string> = {
  winner: 'Gagnante', baby_winner: 'Gagnante naissante', relative_winner: 'Gagnante (relatif)',
  loser: 'Perdante', inconclusive: 'Non concluant', insufficient_delivery: 'Sous-diffusée',
};
const VERDICT_TON: Record<string, { bg: string; fg: string; bd: string }> = {
  winner: { bg: 'rgba(126,232,191,.12)', fg: '#7ee8bf', bd: 'rgba(126,232,191,.4)' },
  baby_winner: { bg: 'rgba(245,166,35,.12)', fg: '#ffcf8f', bd: 'rgba(245,166,35,.4)' },
  relative_winner: { bg: 'rgba(245,166,35,.08)', fg: '#e0b980', bd: 'rgba(245,166,35,.28)' },
  loser: { bg: 'rgba(254,44,85,.10)', fg: '#ff8095', bd: 'rgba(254,44,85,.35)' },
  inconclusive: { bg: 'transparent', fg: 'var(--muted)', bd: 'var(--line-2)' },
  insufficient_delivery: { bg: 'transparent', fg: 'var(--muted)', bd: 'var(--line-2)' },
};
const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', proposed: 'Proposée', ready: 'Prête', live: 'En test', paused: 'En pause', done: 'Terminée',
};
const STAGE_LABEL: Record<string, string> = { hook: 'Accroche', hold: 'Rétention', click: 'Clic', convert: 'Conversion' };
const VARIABLE_LABEL: Record<string, string> = {
  hook: 'Hook', opening_visual: 'Visuel d’ouverture', body: 'Corps', length: 'Durée', cta: 'CTA',
  format: 'Format', offer: 'Offre', landing: 'Landing', avatar_on_screen: 'Personne à l’écran',
  proof: 'Preuve', audio: 'Audio', angle: 'Angle', desire: 'Désir', none_control: 'Contrôle',
};

export function AdsMapTable({ batches }: { batches: Array<{ id: string; number: number; status: string; ads: number }> }) {
  const [rows, setRows] = useState<AdRow[] | null>(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<AdFilters>({});
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [briefBusy, setBriefBusy] = useState('');
  const [ouverte, setOuverte] = useState<string | null>(null);
  // Change à chaque arbitrage · relance le chargement de la liste sans la vider.
  const [version, setVersion] = useState(0);

  /**
   * ADSMAP → Studio · l'itération part de l'angle mesuré, pas d'une page blanche.
   *
   * On passe par le serveur plutôt que par le libellé affiché : le brief assemble
   * angle + call-out, et c'est cette formulation-là qui a produit le verdict.
   */
  async function iterer(r: AdRow) {
    if (!r.conceptId || briefBusy) return;
    setBriefBusy(r.id);
    const b = await conceptBriefAction(r.conceptId);
    setBriefBusy('');
    if (b.error) { setError(b.error); return; }
    router.push(`/studio/ads?angle=${encodeURIComponent(b.angle ?? r.concept)}`);
  }

  useEffect(() => {
    let vivant = true;
    (async () => {
      const r = await listAdsAction(filters);
      if (!vivant) return;
      if (r.error) { setError(r.error); setRows([]); return; }
      setError(''); setRows(r.rows ?? []);
    })();
    return () => { vivant = false; };
  }, [filters, version]);

  async function exporter() {
    if (busy) return;
    setBusy(true);
    const r = await exportAdsCsvAction(filters, true);
    setBusy(false);
    if (r.error || !r.csv) { setError(r.error ?? 'Export impossible.'); return; }
    // Téléchargement local : pas d'aller-retour de stockage pour un fichier éphémère.
    const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = r.filename ?? 'adsmap.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const stats = useMemo(() => {
    const l = rows ?? [];
    const conclusifs = l.filter((r) => r.verdict && !['inconclusive', 'insufficient_delivery'].includes(r.verdict));
    const gagnantes = conclusifs.filter((r) => ['winner', 'baby_winner', 'relative_winner'].includes(r.verdict!));
    const comparables = l.filter((r) => r.comparable !== null);
    return {
      total: l.length,
      hitRate: conclusifs.length ? Math.round((gagnantes.length / conclusifs.length) * 100) : null,
      comparablePct: comparables.length ? Math.round((comparables.filter((r) => r.comparable).length / comparables.length) * 100) : null,
      sansHypothese: l.filter((r) => ['ready', 'live'].includes(r.status) && !r.hypothesis).length,
      aCouper: l.filter((r) => r.killFlag).length,
      // Un verdict calculé mais jamais arbitré n'a encore rien appris à personne.
      aArbitrer: l.filter((r) => r.verdict && r.verdictStatus === 'computed').length,
    };
  }, [rows]);

  if (rows === null) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</p>;

  return (
    <div>
      {/* Repères de tête · ce qu'on veut savoir en ouvrant la page */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
        <Stat label="Ads" value={String(stats.total)} />
        <Stat label="Hit rate" value={stats.hitRate === null ? '—' : `${stats.hitRate} %`} sub="gagnantes / concluantes" strong />
        <Stat label="Verdicts comparables" value={stats.comparablePct === null ? '—' : `${stats.comparablePct} %`} sub="protocole respecté" />
        <Stat label="À couper" value={String(stats.aCouper)} sub="budget qui brûle" alerte={stats.aCouper > 0} />
        <Stat label="À arbitrer" value={String(stats.aArbitrer)} sub="verdicts sans apprentissage" strong={stats.aArbitrer > 0} />
      </div>

      {stats.aArbitrer > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 11, background: 'var(--accent-soft)', border: '1px solid rgba(254,44,85,.25)', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 14, lineHeight: 1.55 }}>
          {stats.aArbitrer} verdict(s) calculé(s) attendent d’être arbitrés. Tant qu’aucun apprentissage n’en est tiré,
          le test a coûté son budget sans rien apprendre à personne · ni à toi, ni à Jarvis. Clique <b>Arbitrer</b> sur la ligne.
        </div>
      )}

      {stats.sansHypothese > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 11, background: 'rgba(245,166,35,.09)', border: '1px solid rgba(245,166,35,.3)', fontSize: 12.5, color: '#ffcf8f', marginBottom: 14 }}>
          {stats.sansHypothese} ad(s) en test sans hypothèse · importées de l’ancien tableur. Leur résultat ne pourra être attribué à rien tant qu’elle n’est pas écrite.
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <Select value={filters.batchId ?? ''} onChange={(v) => setFilters((f) => ({ ...f, batchId: v || undefined }))}
          options={[{ v: '', l: 'Tous les lots' }, ...batches.map((b) => ({ v: b.id, l: `Lot ${b.number} · ${b.ads} ad(s)` }))]} />
        <Select value={filters.status ?? ''} onChange={(v) => setFilters((f) => ({ ...f, status: v || undefined }))}
          options={[{ v: '', l: 'Tous les statuts' }, ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ v, l }))]} />
        <Select value={filters.verdict ?? ''} onChange={(v) => setFilters((f) => ({ ...f, verdict: v || undefined }))}
          options={[{ v: '', l: 'Tous les verdicts' }, ...Object.entries(VERDICT_LABEL).map(([v, l]) => ({ v, l }))]} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!filters.comparableOnly} onChange={(e) => setFilters((f) => ({ ...f, comparableOnly: e.target.checked || undefined }))} />
          Verdicts comparables seulement
        </label>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={exporter} disabled={busy || !rows.length}
          style={{ padding: '8px 15px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: rows.length ? 'pointer' : 'not-allowed', opacity: rows.length ? 1 : .5 }}>
          {busy ? 'Export…' : 'Exporter en CSV'}
        </button>
      </div>

      {error && <p style={{ color: '#ff8095', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {rows.length === 0 ? (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 16, padding: '34px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 26 }}>🗺️</div>
          <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink)', fontWeight: 700 }}>Aucune ad pour l’instant.</p>
          <p style={{ margin: '6px auto 0', fontSize: 12.5, color: 'var(--muted)', maxWidth: 460, lineHeight: 1.6 }}>
            Importe ton tableau existant, ou pars d’un persona pour construire la première carte :
            persona → désir → angle → concept → ad. Chaque ad porte une hypothèse et une seule variable testée.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1270, fontSize: 12.5 }}>
            <thead>
              <tr>
                {['Statut', 'Lot', 'Concept', 'Variante', 'Désir', 'Angle', 'Variable', 'Hypothèse', 'Filiation', 'Verdict', 'CPA', 'Étape', 'Date', ''].map((h, i) => (
                  <th key={h || `c${i}`} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ton = r.verdict ? VERDICT_TON[r.verdict] : null;
                return (
                  <tr key={r.id}>
                    <td style={td}>
                      <span style={{ color: 'var(--ink-2)' }}>{STATUS_LABEL[r.status] ?? r.status}</span>
                      {r.killFlag && <span title="Budget qui brûle" style={{ marginLeft: 6, color: '#ff8095' }}>⚠</span>}
                    </td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{r.batchNumber ?? '—'}</td>
                    <td style={{ ...td, color: 'var(--ink)', fontWeight: 600, maxWidth: 220 }}>{r.concept}</td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace', color: 'var(--accent-strong)' }}>{r.variantCode}</td>
                    <td style={{ ...td, maxWidth: 150, color: 'var(--ink-2)' }}>{r.desire ?? '—'}</td>
                    <td style={{ ...td, maxWidth: 150, color: 'var(--ink-2)' }}>{r.angle ?? '—'}</td>
                    <td style={td}>{r.testedVariable ? (VARIABLE_LABEL[r.testedVariable] ?? r.testedVariable) : <Manquant />}</td>
                    <td style={{ ...td, maxWidth: 260 }}>
                      {r.hypothesis
                        ? <span title={r.hypothesis} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink-2)' }}>{r.hypothesis}</span>
                        : <Manquant />}
                    </td>
                    <td style={{ ...td, color: 'var(--muted)', fontSize: 11.5 }}>{r.iterationReason ?? '—'}</td>
                    <td style={td}>
                      {r.verdict && ton ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: ton.bg, color: ton.fg, border: `1px solid ${ton.bd}` }}>
                          {VERDICT_LABEL[r.verdict]}
                          {r.comparable === false && <span title="Protocole non respecté : comparaison relative seulement">*</span>}
                        </span>
                      ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {r.cpa === null ? '—' : (
                        <span title={r.cpaHi ? `Jusqu'à ${r.cpaHi.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} € au haut de l'intervalle` : undefined}>
                          {r.cpa.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €
                          {r.cpaHi !== null && Number.isFinite(r.cpaHi) && (
                            <span style={{ color: 'var(--muted)', fontSize: 11 }}> · {r.cpaHi.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, color: r.failedStage ? '#ffcf8f' : 'var(--muted)' }}>{r.failedStage ? STAGE_LABEL[r.failedStage] : '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {r.launchedAt ? new Date(r.launchedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" onClick={() => setOuverte(r.id)}
                          title={r.verdict ? 'Arbitrer ce test · verdict, apprentissage, itération' : 'Ouvrir la fiche du test'}
                          style={{ ...rowBtn, color: r.verdict ? 'var(--ink)' : 'var(--muted)', borderColor: r.verdict ? 'var(--line-2)' : 'var(--line)' }}>
                          {r.verdict ? 'Arbitrer' : 'Ouvrir'}
                        </button>
                        {r.conceptId && (
                          <button type="button" onClick={() => iterer(r)} disabled={!!briefBusy}
                            title="Reprendre cet angle dans le Studio pour en générer une variante"
                            style={{ ...rowBtn, color: 'var(--accent-strong)', cursor: briefBusy ? 'default' : 'pointer', opacity: briefBusy === r.id ? 0.5 : 1 }}>
                            {briefBusy === r.id ? '…' : '✨ Studio'}
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length >= 1000 && (
        <p style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>1 000 ads les plus récentes affichées · affine par lot pour voir le reste.</p>
      )}

      {ouverte && (
        <AdDrawer adId={ouverte} onClose={() => setOuverte(null)} onChanged={() => setVersion((v) => v + 1)} />
      )}
    </div>
  );
}

function Manquant() {
  return <span title="Obligatoire avant de passer l’ad en test" style={{ color: '#ff8095', fontSize: 11.5 }}>à remplir</span>;
}

function Stat({ label, value, sub, strong, alerte }: { label: string; value: string; sub?: string; strong?: boolean; alerte?: boolean }) {
  const accent = alerte ? '#ff8095' : strong ? 'var(--accent-strong)' : 'var(--ink)';
  return (
    <div style={{ border: `1px solid ${alerte ? 'rgba(254,44,85,.3)' : strong ? 'rgba(254,44,85,.22)' : 'var(--line)'}`, borderRadius: 13, background: 'var(--surface)', padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: accent, marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ v: string; l: string }> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ padding: '7px 11px', borderRadius: 9, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 12.5 }}>
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

const th: CSSProperties = {
  textAlign: 'left', padding: '9px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em',
  textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap',
};
const td: CSSProperties = { padding: '9px 12px', borderTop: '1px solid var(--line)', verticalAlign: 'top' };

const rowBtn: CSSProperties = {
  padding: '4px 9px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper)',
  fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
};
