'use client';

import { useEffect, useRef, useState } from 'react';
import {
  COLONNES_HYPOTHESES, PARTIES_VIDES, TITRE_HYPOTHESE_NOTE, categoriesHypotheses, lienJarvisCarteHypothese, lienJarvisContexte,
  type CarteHypothese, type DepartHypothese, type SaisieHypotheseLibre, type TestedVariable,
} from '@tiktrends/core';
import type { ResultatHypothese, SourceHypothese } from '../../../app/actions/adsmap-hypotheses';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { Hypothese, Priorite, type SousNavResultats } from './communs';
import { BoutonHypothese, FormulaireHypothese } from './hypothese-client';
import { DialogueSpatial } from '../marque/interactifs';
import { BilanProvenances, type PropsBilanProvenances } from './BilanProvenances';

/**
 * « Hypothèses » · `docs/spatial/reference/hypotheses.html`, balisage à l'identique.
 * Une hypothèse, dans l'outil, est le texte porté par une ad avec sa variable
 * testée · le tableau les range par avancement (règle `cartesHypotheses`), et
 * « À formuler » reçoit les suites du moteur d'itération et les hypothèses
 * LIBRES (lot 1 V5) · « Nouvelle hypothèse » en écrit une à partir de rien
 * (`creerHypotheseAction`), et une hypothèse libre en brouillon se reprend sur
 * sa carte (« Compléter la phrase », `completerHypotheseAction`).
 *
 * Lot 5 · « Suggérer avec Jarvis » joint la page (`resultats:hypotheses`) et
 * prépare la question de la maquette (« Quelle variante tester ensuite ? ») ·
 * « Demander à Jarvis » sur une carte joint SON hypothèse. Rien n'est envoyé.
 */
const LIEN_JARVIS_PAGE = lienJarvisContexte('resultats', 'hypotheses', 'Quelle variante tester ensuite ?') ?? '/jarvis';

export interface PropsHypotheses {
  sousNav: SousNavResultats;
  cartes: readonly CarteHypothese[];
  /** Jarvis ouvert à la personne (formule et rôle) · sinon pas d'entrée vers lui. */
  jarvis: boolean;
  note: string;
  /** Écrire une hypothèse libre · absent, « Nouvelle hypothèse » mène aux suites (écran d'avant). */
  creer?: ((i: { source: SourceHypothese; saisie: SaisieHypotheseLibre }) => Promise<ResultatHypothese>) | null;
  /** Reprendre la phrase d'une hypothèse libre en brouillon. */
  completer?: ((i: { adId: string; saisie: SaisieHypotheseLibre }) => Promise<ResultatHypothese>) | null;
  /** « Demander à Jarvis » sur chaque carte (lot 5 V5) · absent, la carte reste celle de la maquette. */
  jarvisCartes?: boolean;
  /** Boucler la preuve · « D'où viennent les hypothèses qui gagnent » (`bilanProvenances`) · absent, rien n'est ajouté à la maquette. */
  bilan?: PropsBilanProvenances | null;
  /**
   * Lot 11 · ouvert depuis « Formuler une hypothèse » sous une note de la
   * lignée · la note RELUE par la page · le formulaire existant s'ouvre
   * pré-rempli, la note citée · refusée, la phrase seule · absent, rien.
   */
  depuisNote?: DepuisNoteHypothese | null;
}

export type DepuisNoteHypothese =
  | { refus: string }
  | { depart: DepartHypothese; note: string; source: { noteId: string; projetId: string } };

/**
 * Le formulaire d'hypothèse EXISTANT, ouvert d'emblée depuis une note · rien
 * n'est enregistré avant « Ranger dans « À formuler » » · la note est relue
 * encore par l'action (`creerHypotheseAction`, source `note`). Le focus va au
 * premier champ quand le formulaire est RENDU, et revient au bouton qui le
 * rouvre quand il se ferme · dans un effet, jamais par `setTimeout(0)`.
 */
