'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FILTRES_LOTS, dansFiltreLots, lienLotSpatial, type FiltreLots, type PresentationLot } from '@tiktrends/core';
import { createBatchAction } from '../../../app/actions/adsmap-batch';
import { Anneau, EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { Ornement } from '../studios/Ornement';
import { Hypothese, Pub, type SousNavResultats } from './communs';

/**
 * « Lots de test » · `docs/spatial/reference/lots.html`, balisage à l'identique.
 * Les lots RÉELS de la marque (`adsmap_batches`), leur état lu par la règle du
 * noyau (`etatLotSpatial`), filtrables comme dans la maquette. « Nouveau lot »
 * ouvre un vrai lot (`createBatchAction`, admin) puis mène à sa fiche, où il se
 * compose · rien n'est simulé. Le bouton de boucle (barre flottante) compte les
 * gagnantes prouvées du plan d'itération réel (`boucleIterationLots`) et mène à
 * l'écran Itérer · fermé, il dit pourquoi.
 */

export interface LigneLot extends Pick<PresentationLot, 'id' | 'etat' | 'titre' | 'hypothese' | 'categorie' | 'statut' | 'anneau' | 'action'> {
  /** `r916` · format vertical, seulement s'il est connu (aucune source aujourd'hui · toujours faux). */
  pubs: Array<{ texte: string; image: string | null; r916?: boolean }>;
  mesure: string;
}

export interface PropsLots {
  sousNav: SousNavResultats;
  sous: string;
  lots: readonly LigneLot[];
  peutCreer: boolean;
  note: string;
  /** « Itérer · N itérations conseillées » · `boucleIterationLots` · absent, la barre n'est pas posée. */
  boucle?: { libelle: string; href: string; raison: null } | { libelle: string; href: null; raison: string };
}

export function Lots(p: PropsLots) {
  const [filtre, setFiltre] = useState<FiltreLots>('tous');
  const [creation, setCreation] = useState(false);
  const [but, setBut] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useSpatial();
  const liste = p.lots.filter((l) => dansFiltreLots(l.etat, filtre));

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (occupe) return;
    setOccupe(true); setErreur(null);
    const r = await createBatchAction(but);
    setOccupe(false);
    if (r.error || !r.id) { setErreur(r.error ?? 'Création impossible.'); return; }
    toast(`Lot #${r.number} ouvert · range ses variantes pour le préparer`);
    router.push(lienLotSpatial(r.id));
  }

  return (
    <Vue>
      <EnTete titre="Lots de test" sous={p.sous} />
      <SousNav items={p.sousNav} actif="/adsmap/lots" />
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filtrer">
          {FILTRES_LOTS.map((f) => (
            <button type="button" key={f.cle} aria-pressed={filtre === f.cle} onClick={() => setFiltre(f.cle)}>
              {f.libelle} · {p.lots.filter((l) => dansFiltreLots(l.etat, f.cle)).length}
            </button>
          ))}
        </div>
        {p.peutCreer && (
          <button className="btn pri sm" type="button" style={{ marginLeft: 'auto' }} aria-expanded={creation} onClick={() => setCreation((x) => !x)}><Ic n="plus" />Nouveau lot</button>
        )}
      </div>
      {creation && (
        <form className="blform" onSubmit={creer} style={{ marginBottom: 12 }}>
          <textarea value={but} onChange={(e) => setBut(e.target.value)} maxLength={300} placeholder="Ce que ce lot doit vérifier, en une phrase" aria-label="Objectif du lot" />
          {erreur && <p className="faint" role="alert">{erreur}</p>}
          <div className="kc">
            <button className="btn sm" type="button" onClick={() => setCreation(false)}>Annuler</button>
            <button className="btn sm pri" type="submit" disabled={occupe} style={{ marginLeft: 'auto' }}>{occupe ? 'Ouverture…' : 'Ouvrir le lot'}</button>
          </div>
        </form>
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {liste.map((l) => (
          <div className="lotrow" style={{ cursor: 'default' }} key={l.id}>
            <span className="stack">{l.pubs.map((x, i) => <Pub key={i} texte={x.texte} image={x.image} r916={x.r916} />)}</span>
            <span style={{ minWidth: 0 }}>
              <h3>{l.titre}</h3>
              <p className="muted" style={{ fontSize: '12.5px', marginTop: 4 }}>{l.hypothese ? <Hypothese texte={l.hypothese} /> : 'Aucune hypothèse écrite sur ses variantes.'}</p>
              <span className="meta"><span className="pill c"><Ic n="loop" />{l.categorie}</span><span className={`pill ${l.statut.classe}`}>{l.statut.libelle}</span><span className="faint" style={{ fontSize: '11.5px' }}>{l.mesure}</span></span>
            </span>
            <Anneau part={l.anneau.part} taille={54} libelle={l.anneau.libelle} classe={l.anneau.classe} />
            <Lien className={`btn sm ${l.action.primaire ? 'pri' : ''}`} href={l.action.href}>{l.action.libelle}</Lien>
          </div>
        ))}
        {liste.length === 0 && <p className="faint">{p.lots.length ? 'Aucun lot dans ce filtre.' : 'Aucun lot pour cette marque · ouvre le premier pour composer un test.'}</p>}
      </div>
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 12 }}>{p.note}</p>
      {p.boucle && !p.boucle.href && <p className="faint" id="lots-boucle-raison" data-raison-ferme="boucle" style={{ fontSize: '11.5px', marginTop: 6 }}>{p.boucle.raison}</p>}
      {p.boucle && (
        <Ornement>
          {p.boucle.href
            ? <Lien className="btn pri" href={p.boucle.href} data-boucle=""><Ic n="loop" />{p.boucle.libelle}</Lien>
            : <button className="btn" type="button" data-boucle="ferme" aria-disabled aria-describedby="lots-boucle-raison" style={{ opacity: 0.5, cursor: 'default' }}><Ic n="loop" />{p.boucle.libelle}</button>}
        </Ornement>
      )}
    </Vue>
  );
}
