'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { listAdsAction, exportAdsCsvAction, type AdRow, type AdFilters } from '../../actions/adsmap';
import { conceptBriefAction } from '../../actions/adsmap-bridge';
import { AdDrawer } from './AdDrawer';
import { Empty } from '../../../components/Empty';
import { Bandeau } from '../../../components/Bandeau';
import { Icon } from '../../../components/Icon';
import { cadreSignal, surface } from '../../../components/ui';
import { useIsMobile } from '../../../components/useIsMobile';
import { CIBLE_TACTILE_MIN, LIBELLE_VERDICT, tauxReussite, verdictEffectif, TAUX_NON_CALCULABLE, type VerdictValue } from '@tiktrends/core';
import { useRouvrirFiche } from './useRouvrirFiche';

/**
 * Vue Table d'ADSMAP.
 *
 * Elle est livrée avant le canvas à dessein : elle valide tout le modèle
 * (filiation, verdicts, protocole) sans dépendre du rendu, et c'est elle qui
 * porte la compatibilité descendante avec le tableur que l'équipe utilise.
 */

// Libellés tirés de la source UNIQUE du noyau (CDC v6 · R01) · un seul
// qualificatif par verdict, la relative en « Prometteuse · relatif ».
const VERDICT_LABEL: Record<string, string> = Object.fromEntries(
  (Object.keys(LIBELLE_VERDICT) as VerdictValue[]).map((k) => [k, LIBELLE_VERDICT[k].court]),
);
const VERDICT_TON: Record<string, { bg: string; fg: string; bd: string }> = {
  winner: { bg: 'rgba(126,232,191,.12)', fg: '#7ee8bf', bd: 'rgba(126,232,191,.4)' },
  baby_winner: { bg: 'rgba(245,166,35,.12)', fg: '#ffcf8f', bd: 'rgba(245,166,35,.4)' },
  // Prometteuse, pas gagnée · ton neutre, jamais l'ambre/vert d'une victoire (R01).
  relative_winner: { bg: 'transparent', fg: 'var(--ink-2)', bd: 'var(--line-2)' },
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

export function AdsMapTable({ batches, peutPartager = false }: { batches: Array<{ id: string; number: number; status: string; ads: number }>; peutPartager?: boolean }) {
  const [rows, setRows] = useState<AdRow[] | null>(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<AdFilters>({});
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [briefBusy, setBriefBusy] = useState('');
  const [ouverte, setOuverte] = useState<string | null>(null);
  // Avant vers l'entrée d'une fiche de cette vue · on la rouvre (recette #106).
  useRouvrirFiche('table', setOuverte);
  // Change à chaque arbitrage · relance le chargement de la liste sans la vider.
  const [version, setVersion] = useState(0);
  // Sur petit écran, la lecture par défaut est une carte par test · un accès
  // explicite bascule vers le tableau complet, scrollable, sans rien perdre.
  const mobile = useIsMobile();
  const [tableauComplet, setTableauComplet] = useState(false);

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
    // Taux de réussite honnête (CDC v6 · R01) · numérateur = gagnantes évaluées
    // au protocole absolu, dénominateur = tests évaluables ; la relative est
    // « prometteuse », jamais un succès. `null` = Non calculable, jamais 0 %.
    // La comparabilité décide · un gagnant non comparable est déclaré, pas validé (N02).
    const tr = tauxReussite(l.map((r) => ({ value: r.verdict as VerdictValue | null, comparable: !!r.comparable })));
    const comparables = l.filter((r) => r.comparable !== null);
    return {
      total: l.length,
      hitRate: tr.taux === null ? null : Math.round(tr.taux * 100),
      succes: tr.succes,
      evaluables: tr.evaluables,
      prometteuses: tr.prometteuses,
      comparablePct: comparables.length ? Math.round((comparables.filter((r) => r.comparable).length / comparables.length) * 100) : null,
      sansHypothese: l.filter((r) => ['ready', 'live'].includes(r.status) && !r.hypothesis).length,
      aCouper: l.filter((r) => r.killFlag).length,
      // Un verdict calculé mais jamais arbitré n'a encore rien appris à personne.
      aArbitrer: l.filter((r) => r.verdict && r.verdictStatus === 'computed').length,
    };
  }, [rows]);

  if (rows === null) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</p>;

  // Trois états vides DISTINCTS (CDC S13) · une erreur de chargement, un filtre
  // qui ne rend rien, et l'absence réelle d'ads ne se disent pas de la même façon.
  // Avant, une erreur affichait aussi « Importer ton tableau » · un conseil faux.
  const filtresActifs = !!(filters.batchId || filters.status || filters.verdict || filters.comparableOnly);
  const reinitialiser = () => setFilters({});

  return (
    <div>
      {/* Repères de tête · ce qu'on veut savoir en ouvrant la page. Sur petit
          écran ils défilent horizontalement plutôt que d'empiler cinq blocs qui
          repoussent la première ligne d'un écran entier. */}
      <div style={mobile
        ? { display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 12, paddingBottom: 2 }
        : { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
        <Stat label="Ads" value={String(stats.total)} />
        <Stat
          label="Hit rate"
          value={stats.hitRate === null ? TAUX_NON_CALCULABLE : `${stats.hitRate} %`}
          sub={stats.evaluables ? `${stats.succes}/${stats.evaluables} évaluées${stats.prometteuses ? ` · ${stats.prometteuses} prometteuses` : ''}` : 'aucun test évaluable'}
          strong />
        <Stat label="Verdicts comparables" value={stats.comparablePct === null ? '—' : `${stats.comparablePct} %`} sub="protocole respecté" />
        <Stat label="À couper" value={String(stats.aCouper)} sub="budget qui brûle" alerte={stats.aCouper > 0} />
        <Stat label="À arbitrer" value={String(stats.aArbitrer)} sub="verdicts sans apprentissage" strong={stats.aArbitrer > 0} />
      </div>

      {stats.aArbitrer > 0 && (
        <div style={{ padding: '10px 14px', background: 'var(--accent-soft)', ...cadreSignal('rgba(254,44,85,.25)'), fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 14, lineHeight: 1.55 }}>
          {stats.aArbitrer} verdict(s) calculé(s) attendent d’être arbitrés. Tant qu’aucun apprentissage n’en est tiré,
          le test a coûté son budget sans rien apprendre à personne · ni à toi, ni à Jarvis. Clique <b>Arbitrer</b> sur la ligne.
        </div>
      )}

      {stats.sansHypothese > 0 && (
        <div style={{ padding: '10px 14px', background: 'rgba(245,166,35,.09)', ...cadreSignal('rgba(245,166,35,.3)'), fontSize: 12.5, color: '#ffcf8f', marginBottom: 14 }}>
          {stats.sansHypothese} ad(s) en test sans hypothèse · importées de l’ancien tableur. Leur résultat ne pourra être attribué à rien tant qu’elle n’est pas écrite.
        </div>
      )}

      {/* Filtres · desktop en ligne, mobile repliés (mêmes contrôles, aucun
          retiré) pour ne pas repousser les résultats d'un écran. */}
      {(() => {
        const controles = (
          <>
            <Select value={filters.batchId ?? ''} onChange={(v) => setFilters((f) => ({ ...f, batchId: v || undefined }))}
              options={[{ v: '', l: 'Tous les lots' }, ...batches.map((b) => ({ v: b.id, l: `Lot ${b.number} · ${b.ads} ad(s)` }))]} />
            <Select value={filters.status ?? ''} onChange={(v) => setFilters((f) => ({ ...f, status: v || undefined }))}
              options={[{ v: '', l: 'Tous les statuts' }, ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ v, l }))]} />
            <Select value={filters.verdict ?? ''} onChange={(v) => setFilters((f) => ({ ...f, verdict: v || undefined }))}
              options={[{ v: '', l: 'Tous les verdicts' }, ...Object.entries(VERDICT_LABEL).map(([v, l]) => ({ v, l }))]} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer', minHeight: CIBLE_TACTILE_MIN }}>
              <input type="checkbox" checked={!!filters.comparableOnly} onChange={(e) => setFilters((f) => ({ ...f, comparableOnly: e.target.checked || undefined }))} style={{ width: 18, height: 18 }} />
              Verdicts comparables seulement
            </label>
            {filtresActifs && (
              <button type="button" onClick={reinitialiser}
                style={{ minHeight: CIBLE_TACTILE_MIN, padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                Réinitialiser
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" onClick={exporter} disabled={busy || !rows.length}
              style={{ minHeight: CIBLE_TACTILE_MIN, padding: '8px 15px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: rows.length ? 'pointer' : 'not-allowed', opacity: rows.length ? 1 : .5 }}>
              {busy ? 'Export…' : 'Exporter en CSV'}
            </button>
          </>
        );
        return mobile ? (
          <details style={{ marginBottom: 12, ...surface, background: 'var(--surface)', padding: '4px 12px' }}>
            <summary style={{ listStyle: 'none', cursor: 'pointer', minHeight: CIBLE_TACTILE_MIN, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>
              Filtres & export{filtresActifs ? ' · actifs' : ''} <span aria-hidden style={{ color: 'var(--muted)', fontSize: 10 }}>▾</span>
            </summary>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0 10px' }}>{controles}</div>
          </details>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>{controles}</div>
        );
      })()}

      {error ? (
        // État 1 · erreur de chargement · annoncée, seule · jamais doublée d'un
        // conseil d'import qui n'a rien à voir.
        <Bandeau ton="error">{error}</Bandeau>
      ) : rows.length === 0 ? (
        filtresActifs ? (
          // État 2 · des ads existent, mais aucune ne passe ces filtres. Le geste
          // « Réinitialiser » est dans la barre de filtres juste au-dessus.
          <Empty
            tone="wait" icon="map" title="Aucune ad pour ces filtres."
            why="Des ads existent dans cette marque, mais aucune ne correspond aux critères actifs · réinitialise les filtres au-dessus pour tout revoir."
          />
        ) : (
          // État 3 · la marque n'a réellement aucune ad.
          <Empty
            tone="todo" icon="map" title="Aucune ad pour l’instant."
            why="La carte se lit persona → désir → angle → concept → ad. Chaque ad porte une hypothèse et une seule variable testée · c’est ce qui permet d’attribuer un résultat à une cause."
            action={{ label: 'Importer ton tableau', href: '/adsmap/import' }}
          />
        )
      ) : (mobile && !tableauComplet) ? (
        // Mobile · une carte par test (nom, statut/verdict EXACT, variable si
        // disponible, une métrique, Ouvrir la fiche). Rien n'est perdu · le
        // tableau complet, scrollable, reste à un clic.
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((r) => (
              <CarteTest key={r.id} r={r} onOpen={() => setOuverte(r.id)} onStudio={() => iterer(r)} briefBusy={briefBusy} />
            ))}
          </div>
          <button type="button" onClick={() => setTableauComplet(true)}
            style={{ minHeight: CIBLE_TACTILE_MIN, marginTop: 12, width: '100%', padding: '9px 14px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
            Voir le tableau complet ({rows.length} test{rows.length > 1 ? 's' : ''}) →
          </button>
        </div>
      ) : (
        <div>
          {mobile && (
            <button type="button" onClick={() => setTableauComplet(false)}
              style={{ minHeight: CIBLE_TACTILE_MIN, marginBottom: 10, padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
              ← Revenir aux cartes
            </button>
          )}
          <div style={{ overflowX: 'auto', ...surface, background: 'var(--surface)' }}>
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
                // Verdict EFFECTIF · un gagnant non comparable se lit « prometteuse
                // relative », même libellé et même ton que partout ailleurs (N02).
                const eff = verdictEffectif(r.verdict as VerdictValue, !!r.comparable);
                const ton = eff ? VERDICT_TON[eff] : null;
                return (
                  <tr key={r.id}>
                    <td style={td}>
                      <span style={{ color: 'var(--ink-2)' }}>{STATUS_LABEL[r.status] ?? r.status}</span>
                      {r.killFlag && <span title="Budget qui brûle" style={{ marginLeft: 6, color: '#ff8095', display: 'inline-flex', verticalAlign: '-2px' }}><Icon name="alert" size={13} /></span>}
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
                      {eff && ton ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: ton.bg, color: ton.fg, border: `1px solid ${ton.bd}` }}>
                          {VERDICT_LABEL[eff]}
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
                            {briefBusy === r.id ? '…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="sparkles" size={12} /> Studio</span>}
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
        </div>
      )}

      {rows.length >= 1000 && (
        <p style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>1 000 ads les plus récentes affichées · affine par lot pour voir le reste.</p>
      )}

      {ouverte && (
        <AdDrawer adId={ouverte} onClose={() => setOuverte(null)} onChanged={() => setVersion((v) => v + 1)} peutPartager={peutPartager} />
      )}
    </div>
  );
}

function Manquant() {
  return <span title="Obligatoire avant de passer l’ad en test" style={{ color: '#ff8095', fontSize: 11.5 }}>à remplir</span>;
}

/**
 * Lecture compacte d'un test sur petit écran · le même contenu que la ligne du
 * tableau, réagencé pour le pouce. Verdict et statut gardent leur LIBELLÉ et leur
 * TON exacts (source unique du noyau) · la variable ne s'affiche que si elle est
 * réellement renseignée, jamais substituée. Aucune donnée ni action n'est perdue :
 * la fiche complète s'ouvre d'un bouton, le tableau entier reste accessible.
 */
export function CarteTest({ r, onOpen, onStudio, briefBusy }: {
  r: AdRow; onOpen: () => void; onStudio: () => void; briefBusy: string;
}) {
  const eff = verdictEffectif(r.verdict as VerdictValue, !!r.comparable);
  const ton = eff ? VERDICT_TON[eff] : null;
  return (
    <div style={{ ...surface, background: 'var(--surface)', padding: '11px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.concept}</span>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: 'var(--accent-strong)', flexShrink: 0 }}>{r.variantCode}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 6 }}>
        <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{STATUS_LABEL[r.status] ?? r.status}</span>
        {r.killFlag && <span title="Budget qui brûle" style={{ color: '#ff8095', display: 'inline-flex' }}><Icon name="alert" size={12} /></span>}
        {eff && ton && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: ton.bg, color: ton.fg, border: `1px solid ${ton.bd}` }}>
            {VERDICT_LABEL[eff]}{r.comparable === false && <span title="Protocole non respecté : comparaison relative seulement">*</span>}
          </span>
        )}
      </div>
      {r.testedVariable && (
        <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--ink-2)' }}>
          <span style={{ color: 'var(--muted)' }}>Variable testée · </span>{VARIABLE_LABEL[r.testedVariable] ?? r.testedVariable}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 11.5 }}>
        {r.cpa !== null && (
          <span style={{ color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--muted)' }}>CPA · </span>{r.cpa.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €
            {r.cpaHi !== null && Number.isFinite(r.cpaHi) && <span style={{ color: 'var(--muted)' }}> · {r.cpaHi.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>}
          </span>
        )}
        {r.launchedAt && (
          <span style={{ color: 'var(--ink-2)' }}><span style={{ color: 'var(--muted)' }}>Lancé · </span>{new Date(r.launchedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
        <button type="button" onClick={onOpen}
          title={r.verdict ? 'Arbitrer ce test · verdict, apprentissage, itération' : 'Ouvrir la fiche du test'}
          style={{ ...carteBtn, borderColor: r.verdict ? 'var(--accent-strong)' : 'var(--line-2)', color: r.verdict ? 'var(--accent-strong)' : 'var(--ink)', fontWeight: r.verdict ? 800 : 700 }}>
          {r.verdict ? 'Arbitrer' : 'Ouvrir la fiche'}
        </button>
        {r.conceptId && (
          <button type="button" onClick={onStudio} disabled={!!briefBusy}
            title="Reprendre cet angle dans le Studio pour en générer une variante"
            style={{ ...carteBtn, color: 'var(--accent-strong)', opacity: briefBusy === r.id ? 0.5 : 1 }}>
            {briefBusy === r.id ? '…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="sparkles" size={12} /> Studio</span>}
          </button>
        )}
      </div>
    </div>
  );
}

const carteBtn: CSSProperties = {
  minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center',
  padding: '4px 13px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper)',
  fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
};

function Stat({ label, value, sub, strong, alerte }: { label: string; value: string; sub?: string; strong?: boolean; alerte?: boolean }) {
  const accent = alerte ? '#ff8095' : strong ? 'var(--accent-strong)' : 'var(--ink)';
  return (
    <div style={{ flex: '0 0 auto', minWidth: 132, border: `1px solid ${alerte ? 'rgba(254,44,85,.3)' : strong ? 'rgba(254,44,85,.22)' : 'var(--line)'}`, borderRadius: surface.borderRadius, background: 'var(--surface)', padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: accent, marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ v: string; l: string }> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ minHeight: CIBLE_TACTILE_MIN, padding: '7px 11px', borderRadius: 9, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 12.5 }}>
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