function HypotheseDepuisNote({ d, creer }: { d: Extract<DepuisNoteHypothese, { depart: DepartHypothese }>; creer: NonNullable<PropsHypotheses['creer']> }) {
  const [ouvert, setOuvert] = useState(true);
  // Le formulaire se ferme après « Annuler » OU après le oui du serveur · la page dit lequel, et ne rouvre rien après un rangement.
  const [rangee, setRangee] = useState(false);
  const rendu = useRef(false);
  useEffect(() => {
    // Au premier rendu, le formulaire ouvert prend le focus · ensuite, chaque bascule le replace.
    if (ouvert) document.querySelector<HTMLElement>('[data-hypothese-note] textarea[name="si"]')?.focus();
    else if (rendu.current) document.querySelector<HTMLElement>('[data-geste="rouvrir-hypothese-note"], [data-hypothese-note-rangee]')?.focus();
    rendu.current = true;
  }, [ouvert]);
  return (
    <>
      {!ouvert && rangee && (
        <p className="faint" role="status" tabIndex={-1} data-hypothese-note-rangee="" style={{ fontSize: '12px', margin: '8px 0 0' }}>Hypothèse rangée dans « À formuler » depuis la note.</p>
      )}
      {!ouvert && !rangee && (
        <p className="faint" role="status" data-hypothese-note-fermee="" style={{ fontSize: '12px', margin: '8px 0 0' }}>
          Le formulaire de la note est fermé · rien n’a été enregistré.{' '}
          <button className="btn sm" type="button" data-geste="rouvrir-hypothese-note" style={{ minHeight: 44 }} onClick={() => setOuvert(true)}><Ic n="bulb" />Rouvrir le formulaire</button>
        </p>
      )}
      <DialogueSpatial titre={TITRE_HYPOTHESE_NOTE} ouvert={ouvert} fermer={() => setOuvert(false)}>
        <div data-hypothese-note="">
          <FormulaireHypothese depart={d.depart} note={<span data-note-source="">{d.note}</span>} fermer={() => setOuvert(false)}
            envoyer={async (saisie) => {
              const r = await creer({ source: { type: 'note', noteId: d.source.noteId, projetId: d.source.projetId }, saisie });
              if (!r.error) setRangee(true);
              return r;
            }} />
        </div>
      </DialogueSpatial>
    </>
  );
}

/**
 * Boucler la preuve · le résultat du lot conclu qui la teste (chiffre clé, lien
 * vers le lot) et sa provenance (lien vers la source) · deux lignes sous la
 * ligne de la carte, absentes quand la carte n'en porte pas.
 */
function ResultatEtProvenance({ h }: { h: CarteHypothese }) {
  return (
    <>
      {h.resultat && (
        <span data-resultat-hypothese={h.resultat.statut} style={{ display: 'grid', gap: 4, fontSize: '11.5px' }}>
          <span className="muted">Lot #{h.resultat.lot.numero} · {h.resultat.libelle} · {h.resultat.chiffre}</span>
          <Lien className="btn sm" href={h.resultat.lot.href} style={{ justifySelf: 'start', minHeight: 44 }}>Voir le lot #{h.resultat.lot.numero}</Lien>
        </span>
      )}
      {h.provenance && (
        <span data-provenance-hypothese="" style={{ display: 'grid', gap: 4, fontSize: '11.5px' }}>
          <span className="faint">Provenance · {h.provenance.libelle}</span>
          {h.provenance.href && h.provenance.lien && <Lien className="btn sm" href={h.provenance.href} style={{ justifySelf: 'start', minHeight: 44 }}>{h.provenance.lien}</Lien>}
        </span>
      )}
    </>
  );
}

/** Le geste par carte · son nom dit QUELLE hypothèse (il commence par le mot affiché). */
function DemanderJarvis({ carte }: { carte: CarteHypothese }) {
  const href = lienJarvisCarteHypothese(carte);
  if (!href) return null;
  const extrait = carte.texte.length > 60 ? `${carte.texte.slice(0, 59)}…` : carte.texte;
  return (
    <Lien className="btn sm" href={href} style={{ justifySelf: 'start' }} data-demander-jarvis="hypothese" aria-label={`Demander à Jarvis · ${extrait}`}
      title="Ouvre Jarvis avec cette hypothèse jointe · la question est préparée, l’envoi reste à toi"><Ic n="spark" />Demander à Jarvis</Lien>
  );
}

