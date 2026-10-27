import type { CSSProperties } from 'react';
import { LIBELLE_NIVEAU, type KpiBoucle, type NiveauPreuve } from '@tiktrends/core';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { BoutonVers } from './BoutonVers';
import { Points, Pub, type SousNavResultats } from './communs';

/**
 * « Boucle d'itération » · `docs/spatial/reference/boucle.html`, balisage à
 * l'identique. Nouvelle adresse · chaque carte est un objet RÉEL de la marque
 * (suite du moteur d'itération, variante hors lot, lot, apprentissage), rangé
 * dans sa colonne par son état (règles du noyau). Les chiffres du bandeau sont
 * calculés (`kpisBoucle`) · « Non calculable » plutôt qu'un taux inventé.
 */

const sc = (c: string) => ({ ['--sc' as string]: c }) as CSSProperties;

/** Les teintes de source de la maquette (`--sc`) · clé → couleur, présentation seule. */
const TEINTE = { bleu: '#8fd8ff', ambre: '#ffd48a', vert: '#7ef0b0', rose: '#f9a8d4', violet: '#c4b5fd' } as const;
export type TeinteBoucle = keyof typeof TEINTE;
const NIVEAU_COULEUR: Record<NiveauPreuve, string> = { 3: TEINTE.vert, 2: TEINTE.bleu, 1: TEINTE.ambre };

const ETAPES: ReadonlyArray<[string, string, string]> = [
  ['q', '1. Hypothèse', 'Une idée vérifiable : si…, alors…, parce que…'],
  ['cal', '2. Préparation', 'Une seule variable, des noms régie générés avant'],
  ['flask', '3. Diffusion', 'Même audience, même budget, pendant la fenêtre'],
  ['chart', '4. Analyse', 'Les mesures remontent, on arbitre les verdicts'],
  ['bulb', '5. Apprentissage', 'Ce qui est prouvé nourrit les prochains briefs'],
];

export interface IdeeBoucle { id: string; icone: string; teinte: TeinteBoucle; origine: string; texte: string; categorie: string; action: { libelle: string; href: string } }
export interface LotBoucle { id: string; titre: string; categorie: string; action: { libelle: string; href: string } }

export interface PropsBoucle {
  sousNav: SousNavResultats;
  kpis: readonly KpiBoucle[];
  prochaine: { titre: string; phrase: string; bouton: string; href: string };
  idees: readonly IdeeBoucle[];
  /** Où mène « Ajouter une hypothèse » (les suites · aucune saisie libre n'existe côté serveur). */
  ajouter: string;
  preparation: ReadonlyArray<LotBoucle & { fait: number; sur: number }>;
  diffusion: ReadonlyArray<LotBoucle & { image: string | null; r916?: boolean; part: number; jour: string; bilan: string }>;
  analyse: ReadonlyArray<LotBoucle & { pubs: Array<{ image: string | null; gagne: boolean }>; detail: string; statut: { libelle: string; classe: string } }>;
  apprentissages: ReadonlyArray<{ id: string; niveau: NiveauPreuve; texte: string; statut: { libelle: string; classe: string }; valide: string | null }>;
  alimenter: ReadonlyArray<{ icone: string; teinte: TeinteBoucle; titre: string; texte: string; action: { libelle: string; href: string; primaire?: boolean } }>;
}

