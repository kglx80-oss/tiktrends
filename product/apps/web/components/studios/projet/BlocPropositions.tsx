'use client';

import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { CarteProposition } from '../propositions/CarteProposition';
import type { CyclePropositionsBrief } from './usePropositionsBrief';

/**
 * La liste des propositions du BRIEF à trancher, partagée par stratégie et
 * direction. Elle RELIT (avant/après, plan d'impact, cf. `CarteProposition`) et
 * offre les deux gestes (adopter, rejeter) seulement sur un état `proposed`. Une
 * proposition n'est JAMAIS appliquée sans ce geste · le serveur revérifie.
 */

const note: CSSProperties = { fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };

export function BlocPropositions({ cycle, onApplied }: { cycle: CyclePropositionsBrief; onApplied: () => void }) {
  const { liste, occupe, retour } = cycle;
  const propositions = liste?.ok ? liste.propositions.filter((p) => p.cible === 'brief') : [];
  const peutAgir = !!(liste?.ok && liste.peutProposer);
  return (
    <div data-zone="propositions-brief" style={{ display: 'grid', gap: 12 }}>
      {retour && (
        <p role={retour.type === 'err' ? 'alert' : 'status'} data-retour={retour.type}
          style={{ margin: 0, fontSize: 13.5, color: retour.type === 'err' ? 'var(--err-text)' : 'var(--ink)' }}>
          {retour.message}
        </p>
      )}

      {liste === null && <p style={note}>Lecture des propositions…</p>}
      {liste && !liste.ok && <p role="alert" style={{ ...note, color: 'var(--err-text)' }}>{liste.message}</p>}
      {liste?.ok && propositions.length === 0 && (
        <p data-etat="aucune-proposition" style={note}>Aucune proposition à trancher pour l’instant · écris ou demande une suggestion ci-dessus.</p>
      )}

      {propositions.map((p) => (
        <CarteProposition
          key={p.id}
          p={p}
          versionCouranteN={cycle.version.n}
          peutAgir={peutAgir}
          enCours={occupe === p.id ? 'appliquer' : null}
          onAppliquer={(x) => cycle.adopter(x, onApplied)}
          onRejeter={cycle.rejeter}
        />
      ))}
    </div>
  );
}

/** Un petit bouton d'action réutilisé par les contrôles « écrire » / « demander ». */
export const btnAction: CSSProperties = {
  minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', borderRadius: 10, border: '1px solid var(--accent-strong)',
  background: 'var(--accent-strong)', color: 'var(--on-accent)', fontSize: 13.5, fontWeight: 650, cursor: 'pointer',
};
export const btnActionGhost: CSSProperties = {
  minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line-2)',
  background: 'var(--surface)', color: 'var(--ink)', fontSize: 13.5, fontWeight: 650, cursor: 'pointer',
};
