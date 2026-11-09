'use client';

import { useId } from 'react';
import type { GestesPersona } from '@tiktrends/core';
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
 */
export function GestesPersona({ g }: { g: GestesPersona }) {
  const id = useId();
  const prenom = g.nom.split(',')[0]!.trim();
  // Fermé mais FOCALISABLE · la raison est écrite à côté et lue par le lecteur d'écran.
  const ferme = boutonAction({ ferme: true, focalisable: 'tout' });
  return (
    <div data-gestes-persona={g.personaId} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
      {g.iterer.href
        ? <Lien className="btn sm" href={g.iterer.href} data-geste-persona-lot="iterer" style={{ minHeight: 44 }}><Ic n="loop" />Itérer sur ce persona</Lien>
        : (
          <>
            <button type="button" className="btn sm" data-geste-persona-lot="iterer" aria-describedby={`${id}-iterer`} {...ferme} style={{ ...ferme.style, minHeight: 44 }}><Ic n="loop" />Itérer sur ce persona</button>
            <small className="faint" id={`${id}-iterer`} style={{ fontSize: '11.5px' }}>{g.iterer.raison}</small>
          </>
        )}
      <span data-geste-persona-lot="hypothese" style={{ display: 'contents' }}>
        <BoutonHypothese className="btn sm" style={{ minHeight: 44 }} titre={`Créer une hypothèse · ${prenom}`} depart={g.hypothese.depart} note={g.hypothese.note}
          envoyer={(saisie) => creerHypotheseAction({ source: { type: 'persona', personaId: g.personaId }, saisie })}>
          <Ic n="bulb" />Créer une hypothèse
        </BoutonHypothese>
      </span>
    </div>
  );
}
