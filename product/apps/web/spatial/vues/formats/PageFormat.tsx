import type { ReactNode } from 'react';
import { NIVEAUX_CONSCIENCE, styleCrea, type CleStyle } from '@tiktrends/core';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { Composition } from './Composition';
import { OngletsFormat } from './OngletsFormat';

/**
 * La page d'un style · `docs/spatial/reference/f-<clé>.html` (vue `vFormat` de
 * la maquette), UNE vue pour les 28 styles. PRÉSENTATIONNEL · la page serveur
 * (`app/(spatial)/sp/veille/formats/[format]`) lit les sauvegardes classées.
 *
 * Les exemples sont les sauvegardes RÉELLES classées dans le format du style
 * (vignette, annonceur, pays et durée de la source) · pas des exemples
 * concurrents fabriqués. L'onglet « Modèles TikTrends » n'est pas repris (aucun
 * modèle réel par format), ni « Suivre ce format » (aucun suivi de format).
 */
export interface ExempleFormat {
  id: string;
  annonceur: { nom: string; initiale: string; couleur: string };
  pays: string | null;
  vignette: string | null;
  /** Diffusée 30 jours ou plus · le macaron « 30 j + ». */
  longue: boolean;
  diffusion: string;
  /** La préparation d'un projet à partir de cette annonce (mode clone). */
  iterer: string;
}

export interface PropsPageFormat {
  sousNav: ReadonlyArray<{ href: string; libelle: ReactNode }>;
  cle: CleStyle;
  image: string | null;
  marque: string | null;
  pastille: { classe: 'g' | 'w' | ''; texte: string } | null;
  tuiles: ReadonlyArray<readonly [string, string]>;
  /** La préparation d'un projet avec la consigne du format. */
  nouveauProjet: string;
  /** La préparation d'un projet à partir du meilleur exemple (le plus durable) · `null` sans exemple. */
  meilleurExemple: string | null;
  exemples: readonly ExempleFormat[];
  /** Le libellé du format de classement · `null` quand le style n'en a pas. */
  formatClassement: string | null;
}

export function PageFormat(p: PropsPageFormat) {
  const f = styleCrea(p.cle);
  const comp = (texte?: string) => <Composition cle={p.cle} image={p.image} marque={p.marque} texte={texte} />;

  const exemples = p.exemples.length > 0 ? (
    <div className="vfeed">
      {p.exemples.map((e) => (
        <article className="vitem" key={e.id}>
          <div className="who"><span className="av" style={{ background: e.annonceur.couleur }}>{e.annonceur.initiale}</span>{e.annonceur.nom}<span className="faint">{e.pays ?? ''}</span></div>
          <div style={{ position: 'relative' }}><div className="comp">{e.vignette ? <img src={e.vignette} alt={`Annonce de ${e.annonceur.nom}`} /> : null}</div>{e.longue && <span className="scale">30 j +</span>}</div>
          <div className="vmeta"><span>{e.diffusion}</span></div>
          <div className="acts">
            <Lien className="btn sm" href="/saved"><Ic n="bookmark" />Dans tes sauvegardes</Lien>
            <Lien className="btn sm" href={e.iterer}><Ic n="loop" />Itérer dans ce style</Lien>
          </div>
        </article>
      ))}
    </div>
  ) : p.formatClassement ? (
    <div className="dempty"><span className="ico"><Ic n="search" s={false} /></span><h3>Aucune sauvegarde classée « {p.formatClassement} »</h3>
      <p className="muted">Les exemples de ce style sont tes sauvegardes rangées dans ce format · classe-les une à une dans Sauvegardes, rien n’est deviné.</p>
      <Lien className="btn" href="/saved">Ouvrir Sauvegardes</Lien></div>
  ) : (
    <div className="dempty"><span className="ico"><Ic n="search" s={false} /></span><h3>Ce style n’a pas de format de classement</h3>
      <p className="muted">La liste de classement des annonces n’a pas d’équivalent de « {f.nom} » · aucune annonce n’y est comptée plutôt que d’être devinée.</p></div>
  );

  const anatomie = (
    <div className="grid2">
      <section className="tile"><div className="anat">{comp()}{f.zones.map((z, i) => <span key={z[0]} className="zm" style={{ left: `${z[2][0]}%`, top: `${z[2][1]}%` }}>{i + 1}</span>)}</div></section>
      <section className="tile" style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <h2>Les zones</h2>
        <ol className="zl">{f.zones.map((z) => <li key={z[0]}><strong>{z[0]}</strong><span className="muted">{z[1]}</span></li>)}</ol>
        <h2>Les règles</h2>
        <ul className="check2" style={{ margin: 0 }}>{f.regles.map((x) => <li key={x}><span className="cb ok"><Ic n="check" /></span><span>{x}</span><span /></li>)}</ul>
      </section>
    </div>
  );

  const vous = (
    <div className="dempty"><span className="ico"><Ic n="grid" s={false} /></span><h3>Tes créas ne sont pas encore rangées par format</h3>
      <p className="muted">Le studio ne range pas encore ses créations par style · lance un projet avec la consigne « {f.nom} », elle part avec la préparation.</p>
      <Lien className="btn pri" href={p.nouveauProjet}><Ic n="loop" />Nouveau projet avec ce format</Lien></div>
  );

  return (
    <Vue>
      <EnTete titre={f.nom} sous={f.definition} outils="credits" />
      <SousNav items={p.sousNav} actif="/veille/formats" />
      <Lien className="back2" href="/veille/formats"><Ic n="back" />Tous les formats</Lien>
      <section className="fhero">
        <div className="fhv">{comp()}</div>
        <div className="fhi">
          {f.enVeille.length > 0 && <small className="faint">Dans les bibliothèques publicitaires : {f.enVeille.join(' · ')}</small>}
          <div className="kc"><span className="pill">{f.famille}</span><span className="pill c">Objectif · {f.objectif}</span>{p.pastille && <span className={`pill ${p.pastille.classe}`}>{p.pastille.texte}</span>}</div>
          <div className="grid4">{p.tuiles.map(([a, b]) => <div className="tile kfig" key={a}><span className="lbl">{a}</span><span className="v">{b}</span></div>)}</div>
          <div><div className="lbl" style={{ marginBottom: 8 }}>Quand l’utiliser · niveau de conscience du client</div><div className="awl">{NIVEAUX_CONSCIENCE.map((a, i) => <span key={a} className={f.conscience.includes(i) ? 'on' : ''}>{a}</span>)}</div></div>
          <div className="kc">
            {p.meilleurExemple && <Lien className="btn pri" href={p.meilleurExemple}><Ic n="loop" />Partir du meilleur exemple</Lien>}
            <Lien className="btn" href={p.nouveauProjet}><Ic n="brush" />Nouveau projet avec ce format</Lien>
            <Lien className="btn" href="/veille/tendances"><Ic n="eye" />Voir les tendances</Lien>
          </div>
        </div>
      </section>
      <OngletsFormat onglets={[
        { cle: 'ex', libelle: `Exemples sauvegardés · ${p.exemples.length}`, contenu: exemples },
        { cle: 'ana', libelle: 'Anatomie & règles', contenu: anatomie },
        { cle: 'vous', libelle: 'Tes créas', contenu: vous },
      ]} />
    </Vue>
  );
}
