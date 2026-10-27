'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cheminPorte, ETAPES_ITERATION_SPATIALE, type ChoixIterationSpatial } from '@tiktrends/core';
import { EnTete, Lien, Vue } from '../../communs';
import { Creative, TuileVide } from './briques';
import { Ornement } from './Ornement';

/**
 * « Nouvelle itération » · `docs/spatial/reference/iterer.html` (étape 1),
 * balisage à l'identique. Les pubs sont le PLAN D'ITÉRATION réel (règle
 * `choixIterationSpatial`, noyau) ; « Préparer le projet » mène à la reprise
 * RÉELLE du brief d'itération (préparation du projet), où l'on relit avant de
 * créer, puis au projet, où le devis serveur précède toute génération. La
 * maquette simule ici la génération de variantes · rien de tel n'est reproduit :
 * aucune variante, aucun crédit, aucun appel.
 */

export interface PropsIterer {
  sous: string;
  resume: string;
  choix: ReadonlyArray<ChoixIterationSpatial>;
  initial: string | null;
  /** Sans pub à proposer (offre, marque, plan vide) · ce que l'écran dit, et où aller. */
  vide: { titre: string; texte: string; lien: { href: string; libelle: string } | null } | null;
}

export function Iterer(p: PropsIterer) {
  const router = useRouter();
  const [choisi, setChoisi] = useState<string | null>(p.initial);
  const c = p.choix.find((x) => x.adId === choisi && x.selectionnable) ?? null;
  const aller = (href: string) => { if (cheminPorte(href)) router.push(href); else window.location.assign(href); };

  return (
    <Vue>
      <EnTete titre="Nouvelle itération" sous={p.sous} />
      <ol className="itsteps" aria-label="Étapes">
        {ETAPES_ITERATION_SPATIALE.map((t, i) => (
          <li key={t}><button type="button" className={i === 0 ? 'on' : ''} disabled><b>{i + 1}</b><span>{t}</span></button></li>
        ))}
      </ol>
      {p.vide ? (
        <TuileVide titre={p.vide.titre} texte={p.vide.texte}
          action={p.vide.lien ? <Lien className="btn sm" href={p.vide.lien.href} style={{ marginTop: 12 }}>{p.vide.lien.libelle}</Lien> : undefined} />
      ) : (
        <>
          <div className="ithead"><h2>Quelle pub veux-tu améliorer ?</h2><p className="muted">{p.resume}</p></div>
          <div className="itads">
            {p.choix.map((x) => (
              <button key={x.adId} type="button" className={`itad ${x.adId === choisi ? 'on' : ''}`.trim()} data-itad={x.adId} aria-pressed={x.adId === choisi}
                disabled={!x.selectionnable} onClick={() => setChoisi(x.adId)}>
                <span className="itadv"><Creative c={{ src: x.vignette }} /></span>
                <span className="itadb">
                  {x.pastilles.map((t) => <span key={t.libelle} className={`pill ${t.classe}`.trim()}>{t.libelle}</span>)}
                  <strong>{x.titre}</strong>
                  {x.chiffres.length > 0 && <span className="itnums">{x.chiffres.map((n) => <span key={n.libelle}>{n.libelle} <b>{n.valeur}</b></span>)}</span>}
                  <small>{x.raison}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {c?.lien && (
        <Ornement>
          <span className="info">On change <b>{c.change.variable.toLowerCase()}</b> de <b>{c.titre}</b>{c.change.garde ? <> · on garde {c.change.garde.toLowerCase()}</> : null}</span>
          <button className="btn pri" type="button" onClick={() => aller(c.lien!)}>Préparer le projet</button>
        </Ornement>
      )}
    </Vue>
  );
}
