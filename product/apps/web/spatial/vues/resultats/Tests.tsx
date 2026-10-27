'use client';

import { useRouter } from 'next/navigation';
import {
  LIBELLE_STATUT_AD, LIBELLE_VERDICT, VALEUR_ABSENTE, adresseTests, filtresTestsActifs, lienFicheTest, lienNouveauProjet,
  libelleStatutTest, libelleVariableTest, pastilleVerdict, LIBELLE_ETAPE_TEST,
  type FiltresTests, type ReperesTests,
} from '@tiktrends/core';
import { exportAdsCsvAction, type AdRow } from '../../../app/actions/adsmap';
import { conceptBriefAction } from '../../../app/actions/adsmap-bridge';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { useGeste, Retour } from './geste';
import type { SousNavResultats } from './communs';

/**
 * « Tous les tests » · la table de l'ancienne Adsmap, dans le langage de la
 * maquette (`.kpis`, `.mtable`, `.chip`). Une ligne = une ad de la marque, lue
 * par `listAdsAction` (mêmes portées, mêmes filtres) · l'export passe par
 * `exportAdsCsvAction`, la reprise d'un angle par `conceptBriefAction` puis un
 * projet Studios prérempli. Les filtres vivent dans l'adresse (le Retour les
 * retrouve) · la page serveur relit les lignes.
 */

export interface PropsTests {
  sousNav: SousNavResultats;
  sous: string;
  lots: ReadonlyArray<{ id: string; number: number; ads: number }>;
  filtres: FiltresTests;
  /** `null` = lecture impossible (l'erreur est dans `erreur`). */
  lignes: AdRow[] | null;
  erreur: string | null;
  reperes: ReperesTests;
  /** Admin · l'import du tableau est proposé quand la marque n'a aucun test. */
  admin: boolean;
}

