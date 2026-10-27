'use client';

import { useRef, useState } from 'react';
import { LIBELLE_VERDICT, appliquerSuggestionSeuils, verrouAction } from '@tiktrends/core';
import { saveSettingsAction, suggestSettingsAction, type SettingsBundle } from '../../../app/actions/adsmap-protocol';
import { Ic } from '../../communs';
import { useGeste, Retour } from './geste';

/**
 * Les réglages DÉTAILLÉS du protocole et des seuils (le formulaire complet de
 * l'ancienne page Protocole), sous les trois tuiles de la maquette · structure,
 * budget, durée, tolérance, noms attendus côté régie, CPA cible et seuils du
 * moteur. « Proposer des seuils » lit les 30 derniers jours déjà synchronisés
 * (`suggestSettingsAction`, aucun appel modèle) et ne touche qu'à ce qu'il
 * MESURE (`appliquerSuggestionSeuils`) · rien n'est écrit avant « Enregistrer »
 * (`saveSettingsAction`, admin). Un seul geste à la fois (`verrouAction`).
 */
export function ReglagesProtocole({ initial, peutModifier }: { initial: SettingsBundle; peutModifier: boolean }) {
  const [s, setS] = useState<SettingsBundle>(initial);
  const [notes, setNotes] = useState<string[]>([]);
  const [reel, setReel] = useState<boolean | null>(null);
  const { occupe, message, geste } = useGeste();
  const verrou = useRef(verrouAction());
  const setP = <K extends keyof SettingsBundle['protocol']>(k: K, v: SettingsBundle['protocol'][K]) => setS((x) => ({ ...x, protocol: { ...x.protocol, [k]: v } }));
  const setV = <K extends keyof SettingsBundle['verdict']>(k: K, v: SettingsBundle['verdict'][K]) => setS((x) => ({ ...x, verdict: { ...x.verdict, [k]: v } }));
  const une = async (f: () => Promise<unknown>) => { if (!verrou.current.tenter()) return; try { await f(); } finally { verrou.current.relacher(); } };
  const nombre = (v: string) => Number(v);
  const off = !peutModifier;

  return (
    <details className="tile sec">
      <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', gap: 10, alignItems: 'center' }}><Ic n="gear" /><strong>Réglages détaillés · protocole de test et seuils du verdict</strong></summary>
      <p className="muted" style={{ fontSize: '12.5px', marginTop: 10 }}>Ces réglages décident de ce qui compte comme une victoire. Ils s’appliquent aux verdicts calculés ensuite · les verdicts déjà validés ne bougent pas.{initial.isDefault ? ' Rien n’est encore enregistré pour cette marque · ce sont des valeurs par défaut.' : ''}</p>
      {peutModifier && (
        <div className="foot2" style={{ marginTop: 10 }}>
          <button type="button" className="btn sm" disabled={!!occupe} onClick={() => { void une(() => geste('proposer', () => suggestSettingsAction(), (r) => {
            if (!r.suggestion) return null;
            setS((x) => ({ ...x, ...appliquerSuggestionSeuils({ protocol: x.protocol, verdict: x.verdict }, r.suggestion!) }));
            setNotes(r.suggestion.notes); setReel(r.suggestion.fromRealData);
            return r.suggestion.fromRealData ? 'Seuils proposés depuis tes 30 derniers jours · relis-les, puis enregistre' : null;
          }, { rafraichir: false })); }}><Ic n="chart" />{occupe === 'proposer' ? 'Analyse…' : 'Proposer des seuils depuis mes 30 derniers jours'}</button>
          {reel === false && <small>Sans données Meta · rien n’a été modifié.</small>}
        </div>
      )}
      {notes.length > 0 && <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4, fontSize: '12.5px' }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}

      <div className="lbl" style={{ marginTop: 14 }}>Protocole de test</div>
      <p className="faint" style={{ fontSize: '12px' }}>C’est lui qui rend les verdicts comparables. En CBO, Meta concentre le budget sur une ou deux annonces · celle qui est favorisée gagne par construction.</p>
      <div className="fields" style={{ marginTop: 8 }}>
        <label className="field">Structure de campagne
          <select value={s.protocol.structure} disabled={off} onChange={(e) => setP('structure', e.target.value as SettingsBundle['protocol']['structure'])}>
            <option value="abo_one_adset_per_ad">ABO · un ad set par ad (recommandé)</option>
            <option value="abo_single_adset">ABO · un seul ad set</option>
            <option value="cbo_tolerated">CBO toléré · verdicts dégradés</option>
          </select>
        </label>
        <label className="field">Budget quotidien par ad (€)<input type="number" min={1} step={1} value={s.protocol.dailyBudgetPerAd} disabled={off} onChange={(e) => setP('dailyBudgetPerAd', nombre(e.target.value))} /></label>
        <label className="field">Durée du test (jours)<input type="number" min={1} max={30} value={s.protocol.durationDays} disabled={off} onChange={(e) => setP('durationDays', nombre(e.target.value))} /></label>
        <label className="field">Écart de budget toléré (%)<input type="number" min={0} max={100} step={5} value={Math.round(s.protocol.budgetVarianceTolerance * 100)} disabled={off} onChange={(e) => setP('budgetVarianceTolerance', nombre(e.target.value) / 100)} /></label>
        <label className="field">Nom de campagne attendu<input value={s.protocol.campaignNamePattern} disabled={off} onChange={(e) => setP('campaignNamePattern', e.target.value)} /></label>
        <label className="field">Nom d’annonce attendu<input value={s.namingPattern} disabled={off} onChange={(e) => setS((x) => ({ ...x, namingPattern: e.target.value }))} /></label>
      </div>
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 6 }}>Le nom d’annonce relie une ad du compte publicitaire à sa ligne ici · sans lui, le rattachement se fait à la main.</p>

      <div className="lbl" style={{ marginTop: 14 }}>Seuils du verdict</div>
      <div className="fields" style={{ marginTop: 8 }}>
        <label className="field">CPA cible (€)<input type="number" min={1} step={1} value={s.verdict.targetCpa} disabled={off} onChange={(e) => setV('targetCpa', nombre(e.target.value))} /></label>
        <label className="field">Tolérance « {LIBELLE_VERDICT.baby_winner.court.toLowerCase()} » (%)<input type="number" min={0} max={100} step={5} value={Math.round(s.verdict.babyTolerance * 100)} disabled={off} onChange={(e) => setV('babyTolerance', nombre(e.target.value) / 100)} /></label>
        <label className="field">Limite « perdante » (× cible)<input type="number" min={1} step={0.1} value={s.verdict.loserMultiple} disabled={off} onChange={(e) => setV('loserMultiple', nombre(e.target.value))} /></label>
        <label className="field">Dépense minimale (× CPA cible)<input type="number" min={1} step={0.5} value={s.verdict.minSpendMultiple} disabled={off} onChange={(e) => setV('minSpendMultiple', nombre(e.target.value))} /></label>
        <label className="field">Achats minimum pour « gagnante »<input type="number" min={1} step={1} value={s.verdict.minPurchasesWinner} disabled={off} onChange={(e) => setV('minPurchasesWinner', nombre(e.target.value))} /></label>
        <label className="field">Niveau de confiance (%)<input type="number" min={50} max={99} step={1} value={Math.round(s.verdict.ciLevelOneSided * 100)} disabled={off} onChange={(e) => setV('ciLevelOneSided', nombre(e.target.value) / 100)} /></label>
      </div>
      <div className="foot2" style={{ marginTop: 12 }}>
        <button type="button" className="btn pri sm" disabled={off || !!occupe} onClick={() => { void une(() => geste('enregistrer', () => saveSettingsAction(s), () => 'Réglages enregistrés · ils s’appliquent aux prochains verdicts calculés')); }}>{occupe === 'enregistrer' ? 'Enregistrement…' : 'Enregistrer les réglages'}</button>
        <small>{peutModifier ? 'Monter le niveau de confiance rend le moteur plus prudent, donc plus lent à conclure · ajuste plutôt la tolérance.' : 'Réservé aux administrateurs de l’espace.'}</small>
      </div>
      <Retour message={message} />
    </details>
  );
}
