'use client';

import { useCallback, useEffect, useState } from 'react';
import { CREDIT_COSTS, lectureMarche } from '@tiktrends/core';
import { learnFromFollowedAction, marketViewAction, type MarketView } from '../../../app/actions/market-learn';
import { useSpatial } from '../../coquille/contexte';
import { Ic } from '../../communs';

/**
 * « Mémoire marché de Jarvis » (vague 3) · ce que Jarvis a retenu des créas
 * concurrentes suivies, décrit avec la même grille que les tiennes et confronté
 * à tes chiffres. Lecture `marketViewAction` · « Apprendre des marques suivies »
 * passe par `learnFromFollowedAction` (barrière de dépense) · son coût est dit
 * AVANT le clic. Aucun pourcentage n'est un taux de réussite · c'est écrit.
 */
export function MemoireMarche({ marque }: { marque: string }) {
  const { toast } = useSpatial();
  const [v, setV] = useState<MarketView | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [msg, setMsg] = useState<{ texte: string; erreur: boolean } | null>(null);
  const charger = useCallback(async () => {
    const r = await marketViewAction();
    if (r.error) { setMsg({ texte: r.error, erreur: true }); return; }
    setV(r.view ?? null);
  }, []);
  useEffect(() => { void charger(); }, [charger]);

  async function apprendre() {
    if (occupe) return;
    setOccupe(true); setMsg(null);
    const r = await learnFromFollowedAction();
    setOccupe(false);
    if (r.error) { setMsg({ texte: r.error, erreur: true }); return; }
    setMsg({ texte: r.summary ?? 'Terminé.', erreur: false });
    toast('Mémoire marché mise à jour');
    await charger();
  }

  const l = v ? lectureMarche(v) : null;
  return (
    <section className="sec" id="lecture-marche" aria-label="Mémoire marché de Jarvis">
      <div className="sech"><h2>Mémoire marché de Jarvis</h2><span className="faint" style={{ fontSize: '12.5px' }}>{marque} · les créas concurrentes que tu suis, confrontées à tes chiffres</span></div>
      <div className="tile" style={{ display: 'grid', gap: 10 }}>
        {/* `flex-wrap` · en mobile le paragraphe tombait dans ~70 px (un mot par
            ligne) à côté du bouton · il garde au moins 260 px, le bouton passe dessous. */}
        <div className="member" style={{ flexWrap: 'wrap' }}>
          <p className="muted" style={{ fontSize: '12.5px', flex: '1 1 260px', minWidth: 0 }}>On ne connaît aucun chiffre de performance des autres : le seul signal disponible est qu’une pub qui tourne encore après trois semaines est une pub que son annonceur continue de payer.</p>
          <button type="button" className="btn sm pri" onClick={() => void apprendre()} disabled={occupe} style={{ marginLeft: 'auto' }}><Ic n="spark" />{occupe ? 'Analyse…' : `Apprendre des marques suivies · ${CREDIT_COSTS.asset_analysis} crédits par créa`}</button>
        </div>
        {l && <small className="faint">{l.compte}</small>}
        {msg && <p role={msg.erreur ? 'alert' : 'status'} style={{ fontSize: '12.5px', color: msg.erreur ? 'var(--bad)' : undefined }}>{msg.texte}</p>}
        {l?.resume && <p style={{ fontSize: '12.5px' }}><b>{l.resume}</b></p>}
        {l && l.contrastes.length > 0 && (
          <div className="grid2">
            {l.contrastes.map((c) => (
              <div className="tile" key={c.cle} style={{ display: 'grid', gap: 4 }}>
                {/* La pastille (`white-space:nowrap` dans la maquette) élargissait la
                    carte au-delà de l'écran · elle passe à la ligne, « N sources » aussi. */}
                <div className="member" style={{ flexWrap: 'wrap', rowGap: 4 }}><span className={`pill ${c.ton}`} style={{ marginLeft: 0, whiteSpace: 'normal' }}>{c.titre}</span><small className="faint" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }} title="Annonceurs distincts derrière cette observation">{c.sources}</small></div>
                <p style={{ fontSize: '12.5px' }}>{c.phrase}</p>
              </div>
            ))}
          </div>
        )}
        {l && l.groupes.length > 0 && (
          <details>
            <summary style={{ cursor: 'pointer', fontSize: '12.5px' }}>Voir les parts d’usage du marché</summary>
            <p style={{ fontSize: '11.5px', color: 'var(--warn)', margin: '8px 0' }}>Ce sont des parts d’USAGE parmi les annonceurs éprouvés (un annonceur qui décline la même créa compte une fois), pas des taux de réussite · aucun chiffre de performance des concurrents n’est connu.</p>
            <div className="grid2">
              {l.groupes.map((g) => (
                <div className="tile" key={g.dimension} style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                  <strong>{g.libelle}</strong>
                  {g.lignes.map((r) => (
                    <div key={r.cle} style={{ display: 'grid', gap: 3 }}>
                      <small className="faint" style={{ display: 'flex', gap: 8 }}><span style={{ flex: 1, minWidth: 0 }}>{r.cle} · {r.canal} · {r.qualification}</span>{r.detail}</small>
                      <div className="bar"><i><b style={{ width: `${r.part}%` }} /></i><span>{r.partTexte}</span></div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
        )}
        <small className="faint">{CREDIT_COSTS.asset_analysis} crédits par créa décrite · par lots de 20. Une créa déjà décrite n’est jamais repayée.</small>
      </div>
    </section>
  );
}