const COLONNES = 'minmax(0,1.5fr) minmax(0,1fr) minmax(0,1.4fr) minmax(0,.9fr) auto';
const eur = (v: number | null) => (v === null ? VALEUR_ABSENTE : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €`);

export function Tests(p: PropsTests) {
  const router = useRouter();
  const { occupe, message, setMessage, geste } = useGeste();
  const f = p.filtres;
  const aller = (n: FiltresTests) => router.push(adresseTests(n));
  const lignes = p.lignes ?? [];
  const r = p.reperes;

  async function exporter() {
    await geste('export', () => exportAdsCsvAction(f, true), (x) => {
      if (!x.csv) return null;
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(new Blob([x.csv], { type: 'text/csv;charset=utf-8' }));
      lien.download = x.filename ?? 'adsmap.csv';
      lien.click();
      URL.revokeObjectURL(lien.href);
      return `Export prêt · ${lignes.length} test${lignes.length > 1 ? 's' : ''}`;
    }, { rafraichir: false });
  }

  async function studio(l: AdRow) {
    if (!l.conceptId) return;
    const b = await geste(`studio-${l.id}`, () => conceptBriefAction(l.conceptId!), () => null, { rafraichir: false });
    if (b) window.location.assign(lienNouveauProjet({ type: 'ads', angle: b.angle ?? l.concept }));
  }

  return (
    <Vue>
      <EnTete titre="Tous les tests" sous={p.sous} />
      <SousNav items={p.sousNav} actif="/adsmap" />
      <div className="kpis rvk">
        <div className="tile kpi"><div className="lbl">Tests</div><div className="v">{r.total}</div><small>{filtresTestsActifs(f) ? 'avec ces filtres' : 'de la marque'}</small></div>
        <div className="tile kpi"><div className="lbl">Taux de réussite</div><div className="v">{r.taux}</div><small>{r.detailTaux}</small></div>
        <div className="tile kpi"><div className="lbl">Verdicts comparables</div><div className="v">{r.comparables}</div><small>protocole respecté</small></div>
        <div className="tile kpi"><div className="lbl">À arbitrer</div><div className="v">{r.aArbitrer} {r.aCouper > 0 && <span className="d">{r.aCouper} à couper</span>}</div><small>verdicts calculés sans apprentissage</small></div>
      </div>
      {r.aArbitrer > 0 && (
        <p className="tile" style={{ marginBottom: 12, fontSize: '13px' }}>
          {r.aArbitrer} verdict{r.aArbitrer > 1 ? 's' : ''} calculé{r.aArbitrer > 1 ? 's' : ''} attend{r.aArbitrer > 1 ? 'ent' : ''} d’être arbitré{r.aArbitrer > 1 ? 's' : ''}. Tant qu’aucun apprentissage n’en est tiré, le test a coûté son budget sans rien apprendre à personne · ouvre la fiche et arbitre.
        </p>
      )}
      {r.sansHypothese > 0 && (
        <p className="tile" style={{ marginBottom: 12, fontSize: '13px', borderColor: '#ffd48a40' }}>
          {r.sansHypothese} ad{r.sansHypothese > 1 ? 's' : ''} en test sans hypothèse · leur résultat ne pourra être attribué à rien tant qu’elle n’est pas écrite.
        </p>
      )}
      <div className="fields" style={{ marginBottom: 12 }}>
        <label className="field">Lot
          <select value={f.batchId ?? ''} onChange={(e) => aller({ ...f, batchId: e.target.value || undefined })}>
            <option value="">Tous les lots</option>
            {p.lots.map((l) => <option key={l.id} value={l.id}>Lot {l.number} · {l.ads} ad{l.ads > 1 ? 's' : ''}</option>)}
          </select>
        </label>
        <label className="field">Statut
          <select value={f.status ?? ''} onChange={(e) => aller({ ...f, status: e.target.value || undefined })}>
            <option value="">Tous les statuts</option>
            {Object.entries(LIBELLE_STATUT_AD).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">Verdict
          <select value={f.verdict ?? ''} onChange={(e) => aller({ ...f, verdict: e.target.value || undefined })}>
            <option value="">Tous les verdicts</option>
            {Object.entries(LIBELLE_VERDICT).map(([v, l]) => <option key={v} value={v}>{l.court}</option>)}
          </select>
        </label>
      </div>
      <div className="toolbar">
        <button type="button" className="chip" aria-pressed={!!f.comparableOnly} onClick={() => aller({ ...f, comparableOnly: !f.comparableOnly || undefined })}>Verdicts comparables seulement</button>
        {filtresTestsActifs(f) && <button type="button" className="btn sm" onClick={() => { setMessage(null); aller({}); }}>Réinitialiser</button>}
        <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} disabled={!!occupe || lignes.length === 0} onClick={() => { void exporter(); }}>
          <Ic n="down" />{occupe === 'export' ? 'Export…' : 'Exporter en CSV'}
        </button>
      </div>
      <Retour message={message} />
      {p.erreur ? (
        <section className="tile"><p role="alert" className="muted">{p.erreur}</p></section>
      ) : lignes.length === 0 ? (
        <section className="tile">
          {filtresTestsActifs(f) ? (
            <>
              <p className="muted">Aucun test ne correspond à ces filtres · des tests existent dans cette marque.</p>
              <button type="button" className="btn sm" style={{ marginTop: 12, justifySelf: 'start' }} onClick={() => aller({})}>Tout revoir</button>
            </>
          ) : (
            <>
              <p className="muted">Aucun test pour l’instant. Chaque test porte une hypothèse et une seule variable · c’est ce qui permet d’attribuer un résultat à une cause.</p>
              {p.admin && <Lien className="btn sm pri" href="/adsmap/import" style={{ marginTop: 12, justifySelf: 'start' }}>Importer ton tableau</Lien>}
            </>
          )}
        </section>
      ) : (
        <div className="mtable">
          <div className="mrow h" style={{ gridTemplateColumns: COLONNES }}><span>Test</span><span>Désir · angle</span><span>Variable · hypothèse</span><span>CPA · étape</span><span /></div>
          {lignes.map((l) => {
            const v = pastilleVerdict(l.verdict, l.comparable);
            const variable = libelleVariableTest(l.testedVariable);
            return (
              <div className="mrow" key={l.id} style={{ gridTemplateColumns: COLONNES }}>
                <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.concept}</strong>
                  <span className="faint" style={{ fontSize: '11.5px' }}>{l.variantCode} · {l.batchNumber !== null ? `lot ${l.batchNumber}` : 'hors lot'} · {libelleStatutTest(l.status)}{l.iterationReason ? ` · ${l.iterationReason}` : ''}</span>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {v ? <span className={`pill ${v.classe}`} title={v.relatif ? 'Protocole non respecté : comparaison relative seulement' : undefined}>{v.libelle}{v.relatif ? ' *' : ''}</span> : <span className="pill">Pas de verdict</span>}
                    {l.killFlag && <span className="pill r" title="Budget qui brûle"><Ic n="warn" />À couper</span>}
                  </span>
                </span>
                <span className="muted" style={{ fontSize: '12.5px' }}>{l.desire ?? VALEUR_ABSENTE}<br />{l.angle ?? VALEUR_ABSENTE}</span>
                <span style={{ fontSize: '12.5px', minWidth: 0 }}>
                  {variable ? <b>{variable}</b> : <span style={{ color: 'var(--bad)' }}>Variable à remplir</span>}
                  <br />
                  {l.hypothesis
                    ? <span className="muted" title={l.hypothesis} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.hypothesis}</span>
                    : <span style={{ color: 'var(--bad)' }}>Hypothèse à écrire</span>}
                </span>
                <span className="num" style={{ fontSize: '12.5px' }}>
                  {eur(l.cpa)}{l.cpaHi !== null && Number.isFinite(l.cpaHi) && <span className="faint"> · jusqu’à {eur(l.cpaHi)}</span>}
                  <br /><span className="faint">{l.failedStage ? `bloque sur ${LIBELLE_ETAPE_TEST[l.failedStage] ?? l.failedStage}` : l.launchedAt ? `lancée le ${new Date(l.launchedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', timeZone: 'UTC' })}` : 'pas lancée'}</span>
                </span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Lien className={`btn sm ${l.verdict && l.verdictStatus === 'computed' ? 'pri' : ''}`} href={lienFicheTest(l.id)}>{l.verdict ? 'Arbitrer' : 'Ouvrir'}</Lien>
                  {l.conceptId && (
                    <button type="button" className="btn sm" disabled={!!occupe} title="Reprendre cet angle dans un projet Studios" onClick={() => { void studio(l); }}>
                      <Ic n="spark" />{occupe === `studio-${l.id}` ? '…' : 'Studio'}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {lignes.length >= 1000 && <p className="faint" style={{ fontSize: '12.5px', marginTop: 10 }}>Les 1 000 tests les plus récents sont affichés · filtre par lot pour voir le reste.</p>}
    </Vue>
  );
}
