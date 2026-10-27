'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { lireVolume, optionsPeriode } from '@tiktrends/core';
import { saveSettingsAction, type SettingsBundle } from '../../../app/actions/adsmap-protocol';
import { EnTete, Ic, SousNav, Vue } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import type { SousNavResultats } from './communs';

/**
 * « Protocole » · `docs/spatial/reference/protocole.html`, balisage à l'identique.
 * Les réglages RÉELS de la marque (`getSettingsAction`) · la période de
 * comparaison est la fenêtre d'évaluation du moteur, le volume minimum son
 * `minImpressions`. L'enregistrement passe par `saveSettingsAction` (admin,
 * garde-fous serveur). L'indicateur n'est PAS un choix · le moteur tranche sur
 * le coût par achat, les autres sont des signaux avancés · le sélecteur le
 * montre, désactivé, plutôt que de faire croire qu'il change le verdict.
 */

export interface PropsProtocole {
  sousNav: SousNavResultats;
  initial: SettingsBundle;
  garanties: ReadonlyArray<{ ok: boolean; texte: string }>;
  peutModifier: boolean;
}

export function Protocole(p: PropsProtocole) {
  const v = p.initial.verdict;
  const [periode, setPeriode] = useState(v.evaluationWindowDays);
  const [volume, setVolume] = useState(`${v.minImpressions.toLocaleString('fr-FR')} impressions / variante`);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useSpatial();
  const cible = v.targetCpa.toLocaleString('fr-FR');

  async function enregistrer() {
    if (occupe || !p.peutModifier) return;
    const n = lireVolume(volume);
    if (n === null) { setMessage('Indique un volume minimum en nombre d’impressions (par exemple 15 000).'); return; }
    setOccupe(true); setMessage(null);
    const r = await saveSettingsAction({ ...p.initial, verdict: { ...v, evaluationWindowDays: periode, minImpressions: n } });
    setOccupe(false);
    if (r.error) { setMessage(r.error); return; }
    toast('Protocole enregistré · il s’applique aux prochains verdicts calculés');
    router.refresh();
  }

  return (
    <Vue>
      <EnTete titre="Protocole" sous="Définis la comparaison avant de lire les résultats" />
      <SousNav items={p.sousNav} actif="/adsmap/protocole" />
      <div className="grid3">
        <label className="tile ptile">
          <span className="lbl"><Ic n="chart" />Indicateur principal</span>
          <select disabled value="cpa" aria-describedby="pt-kpi">
            <option value="cpa">Coût par achat · décide du verdict</option>
            <option value="hook_rate">Taux d’accroche (3 s) · signal avancé</option>
            <option value="ctr">Taux de clic · signal avancé</option>
            <option value="roas">ROAS · lu, ne décide pas</option>
          </select>
          <span className="faint" id="pt-kpi" style={{ fontSize: '11.5px' }}>Le moteur tranche sur le coût par achat · cible de {cible} €.</span>
        </label>
        <label className="tile ptile">
          <span className="lbl"><Ic n="cal" />Période de comparaison</span>
          <select value={periode} disabled={!p.peutModifier} onChange={(e) => setPeriode(Number(e.target.value))}>
            {optionsPeriode(v.evaluationWindowDays).map((j) => <option key={j} value={j}>{j} jours{j === v.evaluationWindowDays ? ' · enregistré' : ''}</option>)}
          </select>
          <span className="faint" style={{ fontSize: '11.5px' }}>Pas de verdict à arbitrer avant la fin de la période.</span>
        </label>
        <label className="tile ptile">
          <span className="lbl"><Ic n="users" />Volume minimum avant décision</span>
          <input value={volume} disabled={!p.peutModifier} onChange={(e) => setVolume(e.target.value)} aria-label="Volume minimum" inputMode="numeric" />
          <span className="faint" style={{ fontSize: '11.5px' }}>En dessous, et sous {v.minSpendMultiple}× la cible dépensée : « non concluant ».</span>
        </label>
      </div>
      <section className="tile sec">
        <div className="lbl">Biais et conditions d’arrêt</div>
        <ul className="check2">
          {p.garanties.map((g) => (
            <li key={g.texte}><span className={`cb ${g.ok ? 'ok' : ''}`}>{g.ok && <Ic n="check" />}</span><span>{g.texte}</span><span /></li>
          ))}
        </ul>
        <div className="foot2" style={{ marginTop: 12 }}>
          <button className="btn pri sm" type="button" disabled={occupe || !p.peutModifier} onClick={enregistrer}>{occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
          <small>{message ?? (p.peutModifier
            ? p.initial.isDefault ? 'Valeurs par défaut du moteur · rien n’est encore enregistré pour cette marque.' : 'S’applique aux prochains verdicts calculés · les verdicts déjà validés ne bougent pas.'
            : 'Réservé aux administrateurs de l’espace.')}</small>
        </div>
      </section>
    </Vue>
  );
}