export function Hypotheses(p: PropsHypotheses) {
  const [cat, setCat] = useState('tous');
  const cats = categoriesHypotheses(p.cartes);
  const liste = p.cartes.filter((c) => cat === 'tous' || c.categorie === cat);
  return (
    <Vue>
      <EnTete titre="Hypothèses" sous="Une phrase vérifiable par test : ce qu’on change, ce qu’on attend, pourquoi" />
      <SousNav items={p.sousNav} actif="/adsmap/hypotheses" />
      <div className="toolbar">
        <div className="pcats" style={{ margin: 0 }}>
          {cats.map((c) => <button type="button" className="chip" key={c.cle} aria-pressed={cat === c.cle} onClick={() => setCat(c.cle)}>{c.libelle} · {c.n}</button>)}
        </div>
        {p.jarvis && <Lien className="btn sm" href={LIEN_JARVIS_PAGE} style={{ marginLeft: 'auto' }} data-demander-jarvis="resultats"><Ic n="spark" />Suggérer avec Jarvis</Lien>}
        {p.creer
          ? (
            <BoutonHypothese className="btn sm pri" style={p.jarvis ? undefined : { marginLeft: 'auto' }} titre="Nouvelle hypothèse"
              depart={{ parties: PARTIES_VIDES, variable: null }} envoyer={(saisie) => p.creer!({ source: { type: 'libre' }, saisie })}
              note="Une phrase vérifiable · elle se range dans « À formuler », et s’y complète tant qu’elle est en brouillon.">
              <Ic n="plus" />Nouvelle hypothèse
            </BoutonHypothese>
          )
          : <Lien className="btn sm pri" href="/adsmap/suites" style={p.jarvis ? undefined : { marginLeft: 'auto' }}><Ic n="plus" />Nouvelle hypothèse</Lien>}
      </div>
      {p.depuisNote && 'refus' in p.depuisNote && <p className="faint" role="status" data-hypothese-note-refus="" style={{ fontSize: '12px', margin: '8px 0 0' }}>{p.depuisNote.refus}</p>}
      {p.depuisNote && 'depart' in p.depuisNote && p.creer && <HypotheseDepuisNote d={p.depuisNote} creer={p.creer} />}
      <div className="board4">
        {COLONNES_HYPOTHESES.map((col) => {
          const items = liste.filter((c) => c.colonne === col.cle);
          return (
            <div key={col.cle}>
              <div className="colh">{col.titre}<span className="n">{items.length}</span></div>
              {items.map((h) => (
                <div className="hcard" key={h.cle}>
                  <div className="kc"><span className="pill c">{h.categorie}</span><Priorite n={h.priorite} /></div>
                  <p><Hypothese texte={h.texte} /></p>
                  <span className="faint" style={{ fontSize: '11.5px' }}>{h.meta}</span>
                  {(h.resultat || h.provenance) && <ResultatEtProvenance h={h} />}
                  {h.conclusion
                    ? <span className={`pill ${h.conclusion.classe}`} style={{ justifySelf: 'start' }}><Ic n={h.conclusion.icone} />{h.conclusion.libelle}</span>
                    : h.edition && p.completer
                      ? (
                        <BoutonHypothese className="btn sm" style={{ justifySelf: 'start' }} titre={h.edition.libelle}
                          depart={{ parties: h.edition.parties, variable: (h.edition.variable as TestedVariable | null) ?? null }} estimation={h.edition.estimation}
                          envoyer={(saisie) => p.completer!({ adId: h.edition!.adId, saisie })}
                          enregistrer="Enregistrer" reussite="Hypothèse mise à jour">
                          {h.edition.libelle}
                        </BoutonHypothese>
                      )
                      : h.action && <Lien className="btn sm" href={h.action.href} style={{ justifySelf: 'start' }}>{h.action.libelle}</Lien>}
                  {p.jarvis && p.jarvisCartes && <DemanderJarvis carte={h} />}
                </div>
              ))}
              {items.length === 0 && <p className="faint" style={{ fontSize: '12.5px' }}>–</p>}
            </div>
          );
        })}
      </div>
      {p.bilan && <BilanProvenances p={p.bilan} />}
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 8 }}>{p.note}</p>
    </Vue>
  );
}
