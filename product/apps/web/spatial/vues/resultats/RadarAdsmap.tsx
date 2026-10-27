'use client';

import { useEffect, useState } from 'react';
import { COUT_BROUILLON_JARVIS, HYPOTHESE_MIN, libelleMecanique, lienFicheTest } from '@tiktrends/core';
import {
  conceptFromFindingAction, radarCostPreviewAction, runRadarNowAction, setRadarAction,
  type RadarFindingRow, type RadarView,
} from '../../../app/actions/adsmap-radar';
import { draftConceptAction, type DraftView } from '../../../app/actions/adsmap-draft';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { useGeste, Retour } from './geste';
import { Brouillon } from './Brouillon';
import type { SousNavResultats } from './communs';

/**
 * « Radar des concurrents » · le radar de veille de l'ancienne Adsmap
 * (`/adsmap/radar`). Il signale les SURVIES (une créa concurrente encore payée
 * après des semaines), pas les naissances. Le COÛT vient avant l'interrupteur ·
 * le pire cas (nuits pleines au plafond choisi, `radarCostPreviewAction`), et le
 * plafond global de dépense reste au-dessus de tout. Armer, éteindre, passer
 * maintenant · `setRadarAction`, `runRadarNowAction` (admin). Une trouvaille se
 * fait écrire par Jarvis (`draftConceptAction`, coût annoncé) puis se pose sur
 * la carte (`conceptFromFindingAction`) · on reprend la mécanique, jamais les mots.
 */

export interface PropsRadarAdsmap {
  sousNav: SousNavResultats;
  sous: string;
  vue: RadarView | null;
  erreur: string | null;
}

const usd = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;

