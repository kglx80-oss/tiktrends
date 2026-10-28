'use client';

import { Fragment, useState } from 'react';
import { Ic, Lien } from '../../communs';

/**
 * La bibliothèque du registre de prompts · trois familles (recettes de style,
 * consignes communes, templates) en onglets, sur les versions RÉELLES lues en
 * base. « Éditer » et « Créer » ouvrent l'éditeur du registre (« Registre IA »,
 * Spatial) · aucune édition n'est simulée ici.
 */
export interface EntreePrompt { id: string; titre: string; version: string; utilisations: string; production: { part: number; texte: string; absente: boolean }; maj: string; editer: string }
export interface FamillePromptAffichee { cle: string; libelle: string; colonne: string; entrees: readonly EntreePrompt[] }

const COL = '1.3fr .5fr .8fr .9fr 1fr auto';

export function BibliothequePrompts({ familles, pipeline, legende, kpis, titreListe }: {
  familles: readonly FamillePromptAffichee[];
  pipeline: ReadonlyArray<{ icone: string; libelle: string }>;
  legende: string;
  kpis: React.ReactNode;
  titreListe: string;
}) {
  const [f, setF] = useState(familles[0]?.cle ?? '');
  const fam = familles.find((x) => x.cle === f) ?? familles[0];
  return (
    <>
      <div className="aitabs">
        <div className="seg" role="group" aria-label="Bibliothèque IA">
          {familles.map((x) => <button key={x.cle} type="button" data-aitab={x.cle} aria-pressed={x.cle === fam?.cle} onClick={() => setF(x.cle)}>{x.libelle}<i className="nct">{x.entrees.length}</i></button>)}
        </div>
        <div className="aipipe" aria-label="Ordre d’assemblage">
          {pipeline.map((e, i) => (
            <Fragment key={e.libelle}>
              {i > 0 && <span className="aiarr"><Ic n="arrow" /></span>}
              <span className={`aistep ${i === pipeline.length - 1 ? 'end' : ''}`}><Ic n={e.icone} />{e.libelle}</span>
            </Fragment>
          ))}
        </div>
        <small className="faint" style={{ fontSize: 12 }}>{legende}</small>
      </div>
      {kpis}
      <section className="tile sec">
        <div className="sech"><h2>{titreListe}</h2><Lien className="btn sm pri" href="/admin/prompts/registre" style={{ marginLeft: 'auto' }}><Ic n="plus" />Créer dans le registre</Lien></div>
        <div className="atable">
          <div className="atr ath" style={{ gridTemplateColumns: COL }}><span>{fam?.colonne ?? 'Entrée'}</span><span>Version</span><span>Utilisations · 30 j</span><span>En production</span><span>Mise à jour</span><span /></div>
          {fam?.entrees.map((e) => (
            <div className="atr" key={e.id} style={{ gridTemplateColumns: COL }}>
              <span><b>{e.titre}</b></span><span className="mono">{e.version}</span><span>{e.utilisations}</span>
              <span><i className={e.production.absente ? 'amar over' : 'amar'}><b style={{ width: `${e.production.part}%` }} /></i>{e.production.texte}</span>
              <span className="faint">{e.maj}</span>
              <span><Lien className="btn sm" href={e.editer}>Éditer</Lien></span>
            </div>
          ))}
          {fam && fam.entrees.length === 0 && <p className="faint" style={{ fontSize: '12.5px', margin: '6px 0 0' }}>Aucune entrée dans cette famille du registre.</p>}
        </div>
      </section>
    </>
  );
}
