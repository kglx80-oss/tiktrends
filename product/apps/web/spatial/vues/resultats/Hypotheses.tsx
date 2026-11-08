'use client';

import { useState } from 'react';
import { COLONNES_HYPOTHESES, PARTIES_VIDES, categoriesHypotheses, lienJarvisCarteHypothese, lienJarvisContexte, type CarteHypothese, type SaisieHypotheseLibre, type TestedVariable } from '@tiktrends/core';
import type { ResultatHypothese, SourceHypothese } from '../../../app/actions/adsmap-hypotheses';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { Hypothese, Priorite, type SousNavResultats } from './communs';
import { BoutonHypothese } from './hypothese-client';

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
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 8 }}>{p.note}</p>
    </Vue>
  );
}
