'use client';

import type { CSSProperties } from 'react';
import type { AccesHypothese, PropositionHypotheseTag } from '@tiktrends/core';
import { creerHypotheseAction } from '../../../app/actions/adsmap-hypotheses';
import { BoutonHypothese } from '../resultats/hypothese-client';
import { Ic } from '../../communs';

/**
 * Lot 6 bis V5 · « Formuler une hypothèse » depuis un tag RÉCURRENT (`/tags`,
 * Sauvegardes filtrées par tag). La proposition vient du noyau
 * (`propositionHypotheseTag`, seuil mesuré) · sous le seuil, la page ne passe
 * rien et ce bouton n'existe pas.
 *
 * Il ouvre le formulaire d'hypothèse EXISTANT (`BoutonHypothese`) pré-rempli
 * (le trait, le constat, la variable quand le tag la nomme) avec les
 * sauvegardes citées comme preuves · rien n'est écrit avant « Ranger dans
 * « À formuler » » · le serveur relit le tag et ses sauvegardes dans la
 * marque active et rejoue la règle (`creerHypotheseAction`, source « tag »).
 * Fermé (offre, rôle, pas de marque active), sa raison est écrite à côté.
 */
export function FormulerHypotheseTag({ proposition: p, acces, style }: { proposition: PropositionHypotheseTag; acces: AccesHypothese; style?: CSSProperties }) {
  const reste = p.total - p.preuves.length;
  const preuves = `${p.preuves.map((x) => x.annonceur).join(', ')}${reste > 0 ? ` et ${reste} autre${reste > 1 ? 's' : ''}` : ''}`;
  return (
    <span data-hypothese-tag={p.tag.cle} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', ...style }}>
      <BoutonHypothese className="btn sm" style={{ minHeight: 44 }} titre={`Formuler une hypothèse · ${p.tag.nom}`} depart={p.depart}
        raison={acces.raison}
        note={<><span>{p.note}</span><br /><span data-preuves-hypothese="">{`Preuves · ${p.total} sauvegarde${p.total > 1 ? 's' : ''} · ${preuves}`}</span></>}
        envoyer={acces.ouvert ? (saisie) => creerHypotheseAction({ source: { type: 'tag', cle: p.tag.cle }, saisie }) : null}>
        <Ic n="bulb" />Formuler une hypothèse
      </BoutonHypothese>
      {!acces.ouvert && <small className="faint" data-raison-hypothese-tag="" style={{ fontSize: 11.5 }}>{acces.raison}</small>}
    </span>
  );
}
