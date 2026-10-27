import type { ReactNode } from 'react';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { Creative, type CreativeSpatiale } from './briques';
import { GrilleProjets, type ProjetSpatial } from './GrilleProjets';

/**
 * « Studios » · `docs/spatial/reference/studios.html`, balisage à l'identique.
 * PRÉSENTATIONNEL · la page (`app/(spatial)/sp/studio/projets`) lit tout en
 * base sous les droits du studio ; la grille (filtres, archivage) est un
 * composant client qui n'appelle que les actions serveur existantes.
 *
 * Les « Prochaines itérations » sont le plan d'itération RÉEL (gagnantes
 * prouvées, `chargerProchainesIterations`) · aucun devis n'existe avant la
 * génération, la carte le dit au lieu d'afficher un prix inventé.
 */

export interface CarteIterationSpatiale {
  id: string;
  flux: CreativeSpatiale[];
  pastille: { libelle: string; classe: string; icone: string };
  titre: string;
  mesure: { valeur: string; libelle: string; detail: string } | null;
  garde: string | null;
  change: string;
  raison: string;
  /** La reprise réelle (préparation du projet, brief repris) · `null` si le rôle ne peut pas créer. */
  iterer: string | null;
  note: string;
}

export type IterationsSpatiales =
  | { etat: 'liste'; cartes: CarteIterationSpatiale[]; autre: { href: string; titre: string; sous: string } }
  | { etat: 'message'; message: string; lien: { href: string; libelle: string } | null };

export interface PropsStudios {
  sousNav: ReadonlyArray<{ href: string; libelle: ReactNode }>;
  iterations: IterationsSpatiales | null;
  projets: ProjetSpatial[];
  /** Les projets archivés relus (filtre « Archivés », restauration) · `null` s'ils n'ont pas pu être relus. */
  archives?: ProjetSpatial[] | null;
  /** Le geste « Nouveau projet » · absent quand le rôle ou l'absence de marque l'interdit (la raison est dans `note`). */
  nouveau: { href: string } | null;
  /** Une ligne d'information sous la barre (marque active, rôle en lecture seule…). */
  note?: ReactNode;
  /** L'archivage réel (`supprimerProjet`, réversible) est-il permis à ce rôle ? */
  peutArchiver: boolean;
  /** Aucun projet du tout · l'état vide dit d'où partir. */
  vide?: { titre: string; texte: ReactNode } | null;
}

function CarteIteration({ c }: { c: CarteIterationSpatiale }) {
  return (
    <article className="tile itc">
      {c.flux.length > 0 && (
        <div className="flow">
          {c.flux.map((f, i) => (
            <FluxElement key={i} premier={i === 0} f={f} />
          ))}
        </div>
      )}
      <div className="body">
        <span className={`pill ${c.pastille.classe}`.trim()} style={{ justifySelf: 'start' }}><Ic n={c.pastille.icone} />{c.pastille.libelle}</span>
        <span className="q">{c.titre}</span>
        {c.mesure && <div className="metric"><b>{c.mesure.valeur}</b><span>{c.mesure.libelle}<em>{c.mesure.detail}</em></span></div>}
        <div className="kc">
          {c.garde && <span className="pill"><Ic n="lock" />{c.garde}</span>}
          <span className="pill c"><Ic n="loop" />{c.change}</span>
        </div>
        <p className="faint" style={{ fontSize: '11.5px' }}>{c.raison}</p>
        <div className="foot2">
          {c.iterer && <Lien className="btn pri sm" href={c.iterer}><Ic n="loop" />Itérer</Lien>}
          <small>{c.note}</small>
        </div>
      </div>
    </article>
  );
}

function FluxElement({ f, premier }: { f: CreativeSpatiale; premier: boolean }) {
  return (
    <>
      {!premier && <span className="faint"><Ic n="arrow" /></span>}
      <Creative c={f} />
    </>
  );
}

export function Studios(p: PropsStudios) {
  return (
    <Vue>
      <EnTete titre="Studios" sous="Tes projets, du premier brief au dernier export" />
      <SousNav items={p.sousNav} actif="/studio/projets" />
      {p.iterations && (
        <section>
          <div className="sech"><h2>Prochaines itérations</h2></div>
          {p.iterations.etat === 'liste' ? (
            <div className="itgrid">
              {p.iterations.cartes.map((c) => <CarteIteration key={c.id} c={c} />)}
              <Lien className="tile dash" href={p.iterations.autre.href}>
                <span className="ico"><Ic n="plus" s={false} /></span>
                <strong>{p.iterations.autre.titre}</strong>
                <small className="faint">{p.iterations.autre.sous}</small>
              </Lien>
            </div>
          ) : (
            <div className="tile">
              <p className="muted">{p.iterations.message}</p>
              {p.iterations.lien && <Lien className="btn sm" href={p.iterations.lien.href} style={{ marginTop: 10 }}>{p.iterations.lien.libelle}</Lien>}
            </div>
          )}
        </section>
      )}
      <GrilleProjets projets={p.projets} archives={p.archives ?? null} nouveau={p.nouveau} note={p.note} peutArchiver={p.peutArchiver} vide={p.vide ?? null} />
    </Vue>
  );
}
