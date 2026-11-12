'use client';

import { useRef, useState, type KeyboardEvent as ClavierReact } from 'react';
import { useRouter } from 'next/navigation';
import { VIDE_LISTE_A_CONCLURE, dansFiltreLots, deplacementListe, gestesListeLots, lienLotSpatial, messageBorneListeLots, raccourciListeLots, touchesAffichees, type FiltreLots, type GestesListeLots, type PresentationLot } from '@tiktrends/core';
import { createBatchAction } from '../../../app/actions/adsmap-batch';
import { Anneau, EnTete, Ic, Lien, SousNav, Touche, Vue, useToucheVisible } from '../../communs';
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
 *
 * Lot 13 ter · passer d'un lot à l'autre au clavier · le focus sur le lien
 * d'un lot, ↓ et ↑ (table `RACCOURCIS`, portée « liste-lots », règle
 * `raccourciListeLots`) mènent au lot suivant ou précédent DE LA LISTE AFFICHÉE
 * (le filtre « À conclure » compris, dans son ordre), Entrée l'ouvre (le lien).
 * Au bord, le focus reste et la borne est dite (zone `role="status"` de la
 * coquille). Jamais dans un champ (le formulaire « Nouveau lot ») · rien
 * n'est écrit. L'aide sous la liste dit ces touches, lues dans la table · écart
 * de maquette déclaré (`spatial-resultats.test.tsx`).
 *
 * « À conclure » ouvert aux membres · `gestes` (`gestesListeLots`, noyau) dit
 * ce que la liste montre · pour un membre, le seul filtre « À conclure », ni
 * « Nouveau lot » ni barre « Itérer », et la raison écrite à la place du
 * bouton (écart de maquette déclaré, borné à la barre d'outils · même test).
 * Les lots reçus sont déjà ceux qu'il peut conclure · même parcours ↓ ↑.
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
  /** Ce que la liste montre (`gestesListeLots`) · absent, la liste complète. */
  gestes?: GestesListeLots;
  note: string;
  /** « Itérer · N itérations conseillées » · `boucleIterationLots` · absent, la barre n'est pas posée. */
  boucle?: { libelle: string; href: string; raison: null } | { libelle: string; href: null; raison: string };
}

