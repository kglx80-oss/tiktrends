'use client';

import { useId } from 'react';
import { versGestesLecture, type GestesLecture, type GestesPersona } from '@tiktrends/core';
import { creerHypotheseAction } from '../../../app/actions/adsmap-hypotheses';
import { Ic, Lien } from '../../communs';
import { BoutonHypothese } from './hypothese-client';
import { boutonAction } from '../projet/action-serveur';

/**
 * Boucler la preuve · VB P06 · les gestes d'un persona qui SE DÉTACHE dans la
 * lecture par persona d'un lot (`gestesPersonaLot`, noyau) :
 *
 *  · « Itérer sur ce persona » · un lien vers l'écran Itérer EXISTANT (lot 2),
 *    sa gagnante présélectionnée (`?iter=`) · rien n'est créé avant le clic
 *    « Créer l'itération » de cet écran · sans gagnante dans le plan, le geste
 *    est fermé, sa raison écrite à côté ;
 *  · « Créer une hypothèse » · le formulaire EXISTANT (`BoutonHypothese`),
 *    pré-rempli (le persona cité, ses verdicts dans le « parce que ») · rien
 *    n'est écrit avant « Ranger dans « À formuler » » · le serveur relit le
 *    persona dans la marque active (`creerHypotheseAction`, source `persona`).
 *
 * « Dans les tests » (fiche persona, fiche offre), « Quelle offre » d'un lot et
 * la fiche d'un test · les MÊMES gestes, pour un persona ou une offre qui se
 * détache (`gestesLectureGroupe`, noyau) · une offre crée une hypothèse de
 * provenance « Offre », posée par le serveur seulement après avoir relu l'offre
 * dans la marque active (`creerHypotheseAction`, source `offre`).
 */
export function GestesPersona({ g }: { g: GestesPersona }) {
  return <GestesGroupe g={versGestesLecture(g)} />;
}

/** Les attributs du DOM · ceux du lot 9 pour un persona (inchangés), les mêmes, nommés pour une offre. */
const ATTRS = {
  persona: { bloc: 'data-gestes-persona', geste: 'data-geste-persona-lot' },
  offre: { bloc: 'data-gestes-offre', geste: 'data-geste-offre' },
} as const;

export function GestesGroupe({ g, raisonHypothese = null }: { g: GestesLecture; raisonHypothese?: string | null }) {
  const id = useId();
  const a = ATTRS[g.groupe];
  // Fermé mais FOCALISABLE · la raison est écrite à côté et lue par le lecteur d'écran.
  const ferme = boutonAction({ ferme: true, focalisable: 'tout' });
  const source = g.hypothese.source;
  return (
    <div {...{ [a.bloc]: g.id }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
      {g.iterer.href
        ? <Lien className="btn sm" href={g.iterer.href} {...{ [a.geste]: 'iterer' }} style={{ minHeight: 44 }}><Ic n="loop" />{g.libelles.iterer}</Lien>
        : (
          <>
            <button type="button" className="btn sm" {...{ [a.geste]: 'iterer' }} aria-describedby={`${id}-iterer`} {...ferme} style={{ ...ferme.style, minHeight: 44 }}><Ic n="loop" />{g.libelles.iterer}</button>
            <small className="faint" id={`${id}-iterer`} style={{ fontSize: '11.5px' }}>{g.iterer.raison}</small>
          </>
        )}
      <span {...{ [a.geste]: 'hypothese' }} style={{ display: 'contents' }}>
        <BoutonHypothese className="btn sm" style={{ minHeight: 44 }} titre={g.libelles.titre} depart={g.hypothese.depart} note={g.hypothese.note} raison={raisonHypothese}
          envoyer={raisonHypothese ? null : (saisie) => creerHypotheseAction({ source, saisie })}>
          <Ic n="bulb" />{g.libelles.hypothese}
        </BoutonHypothese>
        {raisonHypothese && <small className="faint" style={{ fontSize: '11.5px' }}>{raisonHypothese}</small>}
      </span>
    </div>
  );
}
