import type { ReactNode } from 'react';
import { Ic } from '../../communs';
import { BoutonAppel, BoutonServeur, ImportLogo, type ImportLogoActions } from './interactifs';

/**
 * Les blocs communs aux écrans Marque (maquette : `favCard`, `siteSync`,
 * sous-navigation) · balisage à l'identique, valeurs en props. Sans état.
 */

export type ActionFormulaire = (fd: FormData) => Promise<void>;

/** Les sous-sections de la fiche · ordre de la maquette (`SUBS.marque`). */
export function sousNavMarque(id: string): Array<{ href: string; libelle: string }> {
  return [
    { href: `/brands/${id}`, libelle: 'Vue d’ensemble' },
    { href: `/brands/${id}/identite`, libelle: 'Identité' },
    { href: `/brands/${id}/offre`, libelle: 'Offre' },
    { href: `/brands/${id}/personas`, libelle: 'Personas' },
    { href: `/brands/${id}/regles`, libelle: 'Règles' },
  ];
}

/* ───────────────────────── Favicon / logo ───────────────────────── */

export interface PropsFaviconMarque {
  brandId: string;
  /** L'image montrée · le logo enregistré, sinon la favicon du site. `null` · l'initiale. */
  image: string | null;
  initiale: string;
  titre: string;
  detail: string;
  /** `importBrandDAAction` · `null` sans site ou sans droit (raison dans `raisonRecuperer`). */
  recuperer: ((i: { brandId: string }) => Promise<{ error?: string }>) | null;
  raisonRecuperer: string | null;
  /** Importer un fichier de logo · la charte actuelle (renvoyée telle quelle) et les deux actions EXISTANTES. */
  importLogo: {
    logos: readonly string[]; defaut: string | null; couleurs: readonly string[]; polices: readonly string[];
    /** `null` sans droit ou sans stockage (raison ci-dessous). */
    actions: ImportLogoActions | null; raison: string | null;
  };
}

export function CarteFavicon(p: PropsFaviconMarque) {
  return (
    <section className="tile favc">
      <div className="favv">{p.image ? <img src={p.image} alt="" /> : <span className="blogo">{p.initiale}</span>}</div>
      <div className="favt">
        <span className="lbl" style={{ margin: 0 }}>Favicon de la marque</span>
        <strong>{p.titre}</strong>
        <small className="faint">{p.detail}</small>
      </div>
      <div className="kc">
        <BoutonAppel className="btn sm" appel={p.recuperer} argument={{ brandId: p.brandId }} succes="Charte du site récupérée · logo, couleurs et polices manquants complétés" raison={p.raisonRecuperer} attente="Récupération…">
          <Ic n="loop" />Récupérer depuis le site
        </BoutonAppel>
        <ImportLogo brandId={p.brandId} logos={p.importLogo.logos} defaut={p.importLogo.defaut} couleurs={p.importLogo.couleurs} polices={p.importLogo.polices}
          actions={p.importLogo.actions} raison={p.importLogo.raison} />
      </div>
    </section>
  );
}

/* ───────────────────────── Lecture du site ───────────────────────── */

export interface PropsSyncSite {
  brandId: string;
  /** Le domaine du site · `null` quand la fiche n'en a pas. */
  site: string | null;
  /** `generateFullBrandAction` · `null` quand l'IA, le site ou le droit manque (raison ci-dessous). */
  relancer: ActionFormulaire | null;
  raison: string | null;
  /** Le prix RÉEL annoncé avant le clic · `null` pour un compte aux crédits illimités. */
  cout: number | null;
}

export function SyncSite(p: PropsSyncSite) {
  return (
    <section className="tile" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px' }}>
      <span className="ico" style={{ flex: 'none' }}><Ic n="loop" /></span>
      <div style={{ flex: '1 1 320px', minWidth: 0, display: 'grid', gap: 2 }}>
        <strong style={{ fontSize: 13 }}>{p.site ? `${p.site} · lecture du site à la demande` : 'Aucun site renseigné dans la fiche'}</strong>
        <small className="faint" style={{ fontSize: 12 }}>Tu as modifié ton site ? Relance un scan : Jarvis relit le site et complète les champs vides de la fiche, sans écraser ce que tu as saisi.</small>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
        {/* Aucun scan programmé n'existe côté serveur · bouton visible, fermé, avec sa raison. */}
        <button className="btn sm" type="button" aria-expanded="false" style={{ whiteSpace: 'nowrap' }} disabled title="La programmation des scans n’est pas encore disponible"><Ic n="cal" />Programmer</button>
        <BoutonServeur className="btn sm pri" style={{ whiteSpace: 'nowrap' }} action={p.relancer} champs={{ brandId: p.brandId }} raison={p.raison} attente="Lecture du site…">
          <Ic n="loop" />Relancer le scan{p.cout != null ? ` · ${p.cout} crédit${p.cout > 1 ? 's' : ''}` : ''}
        </BoutonServeur>
      </div>
    </section>
  );
}

/** Une ligne de liste de définitions (`dl.kv2`) · un texte, des options (`opt2`) ou des pastilles. */
export type ValeurKv =
  | { type: 'texte'; texte: ReactNode }
  | { type: 'options'; options: ReadonlyArray<{ texte: string; on: boolean }> }
  | { type: 'pastilles'; classe: '' | 'g' | 'r'; pastilles: readonly string[] }
  | { type: 'logo'; image: string | null; initiale: string; legende: string }
  | { type: 'vide'; texte: string };

export interface LigneKv { dt: string; dd: ValeurKv }

export function ListeKv({ lignes }: { lignes: readonly LigneKv[] }) {
  return (
    <dl className="kv2">
      {lignes.map((l) => [
        <dt key={`t${l.dt}`}>{l.dt}</dt>,
        <dd key={`d${l.dt}`}>
          {l.dd.type === 'texte' && l.dd.texte}
          {l.dd.type === 'vide' && <span className="faint">{l.dd.texte}</span>}
          {l.dd.type === 'options' && l.dd.options.map((o) => <span key={o.texte} className={`opt2${o.on ? ' on' : ''}`}>{o.texte}</span>)}
          {l.dd.type === 'pastilles' && l.dd.pastilles.map((x) => <span key={x} className={`pill ${l.dd.type === 'pastilles' ? l.dd.classe : ''}`.trim()}>{x}</span>)}
          {l.dd.type === 'logo' && (
            <>
              {l.dd.image
                ? <span className="blogo" style={{ width: 44, height: 44, fontSize: '16.5px', borderRadius: 12, backgroundImage: `url(${JSON.stringify(l.dd.image)})`, backgroundSize: 'cover' }} aria-label="Logo" />
                : <span className="blogo" style={{ width: 44, height: 44, fontSize: '16.5px', borderRadius: 12 }}>{l.dd.initiale}</span>}
              <span className="faint" style={{ fontSize: '11.5px' }}>{l.dd.legende}</span>
            </>
          )}
        </dd>,
      ])}
    </dl>
  );
}