export function Lots(p: PropsLots) {
  const gestes = p.gestes ?? gestesListeLots('complete', { admin: p.peutCreer });
  const peutCreer = p.peutCreer && gestes.creer;
  const [filtre, setFiltre] = useState<FiltreLots>(gestes.filtreInitial);
  const [creation, setCreation] = useState(false);
  const [but, setBut] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useSpatial();
  const liste = p.lots.filter((l) => dansFiltreLots(l.etat, filtre));
  const rangees = useRef<HTMLDivElement>(null);
  const suivant = useToucheVisible('liste-lot-suivant');
  const precedent = useToucheVisible('liste-lot-precedent');

  /** ↓ ↑ · seulement le focus sur le lien d'un lot de la liste (`surFocus`) · le lot voisin, ou la borne dite. */
  function parcourir(e: ClavierReact<HTMLDivElement>) {
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (!t?.matches('[data-lot-lien]')) return;
    const r = raccourciListeLots(
      { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey, repetee: false, dejaTraitee: e.defaultPrevented },
      { actifs: true, modaleOuverte: !!document.querySelector('[aria-modal="true"]'), cible: { tagName: t.tagName, role: t.getAttribute('role') } },
    );
    if (!r) return;
    e.preventDefault();
    const liens = [...(rangees.current?.querySelectorAll<HTMLElement>('[data-lot-lien]') ?? [])];
    const d = deplacementListe(liens.indexOf(t), liens.length, r.id === 'liste-lot-suivant' ? 1 : -1);
    const cible = liens[d.index];
    if (d.borne) toast(messageBorneListeLots(d.borne, liens.length));
    if (cible && cible !== t) { cible.focus(); cible.scrollIntoView?.({ block: 'nearest' }); }
  }

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
        <div className="seg" role="group" aria-label="Filtrer" aria-describedby={gestes.raison ? 'lots-raison-portee' : undefined}>
          {gestes.filtres.map((f) => (
            <button type="button" key={f.cle} aria-pressed={filtre === f.cle} onClick={() => setFiltre(f.cle)}>
              {f.libelle} · {p.lots.filter((l) => dansFiltreLots(l.etat, f.cle)).length}
            </button>
          ))}
        </div>
        {peutCreer && (
          <button className="btn pri sm" type="button" style={{ marginLeft: 'auto' }} aria-expanded={creation} onClick={() => setCreation((x) => !x)}><Ic n="plus" />Nouveau lot</button>
        )}
        {gestes.raison && <p className="faint" id="lots-raison-portee" data-raison-ferme="lots-composer" style={{ marginLeft: 'auto', fontSize: '11.5px' }}>{gestes.raison}</p>}
      </div>
      {peutCreer && creation && (
        <form className="blform" onSubmit={creer} style={{ marginBottom: 12 }}>
          <textarea value={but} onChange={(e) => setBut(e.target.value)} maxLength={300} placeholder="Ce que ce lot doit vérifier, en une phrase" aria-label="Objectif du lot" />
          {erreur && <p className="faint" role="alert">{erreur}</p>}
          <div className="kc">
            <button className="btn sm" type="button" onClick={() => setCreation(false)}>Annuler</button>
            <button className="btn sm pri" type="submit" disabled={occupe} style={{ marginLeft: 'auto' }}>{occupe ? 'Ouverture…' : 'Ouvrir le lot'}</button>
          </div>
        </form>
      )}
      <div style={{ display: 'grid', gap: 12 }} ref={rangees} onKeyDown={parcourir}>
        {liste.map((l) => (
          <div className="lotrow" style={{ cursor: 'default' }} key={l.id}>
            <span className="stack">{l.pubs.map((x, i) => <Pub key={i} texte={x.texte} image={x.image} r916={x.r916} />)}</span>
            <span style={{ minWidth: 0 }}>
              <h3 id={`lot-titre-${l.id}`}>{l.titre}</h3>
              <p className="muted" style={{ fontSize: '12.5px', marginTop: 4 }}>{l.hypothese ? <Hypothese texte={l.hypothese} /> : 'Aucune hypothèse écrite sur ses variantes.'}</p>
              <span className="meta"><span className="pill c"><Ic n="loop" />{l.categorie}</span><span className={`pill ${l.statut.classe}`}>{l.statut.libelle}</span><span className="faint" style={{ fontSize: '11.5px' }}>{l.mesure}</span></span>
            </span>
            <Anneau part={l.anneau.part} taille={54} libelle={l.anneau.libelle} classe={l.anneau.classe} />
            <Lien className={`btn sm ${l.action.primaire ? 'pri' : ''}`} href={l.action.href} data-lot-lien={l.id} aria-describedby={`lot-titre-${l.id}`}>{l.action.libelle}</Lien>
          </div>
        ))}
        {liste.length === 0 && <p className="faint">{gestes.raison ? VIDE_LISTE_A_CONCLURE : p.lots.length ? 'Aucun lot dans ce filtre.' : 'Aucun lot pour cette marque · ouvre le premier pour composer un test.'}</p>}
      </div>
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 12 }}>{p.note}</p>
      {liste.length > 1 && suivant && precedent && (
        <p className="faint" data-aide-liste-lots="" style={{ fontSize: '11.5px', marginTop: 6 }}>
          Au clavier, depuis un lot de la liste<Touche t={suivant} lue /><Touche t={precedent} lue /> lot suivant ou précédent · {touchesAffichees('Enter').join(' ')} l’ouvre.
        </p>
      )}
      {gestes.boucle && p.boucle && !p.boucle.href && <p className="faint" id="lots-boucle-raison" data-raison-ferme="boucle" style={{ fontSize: '11.5px', marginTop: 6 }}>{p.boucle.raison}</p>}
      {gestes.boucle && p.boucle && (
        <Ornement>
          {p.boucle.href
            ? <Lien className="btn pri" href={p.boucle.href} data-boucle=""><Ic n="loop" />{p.boucle.libelle}</Lien>
            : <button className="btn" type="button" data-boucle="ferme" aria-disabled aria-describedby="lots-boucle-raison" style={{ opacity: 0.5, cursor: 'default' }}><Ic n="loop" />{p.boucle.libelle}</button>}
        </Ornement>
      )}
    </Vue>
  );
}
