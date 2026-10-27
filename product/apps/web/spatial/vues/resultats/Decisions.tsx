'use client';

import { useState } from 'react';
import { classeDecision, enJeuDecision, libelleDecision, lienFicheTest } from '@tiktrends/core';
import { refreshDecisionsAction, resolveDecisionAction } from '../../../app/actions/adsmap-decisions';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { useGeste, Retour } from './geste';
import type { SousNavResultats } from './communs';

/**
 * « À décider » · la file de décisions de l'ancienne Adsmap (l'onglet par
 * défaut), dans le langage de la maquette (`.tl`, `.pill`, `.btn`). Lue par
 * `listDecisionsAction`, recalculée par `refreshDecisionsAction`, chaque ligne
 * fermée par `resolveDecisionAction` · « Fait » disparaît au recalcul si les
 * faits ont suivi, « Pas un problème » empêche la reproposition. Le montant en
 * jeu justifie l'ordre · il est affiché sur la ligne.
 */

export interface DecisionLue { id: string; type: string; titre: string; action: string; priorite: number; enJeu: number | null; adId: string | null }

export interface PropsDecisions {
  sousNav: SousNavResultats;
  sous: string;
  resume: string;
  ecartees: number;
  decisions: readonly DecisionLue[];
  erreur: string | null;
}

export function Decisions(p: PropsDecisions) {
  const { occupe, message, geste } = useGeste();
  const [fermees, setFermees] = useState<ReadonlySet<string>>(new Set());
  const liste = p.decisions.filter((d) => !fermees.has(d.id));
  async function fermer(d: DecisionLue, statut: 'done' | 'dismissed') {
    const r = await geste(`${statut}-${d.id}`, () => resolveDecisionAction(d.id, statut), () => (statut === 'done' ? 'Décision marquée faite' : 'Décision écartée · elle ne reviendra pas'));
    if (r) setFermees((s) => new Set(s).add(d.id));
  }
  return (
    <Vue>
      <EnTete titre="À décider" sous={p.sous} />
      <SousNav items={p.sousNav} actif="/adsmap" />
      <div className="toolbar">
        <p style={{ flex: '1 1 260px', fontSize: '13.5px' }}><b>{p.resume}</b></p>
        <button type="button" className="btn sm" disabled={!!occupe} onClick={() => { void geste('recalculer', () => refreshDecisionsAction(), () => 'File recalculée'); }}>
          <Ic n="loop" />{occupe === 'recalculer' ? 'Calcul…' : 'Recalculer'}
        </button>
      </div>
      <Retour message={message} />
      {p.erreur ? (
        <section className="tile"><p role="alert" className="muted">{p.erreur}</p></section>
      ) : liste.length === 0 ? (
        <section className="tile">
          <p className="muted">Rien à décider. La file se remplit après chaque mesure · « Mesurer maintenant » dans Importer, ou la synchro de la nuit.{p.ecartees > 0 ? ` ${p.ecartees} décision${p.ecartees > 1 ? 's' : ''} écartée${p.ecartees > 1 ? 's' : ''} ne reviendr${p.ecartees > 1 ? 'ont' : 'a'} pas.` : ''}</p>
        </section>
      ) : (
        <section className="tile">
          <div className="tl">
            {liste.map((d) => {
              const enJeu = enJeuDecision(d.enJeu);
              return (
                <div className="ev" key={d.id} style={{ alignItems: 'start' }}>
                  <span className={`pill ${classeDecision(d.priorite)}`}>{libelleDecision(d.type)}</span>
                  <span style={{ display: 'grid', gap: 4 }}>
                    <strong>{d.titre}</strong>
                    {d.action && <span className="muted" style={{ fontSize: '12.5px' }}>{d.action}</span>}
                    {enJeu && <span className="faint" style={{ fontSize: '11.5px' }}>{enJeu}</span>}
                  </span>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {d.adId && <Lien className="btn sm pri" href={lienFicheTest(d.adId)}>Ouvrir la fiche</Lien>}
                    <button type="button" className="btn sm" disabled={!!occupe} onClick={() => { void fermer(d, 'done'); }}>Fait</button>
                    <button type="button" className="btn sm" disabled={!!occupe} title="Ne plus proposer cette décision" onClick={() => { void fermer(d, 'dismissed'); }}>Pas un problème</button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </Vue>
  );
}
