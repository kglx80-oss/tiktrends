import type { CSSProperties } from 'react';
import type { KpiResultats, NiveauPreuve } from '@tiktrends/core';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { Points, Pub, type SousNavResultats } from './communs';

/**
 * « Résultats · Vue d'ensemble » · `docs/spatial/reference/resultats.html`, balisage
 * à l'identique. PRÉSENTATIONNEL · la page (`app/(spatial)/sp/adsmap`) lit les
 * lots, leurs verdicts et les journées mesurées de la marque active. Le verdict
 * montré est celui du moteur existant (par variante, sur la cible CPA) · aucune
 * comparaison A/B n'est inventée.
 */

export interface VarianteVedette { id: string; texte: string; image: string | null; variante: string; categorie: string; gagnante: boolean; barre: { libelle: string; part: number } }

export interface LotVedette {
  statut: { libelle: string; classe: string };
  meta: string;
  titre: string;
  variantes: VarianteVedette[];
  note: string;
  passe: string;
  retient: { texte: string; niveau: NiveauPreuve; detail: string };
  ensuite: string;
  suite: { libelle: string; href: string };
  lot: { libelle: string; href: string };
}

export interface AutreLot {
  id: string;
  alerte: boolean;
  statut: { libelle: string; classe: string };
  titre: string;
  pubs: Array<{ texte: string; image: string | null; r916?: boolean }>;
  progression: number | null;
  texte: string;
  action: { libelle: string; href: string };
}

export interface PropsVueEnsemble {
  sousNav: SousNavResultats;
  sous: string;
  accroche: { avant: string; fort: string; apres: string };
  kpis: readonly KpiResultats[];
  vedette: LotVedette | null;
  autres: readonly AutreLot[];
  /** Sans vedette ni autre lot · où commencer (Lots pour un admin, Hypothèses sinon). */
  commencer: { libelle: string; href: string };
  /**
   * Les écrans hors maquette de la rubrique (gestes de l'ancienne Adsmap · règle
   * `outilsResultats`), sous les autres tests. Absent · rien n'est ajouté au
   * balisage de la maquette.
   */
  outils?: ReadonlyArray<{ href: string; libelle: string; icone: string }>;
}

/**
 * D5 · la pastille « Gagnante » (`.rvwin`) était posée sur la créa, en haut à
 * gauche, sur son accroche. Elle passe sous la légende de la variante · une
 * rangée APRÈS la barre, pour que les barres restent alignées d'une variante
 * à l'autre.
 */
const GAGNANTE_SOUS_LA_CREA: CSSProperties = { position: 'static', order: 1, justifySelf: 'start' };

export function VueEnsemble(p: PropsVueEnsemble) {
  const v = p.vedette;
  return (
    <Vue>
      <EnTete titre="Résultats" sous={p.sous} />
      <SousNav items={p.sousNav} actif="/adsmap" />
      <p className="rvlead">{p.accroche.avant} {p.accroche.fort && <b>{p.accroche.fort}</b>} {p.accroche.apres}</p>
      <div className="kpis rvk">
        {p.kpis.map((k) => (
          <div className="tile kpi" key={k.libelle}><div className="lbl">{k.libelle}</div><div className="v">{k.valeur} <span className={`d ${k.classe}`}>{k.delta}</span></div><small>{k.note}</small></div>
        ))}
      </div>
      {v ? (
        <section className="tile rvv" aria-labelledby="rvt">
          <div className="rvl">
            <div className="rvm"><span className={`pill ${v.statut.classe}`}>{v.statut.libelle}</span><span className="faint">{v.meta}</span></div>
            <h2 id="rvt">{v.titre}</h2>
            <div className="rvfs">
              {v.variantes.map((x) => (
                <figure className={`rvf ${x.gagnante ? 'best' : ''}`} key={x.id}>
                  <Pub texte={x.texte} image={x.image} classe={x.gagnante ? 'won' : undefined} />
                  {x.gagnante && <span className="rvwin" style={GAGNANTE_SOUS_LA_CREA}>Gagnante</span>}
                  <div className="rvbw"><div className="rvbar" style={{ height: `${x.barre.part}%` }}>{x.barre.libelle}</div></div>
                  <figcaption><b>{x.variante}</b> · {x.categorie}</figcaption>
                </figure>
              ))}
            </div>
            <p className="faint rvn">{v.note}</p>
          </div>
          <div className="rvr">
            <div className="rvbox ok"><span className="rvh">Ce qui s’est passé</span><b>{v.passe}</b></div>
            <div className="rvbox"><span className="rvh">Ce qu’on en retient</span><span>{v.retient.texte}</span><span className="faint rvdots"><Points n={v.retient.niveau} />{v.retient.detail}</span></div>
            <div className="rvbox warn"><span className="rvh">Et maintenant</span><span>{v.ensuite}</span></div>
            <div className="rvact"><Lien className="btn pri" href={v.suite.href}><Ic n="loop" />{v.suite.libelle}</Lien><Lien className="btn" href={v.lot.href}>{v.lot.libelle}</Lien></div>
          </div>
        </section>
      ) : (
        <section className="tile">
          <p className="muted">Aucun lot n’a encore de verdict · un verdict arrive quand les mesures d’un lot lancé remontent.</p>
          <Lien className="btn sm pri" href={p.commencer.href} style={{ marginTop: 12 }}>{p.commencer.libelle}</Lien>
        </section>
      )}
      <h2 className="rvh2">Tes autres tests</h2>
      {p.autres.length > 0 ? (
        <div className="rvo">
          {p.autres.map((o) => (
            <article className={`tile rvc ${o.alerte ? 'warn' : ''}`} key={o.id}>
              <span className={`pill ${o.statut.classe}`}>{o.statut.libelle}</span>
              <h3>{o.titre}</h3>
              <div className="rvads">
                {o.pubs.map((x, i) => <span className={x.r916 ? 'n916' : ''} key={i}><Pub texte={x.texte} image={x.image} r916={x.r916} /></span>)}
              </div>
              {o.progression !== null && <div className="rvp" aria-hidden="true"><i style={{ width: `${o.progression}%` }} /></div>}
              <p>{o.texte}</p>
              <Lien className={`btn sm ${o.alerte ? 'rvwarn' : ''}`} href={o.action.href}>{o.action.libelle}</Lien>
            </article>
          ))}
        </div>
      ) : (
        <p className="faint">Aucun autre lot pour cette marque.</p>
      )}
      {p.outils && p.outils.length > 0 && (
        <nav className="toolbar sec" aria-label="Aller plus loin dans les résultats">
          {p.outils.map((o) => <Lien className="btn sm" key={o.href} href={o.href}><Ic n={o.icone} />{o.libelle}</Lien>)}
        </nav>
      )}
    </Vue>
  );
}