export function Boucle(p: PropsBoucle) {
  return (
    <Vue>
      <EnTete titre="Boucle d’itération" sous="Le cœur de TikTrends : chaque test nourrit le suivant" />
      <SousNav items={p.sousNav} actif="/adsmap/boucle" />
      <section className="tile blhero">
        <div className="blsteps">
          {ETAPES.flatMap(([i, t, d], k) => [
            ...(k ? [<span className="blarr" key={`f${k}`}><Ic n="arrow" /></span>] : []),
            <div className="bls" key={t}><span className="blsi"><Ic n={i} /></span><strong>{t}</strong><small>{d}</small></div>,
          ])}
        </div>
        <div className="blkpis">
          {p.kpis.map((k) => <div key={k.libelle}><small>{k.libelle}</small><b>{k.valeur}</b><span>{k.note}</span></div>)}
        </div>
      </section>
      <section className="blnext">
        <span className="orb">J</span>
        <div style={{ flex: 1, minWidth: 240 }}><span className="lbl" style={{ margin: 0 }}>Prochaine meilleure action</span><h3>{p.prochaine.titre}</h3><p>{p.prochaine.phrase}</p></div>
        <Lien className="btn pri" href={p.prochaine.href}>{p.prochaine.bouton}<Ic n="arrow" /></Lien>
      </section>
      <section className="sec">
        <div className="sech"><h2>Où en est chaque test</h2><span className="faint" style={{ fontSize: '12.5px' }}>Chaque carte avance d’une colonne quand son état réel change</span></div>
        <div className="blboard">
          <div className="blcol">
            <header><strong>Hypothèses</strong><span>{p.idees.length}</span></header>
            {p.idees.map((h) => (
              <article className="blc" key={h.id}>
                <div className="blsrc" style={sc(TEINTE[h.teinte])}><Ic n={h.icone} />{h.origine}</div>
                <p>{h.texte}</p>
                <div className="blf"><span className="pill">{h.categorie}</span><Lien className="btn sm pri" href={h.action.href}>{h.action.libelle}<Ic n="arrow" /></Lien></div>
              </article>
            ))}
            <BoutonVers className="bladd" href={p.ajouter}><Ic n="plus" />Ajouter une hypothèse</BoutonVers>
          </div>
          <div className="blcol">
            <header><strong>Préparation</strong><span>{p.preparation.length}</span></header>
            {p.preparation.map((l) => (
              <article className="blc" key={l.id}>
                <strong>{l.titre}</strong>
                <div className="blpr"><i className="amar"><b style={{ width: `${(l.fait / l.sur) * 100}%` }} /></i><small>Préparation {l.fait}/{l.sur}</small></div>
                <div className="blf"><span className="pill">{l.categorie}</span><Lien className="btn sm" href={l.action.href}>{l.action.libelle}</Lien></div>
              </article>
            ))}
            {p.preparation.length === 0 && <p className="blempty">Aucun lot en préparation</p>}
          </div>
          <div className="blcol">
            <header><strong>Diffusion</strong><span>{p.diffusion.length}</span></header>
            {p.diffusion.map((l) => (
              <article className="blc" key={l.id}>
                <div className="blth"><Pub texte=" " image={l.image} r916={l.r916} /></div>
                <strong>{l.titre}</strong>
                <div className="blpr"><i className="amar"><b style={{ width: `${l.part}%` }} /></i><small>{l.jour}</small></div>
                <small className="faint">{l.bilan}</small>
                <div className="blf"><span className="pill">{l.categorie}</span><Lien className="btn sm" href={l.action.href}>{l.action.libelle}</Lien></div>
              </article>
            ))}
            {p.diffusion.length === 0 && <p className="blempty">Aucun lot en diffusion</p>}
          </div>
          <div className={`blcol ${p.analyse.length ? 'alert' : ''}`}>
            <header><strong>Analyse</strong><span>{p.analyse.length}</span></header>
            {p.analyse.map((l) => (
              <article className="blc hot" key={l.id}>
                <div className="blth">{l.pubs.map((x, i) => <Pub key={i} texte=" " image={x.image} classe={x.gagne ? 'won' : undefined} />)}</div>
                <strong>{l.titre}</strong>
                <small className="faint">{l.detail}</small>
                <div className="blf"><span className={`pill ${l.statut.classe}`}>{l.statut.libelle}</span><Lien className="btn sm pri" href={l.action.href}>{l.action.libelle}</Lien></div>
              </article>
            ))}
            {p.analyse.length === 0 && <p className="blempty">Rien à analyser</p>}
          </div>
          <div className="blcol">
            <header><strong>Apprentissages</strong><span>{p.apprentissages.length}</span></header>
            {p.apprentissages.map((a) => (
              <article className="blc" key={a.id}>
                <div className="blsrc" style={sc(NIVEAU_COULEUR[a.niveau])}><Points n={a.niveau} /> {a.niveau === 1 ? 'Non mesuré' : LIBELLE_NIVEAU[a.niveau]}</div>
                <p>{a.texte}</p>
                <div className="blf"><span className={`pill ${a.statut.classe}`}>{a.statut.libelle}</span>{a.valide ? <small className="faint">{a.valide}</small> : <Lien className="btn sm" href="/adsmap/apprentissages">Voir</Lien>}</div>
              </article>
            ))}
            {p.apprentissages.length === 0 && <p className="blempty">Aucun apprentissage écrit</p>}
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="sech"><h2>Alimenter la boucle</h2><span className="faint" style={{ fontSize: '12.5px' }}>Plus la boucle reçoit d’idées et de mesures, plus Jarvis est précis</span></div>
        <div className="blfeed">
          {p.alimenter.map((f) => (
            <div className="tile blsrcc" style={sc(TEINTE[f.teinte])} key={f.titre}>
              <span className="blsi"><Ic n={f.icone} /></span><strong>{f.titre}</strong><small>{f.texte}</small>
              <Lien className={`btn sm ${f.action.primaire ? 'pri' : ''}`} href={f.action.href}>{f.action.libelle}</Lien>
            </div>
          ))}
        </div>
      </section>
    </Vue>
  );
}