export function RadarAdsmap(p: PropsRadarAdsmap) {
  const { occupe, message, geste } = useGeste();
  const v = p.vue;
  const [cap, setCap] = useState(v?.state.cap ?? 3);
  const [apercu, setApercu] = useState<{ nightly: number; monthly: number } | null>(v ? { nightly: v.state.nightlyCostUsd, monthly: v.state.monthlyCostUsd } : null);
  useEffect(() => { let vivant = true; void radarCostPreviewAction(cap).then((a) => { if (vivant) setApercu(a); }); return () => { vivant = false; }; }, [cap]);

  return (
    <Vue>
      <EnTete titre="Radar des concurrents" sous={p.sous} />
      <SousNav items={p.sousNav} actif="/adsmap" />
      {p.erreur || !v ? (
        <section className="tile"><p role="alert" className="muted">{p.erreur ?? 'Lecture impossible.'}</p></section>
      ) : (
        <>
          <section className="tile sec" style={{ borderColor: v.state.armed ? '#7ef0b040' : undefined }}>
            <div className="sech">
              <span className={`pill ${v.state.armed ? 'g' : ''}`}>{v.state.armed ? 'Armé' : 'Éteint'}</span>
              {v.state.lastRunAt && <span className="faint" style={{ fontSize: '12px', marginLeft: 'auto' }}>Dernier passage · {new Date(v.state.lastRunAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>}
            </div>
            <p className="muted" style={{ fontSize: '13px' }}>Chaque nuit, le radar regarde ce que tes concurrents continuent de payer. <b>Détecter est gratuit, décrire coûte</b> · seule la description d’une créa qui a franchi un cap demande un appel modèle, jamais deux fois sur la même.</p>
            <div className="fields">
              <label className="field">Créas décrites par nuit
                <input type="number" min={1} max={20} value={cap} onChange={(e) => setCap(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
              </label>
            </div>
            {apercu && <p style={{ fontSize: '13px' }}>Soit <b>{usd(apercu.nightly)}</b> par nuit au plus · <b>{usd(apercu.monthly)}</b> sur 30 nuits pleines.</p>}
            <p className="faint" style={{ fontSize: '12px' }}>Chiffre du pire cas · une nuit sans créa ayant franchi de cap ne coûte rien. Le plafond global reste au-dessus de tout : {v.spend.summary} Il reste {usd(Math.max(0, v.spend.capUsd - v.spend.spentUsd))} sur la fenêtre de 30 jours, et le radar s’arrête net s’il est atteint.</p>
            <div className="foot2" style={{ marginTop: 8 }}>
              <button type="button" className={`btn sm ${v.state.armed || v.state.followed === 0 ? '' : 'pri'}`} disabled={!!occupe || (!v.state.armed && v.state.followed === 0)} onClick={() => {
                const armer = !v.state.armed;
                void geste('basculer', () => setRadarAction({ armed: armer, cap }), () => (armer ? `Radar armé · au plus ${usd(apercu?.nightly ?? 0)} par nuit` : 'Radar éteint · plus aucune dépense en arrière-plan'));
              }}>{v.state.armed ? 'Éteindre le radar' : `Armer le radar · au plus ${usd(apercu?.nightly ?? 0)} par nuit`}</button>
              {v.state.armed && (
                <button type="button" className="btn sm" disabled={!!occupe} onClick={() => {
                  void geste('passer', () => runRadarNowAction(), (r) => `${r.digest ?? 'Passage terminé.'}${r.analyzed ? ` · ${usd(r.spentUsd ?? 0)} dépensés` : ''}`);
                }}><Ic n="loop" />{occupe === 'passer' ? 'Passage…' : `Passer maintenant · au plus ${usd(apercu?.nightly ?? 0)}`}</button>
              )}
              <small>{v.state.followed} concurrent{v.state.followed > 1 ? 's' : ''} suivi{v.state.followed > 1 ? 's' : ''}{v.state.followed === 0 ? ' · ajoute des marques depuis la Veille avant d’armer le radar' : ''}</small>
            </div>
            {v.state.followed === 0 && <Lien className="btn sm" href="/veille" style={{ justifySelf: 'start' }}><Ic n="eye" />Ouvrir la Veille</Lien>}
            <Retour message={message} />
            <details>
              <summary className="faint" style={{ cursor: 'pointer', fontSize: '12.5px' }}>Ce que le radar surveille, et ce qu’il coûte</summary>
              <p className="muted" style={{ fontSize: '12.5px', marginTop: 6 }}><b>La naissance d’une pub ne dit rien.</b> La plupart meurent en une semaine. Le signal qui compte est la <b>survie</b> : une créa encore diffusée après trois semaines est une créa que son annonceur continue de payer, en connaissant ses chiffres.</p>
              <p className="muted" style={{ fontSize: '12.5px', marginTop: 6 }}>Chaque nuit, un même annonceur donne au plus <b>trois</b> créas décrites · le surplus attend la nuit suivante, il n’est pas jeté. Et un concurrent déjà connu passe <b>après</b> un inconnu à signal égal : la largeur d’abord, sans exclure personne · une créa vraiment prouvée d’une marque déjà couverte reste candidate les nuits d’après.</p>
              <p className="muted" style={{ fontSize: '12.5px', marginTop: 6 }}><b>Le radar est éteint par défaut</b>, s’arme marque par marque, et s’arrête net si le plafond global de dépense est atteint.</p>
            </details>
          </section>
          <div className="sech sec"><h2>Trouvailles</h2></div>
          {v.findings.length === 0 ? (
            <section className="tile"><p className="muted">Aucune trouvaille pour l’instant. Le radar ne signale pas les pubs qui sortent · il signale celles qui <b>tiennent</b>, le seul vote crédible qu’on puisse observer de l’extérieur.</p></section>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>{v.findings.map((f) => <Trouvaille key={f.externalId} f={f} />)}</div>
          )}
        </>
      )}
    </Vue>
  );
}

function Trouvaille({ f }: { f: RadarFindingRow }) {
  const { occupe, message, geste } = useGeste();
  const [brouillon, setBrouillon] = useState<DraftView | null>(null);
  const [hypo, setHypo] = useState('');
  const [posee, setPosee] = useState<string | null>(null);
  const mecanique = f.openingType || f.hookType || null;
  const ecrire = () => geste('ecrire', () => draftConceptAction({
    origin: 'radar',
    intent: f.summary
      ? `Une créa de ${f.advertiser ?? 'un concurrent'} tient depuis ${f.daysRunning} jours : ${f.summary}. Écris une créa pour notre marque qui reprenne ce qui la fait tenir.`
      : `Une créa de ${f.advertiser ?? 'un concurrent'} tient depuis ${f.daysRunning} jours. Écris une créa pour notre marque qui en reprenne le ressort.`,
    marketMechanic: mecanique,
  }), (r) => { setBrouillon(r.view ?? null); if (r.view) setHypo(r.view.draft.hypothesis); return null; }, { rafraichir: false });
  return (
    <section className="tile">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{f.advertiser ?? 'Concurrent'}</strong>
        <span className="pill c">{f.signalLabel}</span>
        <span className="faint" style={{ fontSize: '12px' }}>{f.daysRunning} j en ligne</span>
        {f.reportedAt && <span className="faint" style={{ fontSize: '12px', marginLeft: 'auto' }}>{new Date(f.reportedAt).toLocaleDateString('fr-FR')}</span>}
      </div>
      {f.summary && <p style={{ fontSize: '13px' }}>{f.summary}</p>}
      {f.reason && <p className="faint" style={{ fontSize: '12px' }}>{f.reason}</p>}
      {brouillon ? (
        <Brouillon vue={brouillon}>
          <form className="blform" onSubmit={(e) => {
            e.preventDefault();
            void geste('poser', () => conceptFromFindingAction({ externalId: f.externalId, hypothesis: hypo, headline: brouillon.draft.headline, beats: brouillon.draft.beats }), (r) => {
              setPosee(r.adId ?? null); setBrouillon(null);
              return 'Concept posé sur la carte · il arrive « proposé », et l’ad attend son brief';
            });
          }}>
            <textarea value={hypo} onChange={(e) => setHypo(e.target.value)} maxLength={600} aria-label="Ce que ce test parie · relis-la, c’est elle qui rendra le résultat lisible" />
            <div className="kc">
              <button type="button" className="btn sm" disabled={!!occupe} onClick={() => { void ecrire(); }}>{occupe === 'ecrire' ? 'Jarvis écrit…' : `Réécrire · ${COUT_BROUILLON_JARVIS}`}</button>
              <button type="submit" className="btn sm pri" disabled={!!occupe || hypo.trim().length < HYPOTHESE_MIN} style={{ marginLeft: 'auto' }}>{occupe === 'poser' ? 'Classement…' : 'Poser sur la carte'}</button>
            </div>
          </form>
        </Brouillon>
      ) : (
        <div className="foot2">
          <button type="button" className="btn sm" disabled={!!occupe} onClick={() => { void ecrire(); }}><Ic n="spark" />{occupe === 'ecrire' ? 'Jarvis écrit…' : `Demander le concept à Jarvis · ${COUT_BROUILLON_JARVIS}`}</button>
          {mecanique && <small>Il reprendra la mécanique · {libelleMecanique(mecanique)}, jamais les mots.</small>}
        </div>
      )}
      {posee && <Lien className="btn sm" href={lienFicheTest(posee)} style={{ justifySelf: 'start' }}>Ouvrir sa fiche</Lien>}
      <Retour message={message} />
    </section>
  );
}
