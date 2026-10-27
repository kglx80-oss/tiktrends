'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { filtresProjetsSpatial, filtrerProjets, type CleFiltreProjet, type EtapeProjet } from '@tiktrends/core';
import { supprimerProjet, restaurerProjet } from '../../../app/actions/studios/archivage';
import { Ic, Lien } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { Creative, TuileVide, type CreativeSpatiale } from './briques';

/**
 * La zone projets des Studios (`section.sec` de la maquette) · filtres par
 * ÉTAPE réelle, cartes, archivage. CLIENT · on ne filtre que des cartes déjà
 * chargées sous leur droit (`listerCartesPour`) ; la règle (compteurs,
 * filtrage) vient du noyau.
 *
 * Les gestes de la carte (`.pacts`) · seul « Archiver » a une action réelle
 * (`supprimerProjet` · statut `archived`, versions et médias conservés,
 * annulable par `restaurerProjet`). « Dupliquer », « Supprimer
 * définitivement » et « Itérer » sur un projet n'ont pas de service · ils ne
 * sont pas rendus (l'itération part d'une pub mesurée, ci-dessus).
 */

export interface ProjetSpatial {
  id: string;
  href: string;
  title: string;
  marque: string;
  libelleType: string;
  etape: EtapeProjet;
  couverture: CreativeSpatiale[];
  version: string | null;
  pastille: { libelle: string; classe: string };
  segments: ReadonlyArray<'on' | 'cur' | ''>;
  libelleStp: string;
  reprise: string;
}

export function GrilleProjets({ projets, nouveau, note, peutArchiver, vide }: {
  projets: ProjetSpatial[];
  nouveau: { href: string } | null;
  note?: ReactNode;
  peutArchiver: boolean;
  vide: { titre: string; texte: ReactNode } | null;
}) {
  const { toast } = useSpatial();
  const [archives, setArchives] = useState<ProjetSpatial[]>([]);
  const [cle, setCle] = useState<CleFiltreProjet>('tous');
  const [occupe, setOccupe] = useState<string | null>(null);
  const verrou = useRef(false);
  const visibles = useMemo(() => projets.filter((p) => !archives.some((a) => a.id === p.id)), [projets, archives]);
  const filtres = useMemo(() => filtresProjetsSpatial(visibles), [visibles]);
  const affiches = useMemo(() => filtrerProjets(visibles, { cle, recherche: '' }), [visibles, cle]);

  async function geste(p: ProjetSpatial, sens: 'archiver' | 'restaurer') {
    if (verrou.current) return;
    verrou.current = true; setOccupe(p.id);
    try {
      const r = sens === 'archiver' ? await supprimerProjet({ projectId: p.id }) : await restaurerProjet({ projectId: p.id });
      if (!r.ok) { toast(r.message); return; }
      if (sens === 'archiver') { setArchives((l) => [...l, p]); toast(`« ${p.title} » archivé · ses versions et créations sont conservées`); }
      else { setArchives((l) => l.filter((a) => a.id !== p.id)); toast(`« ${p.title} » restauré`); }
    } catch {
      toast(sens === 'archiver' ? 'Archivage non confirmé · recharge la page pour vérifier le projet.' : 'Restauration non confirmée · recharge la page pour vérifier le projet.');
    } finally { verrou.current = false; setOccupe(null); }
  }

  return (
    <section className="sec">
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filtrer les projets">
          {filtres.map((f) => <button key={f.cle} type="button" data-pf={f.cle} aria-pressed={cle === f.cle} onClick={() => setCle(f.cle)}>{f.libelle}</button>)}
        </div>
        {nouveau && (
          <Lien className="ctanew" href={nouveau.href}>
            <span className="cn-ic"><Ic n="plus" s={false} /></span>
            <span className="cn-t"><strong>Nouveau projet</strong><small>Le type, le brief, puis le style dans le projet</small></span>
            <Ic n="arrow" />
          </Lien>
        )}
      </div>
      {note}
      {archives.map((a) => (
        <div className="banner" key={a.id} role="status">
          <Ic n="folder" /><span>« {a.title} » archivé · retiré de la liste, rien n’est perdu.</span>
          <button className="btn sm" type="button" disabled={occupe === a.id} onClick={() => void geste(a, 'restaurer')} style={{ marginLeft: 'auto' }}>Annuler</button>
        </div>
      ))}
      {visibles.length === 0 && vide && <TuileVide titre={vide.titre} texte={vide.texte} />}
      {visibles.length > 0 && affiches.length === 0 ? (
        <TuileVide titre="Aucun projet à cette étape" texte="Les projets d’une autre étape restent dans « Tous »."
          action={<button className="btn sm" type="button" onClick={() => setCle('tous')} style={{ marginTop: 12 }}>Voir tous les projets</button>} />
      ) : (affiches.length > 0 || nouveau) && (
        <div className="pgrid">
          {affiches.map((p) => (
            <div className="pwrap" key={p.id}>
              <Lien className="pcard" href={p.href}>
                <div className="cover">
                  {p.couverture.map((c, i) => <Creative key={i} c={c} />)}
                  {p.version && <span className="pill ver">{p.version}</span>}
                </div>
                <div className="meta"><span>{p.libelleType}</span><span className={`pill ${p.pastille.classe}`.trim()}>{p.pastille.libelle}</span></div>
                <h3 title={p.title}>{p.title}</h3>
                <div className="steps4">{p.segments.map((s, i) => <i key={i} className={s} />)}</div>
                <div className="stp"><span>{p.libelleStp}</span><span>{p.reprise}</span></div>
              </Lien>
              {peutArchiver && (
                <div className="pacts">
                  <button type="button" title="Archiver" aria-label={`Archiver ${p.title}`} disabled={occupe === p.id} onClick={() => void geste(p, 'archiver')}><Ic n="folder" /></button>
                </div>
              )}
            </div>
          ))}
          {nouveau && (
            <Lien className="tile dash dashnew" href={nouveau.href}>
              <span className="ico"><Ic n="plus" s={false} /></span>
              <strong>Nouveau projet</strong>
              <small className="faint">Type → brief → création</small>
            </Lien>
          )}
        </div>
      )}
    </section>
  );
}
