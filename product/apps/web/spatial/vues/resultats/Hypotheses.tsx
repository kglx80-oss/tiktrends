'use client';

import { useState } from 'react';
import { COLONNES_HYPOTHESES, categoriesHypotheses, type CarteHypothese } from '@tiktrends/core';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { Hypothese, Priorite, type SousNavResultats } from './communs';

/**
 * « Hypothèses » · `docs/spatial/reference/hypotheses.html`, balisage à l'identique.
 * Une hypothèse, dans l'outil, est le texte porté par une ad avec sa variable
 * testée · le tableau les range par avancement (règle `cartesHypotheses`), et
 * « À formuler » reçoit les suites du moteur d'itération. Aucune création libre
 * n'existe côté serveur · « Nouvelle hypothèse » mène aux suites, où une
 * hypothèse s'écrit à partir d'un test arbitré (`createIterationAction`).
 */

export interface PropsHypotheses {
  sousNav: SousNavResultats;
  cartes: readonly CarteHypothese[];
  /** Jarvis ouvert à la personne (formule et rôle) · sinon pas d'entrée vers lui. */
  jarvis: boolean;
  note: string;
}

export function Hypotheses(p: PropsHypotheses) {
  const [cat, setCat] = useState('tous');
  const cats = categoriesHypotheses(p.cartes);
  const liste = p.cartes.filter((c) => cat === 'tous' || c.categorie === cat);
  return (
    <Vue>
      <EnTete titre="Hypothèses" sous="Une phrase vérifiable par test : ce qu’on change, ce qu’on attend, pourquoi" />
      <SousNav items={p.sousNav} actif="/adsmap/hypotheses" />
      <div className="toolbar">
        <div className="pcats" style={{ margin: 0 }}>
          {cats.map((c) => <button type="button" className="chip" key={c.cle} aria-pressed={cat === c.cle} onClick={() => setCat(c.cle)}>{c.libelle} · {c.n}</button>)}
        </div>
        {p.jarvis && <Lien className="btn sm" href="/jarvis" style={{ marginLeft: 'auto' }}><Ic n="spark" />Suggérer avec Jarvis</Lien>}
        <Lien className="btn sm pri" href="/adsmap/suites" style={p.jarvis ? undefined : { marginLeft: 'auto' }}><Ic n="plus" />Nouvelle hypothèse</Lien>
      </div>
      <div className="board4">
        {COLONNES_HYPOTHESES.map((col) => {
          const items = liste.filter((c) => c.colonne === col.cle);
          return (
            <div key={col.cle}>
              <div className="colh">{col.titre}<span className="n">{items.length}</span></div>
              {items.map((h) => (
                <div className="hcard" key={h.cle}>
                  <div className="kc"><span className="pill c">{h.categorie}</span><Priorite n={h.priorite} /></div>
                  <p><Hypothese texte={h.texte} /></p>
                  <span className="faint" style={{ fontSize: '11.5px' }}>{h.meta}</span>
                  {h.conclusion
                    ? <span className={`pill ${h.conclusion.classe}`} style={{ justifySelf: 'start' }}><Ic n={h.conclusion.icone} />{h.conclusion.libelle}</span>
                    : h.action && <Lien className="btn sm" href={h.action.href} style={{ justifySelf: 'start' }}>{h.action.libelle}</Lien>}
                </div>
              ))}
              {items.length === 0 && <p className="faint" style={{ fontSize: '12.5px' }}>–</p>}
            </div>
          );
        })}
      </div>
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 8 }}>{p.note}</p>
    </Vue>
  );
}
