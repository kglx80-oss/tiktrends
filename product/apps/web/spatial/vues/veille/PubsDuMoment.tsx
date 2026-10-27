import { EnTete, Ic, Lien, Vue } from '../../communs';
import { SousNavVeille, EtatVide } from './base';
import { BarreVeille, CarteVeille, type PropsBarreVeille } from './client';
import type { CarteVeilleDonnees } from './types';

/**
 * « Pubs du moment » · `docs/spatial/reference/veille.html`, balisage à
 * l'identique. PRÉSENTATIONNEL · la page (`app/(spatial)/sp/veille`) lit la
 * source d'annonces réelle (mêmes appels, caches et gardes que la Veille V5)
 * et calcule chaque valeur avec les règles du noyau (`spatial/veille`).
 */
export interface PropsPubsDuMoment {
  sous: string;
  pastilleRadar: string | null;
  recherche: {
    phrase: string;
    /** Ce que Jarvis a compris d'une phrase · les critères posés, chacun retirable (lien). */
    compris: { puces: ReadonlyArray<{ libelle: string; retirer: string }>; texte: { libelle: string; retirer: string } | null; effacer: string } | null;
    suggestions: readonly string[];
  };
  barre: PropsBarreVeille;
  cartes: ReadonlyArray<CarteVeilleDonnees>;
  /** Sans carte · ce qui s'est passé, et une sortie réelle. */
  vide: { titre: string; texte: string; action: { href: string; libelle: string } | null } | null;
  pages: { precedente: string | null; suivante: string | null; libelle: string } | null;
  coutJarvis: string;
}

export function PubsDuMoment(p: PropsPubsDuMoment) {
  const r = p.recherche;
  return (
    <Vue>
      <EnTete titre="Pubs du moment" sous={p.sous} />
      <SousNavVeille actif="/veille" pastilleRadar={p.pastilleRadar} />
      <div className="xtop">
        <form className="xai" id="xaiform" autoComplete="off" action="/veille" method="get">
          <label className="xsearch xbig">
            <span className="orb">J</span>
            <input id="xq" type="search" name="jarvis" defaultValue={r.phrase} placeholder="Décris ce que tu cherches, Jarvis s’occupe des filtres" aria-label="Recherche Jarvis dans la Veille" />
            <button className="btn pri sm" type="submit"><Ic n="search" />Rechercher</button>
          </label>
          {r.compris ? (
            <div className="xaires">
              <span className="lbl" style={{ margin: 0 }}>Jarvis a compris</span>
              {r.compris.puces.map((c) => <Lien key={c.libelle} className="chip on" href={c.retirer} aria-label={`Retirer ${c.libelle}`}>{c.libelle}<Ic n="x" /></Lien>)}
              {r.compris.texte && <span className="chip on">Texte : « {r.compris.texte.libelle} »<Lien className="xaitx" href={r.compris.texte.retirer} aria-label="Retirer le texte"><Ic n="x" /></Lien></span>}
              <Lien className="chip" href={r.compris.effacer}>Tout effacer</Lien>
            </div>
          ) : (
            <div className="xaisug">
              <span className="xaisugl">Exemples de recherche</span>
              {r.suggestions.map((s) => <button key={s} type="submit" className="chip" name="jarvis" value={s}>{s}</button>)}
            </div>
          )}
        </form>
      </div>
      <BarreVeille {...p.barre} />
      {p.cartes.length > 0
        ? <div className="xgrid">{p.cartes.map((c) => <CarteVeille key={c.cle} c={c} coutJarvis={p.coutJarvis} />)}</div>
        : p.vide && <EtatVide titre={p.vide.titre} texte={p.vide.texte} action={p.vide.action} />}
      {p.pages && (
        <div className="kc" style={{ justifyContent: 'center', marginTop: 18 }}>
          {p.pages.precedente ? <Lien className="btn sm" href={p.pages.precedente}><Ic n="back" />Précédent</Lien> : <button className="btn sm" type="button" disabled><Ic n="back" />Précédent</button>}
          <span className="faint" style={{ alignSelf: 'center', fontSize: 12.5 }}>{p.pages.libelle}</span>
          {p.pages.suivante ? <Lien className="btn sm" href={p.pages.suivante}>Suivant<Ic n="arrow" /></Lien> : <button className="btn sm" type="button" disabled>Suivant<Ic n="arrow" /></button>}
        </div>
      )}
    </Vue>
  );
}
