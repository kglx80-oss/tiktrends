'use client';

import { useState, type CSSProperties } from 'react';
import {
  changementStyleManuel, demandeDirectionDepuisBrief, OBJECTIF_MAX,
  type BriefCanonique,
} from '@tiktrends/core';
import { Icon } from '../../Icon';
import { BlocPropositions, btnAction, btnActionGhost } from './BlocPropositions';
import type { CyclePropositionsBrief } from './usePropositionsBrief';

/**
 * Étape DIRECTION de l'assistant V5, branchée sur le VRAI cycle de propositions.
 *
 *  · la direction courante est lue dans le brief (intention de style, angle,
 *    concept) · pas de mise en scène fabriquée ;
 *  · « Écrire l'intention de style » crée une proposition manuelle (gratuite)
 *    sur `/brief/styleIntent` ;
 *  · « Autre direction » appelle Jarvis (`proposerBrief`, payant, annoncé) ;
 *  · « Valider la direction » adopte une proposition `proposed` relue
 *    (`appliquerProposition` · transition `proposed → approved`). La garantie
 *    « seul un état relu s'applique » vit au serveur · on la RÉUTILISE.
 */

const note: CSSProperties = { fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };
const titreEtape: CSSProperties = { margin: '2px 0 0', fontSize: 19, fontWeight: 500, color: 'var(--ink)' };
const sectionLbl: CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', margin: 0 };
const champ: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 16, lineHeight: 1.5, resize: 'vertical' };

function Resume({ cle, valeur }: { cle: string; valeur: string | null | undefined }) {
  const rempli = typeof valeur === 'string' && valeur.trim().length > 0;
  return (
    <div data-resume={cle} style={{ display: 'grid', gap: 2 }}>
      <small style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{cle}</small>
      <span style={{ fontSize: 13.5, color: rempli ? 'var(--ink)' : 'var(--muted)', overflowWrap: 'anywhere' }}>{rempli ? valeur!.trim() : 'à définir'}</span>
    </div>
  );
}

export function EtapeDirection({ brief, cycle, onApplied }: {
  brief: BriefCanonique;
  cycle: CyclePropositionsBrief;
  onApplied: () => void;
}) {
  const [style, setStyle] = useState(brief.styleIntent ?? '');
  const jarvis = cycle.liste?.ok ? cycle.liste.jarvis : null;
  const peutProposer = cycle.liste?.ok ? cycle.liste.peutProposer : false;

  return (
    <div data-zone="assistant-direction" style={{ display: 'grid', gap: 16 }}>
      <div>
        <p style={{ ...note, fontSize: 12 }}>Étape 3 sur 5 · La direction</p>
        <h2 style={titreEtape}>La direction</h2>
        <p style={note}>Une proposition à partir de l’angle retenu · modifie ce que tu veux, puis valide. « Valider la direction » n’applique qu’une proposition relue · rien n’est généré ni débité.</p>
      </div>

      <section aria-label="Direction actuelle" style={{ display: 'grid', gap: 8 }}>
        <span style={sectionLbl}>Direction actuelle · d’après le brief</span>
        <div data-champ="resume-direction" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
          <Resume cle="Angle" valeur={brief.angle} />
          <Resume cle="Concept" valeur={brief.concept} />
          <Resume cle="Intention de style" valeur={brief.styleIntent} />
        </div>
      </section>

      <section aria-label="Écrire l’intention de style" style={{ display: 'grid', gap: 8 }}>
        <span style={sectionLbl}>Écrire l’intention de style</span>
        <textarea data-champ="style-libre" value={style} maxLength={OBJECTIF_MAX} rows={3}
          onChange={(e) => setStyle(e.target.value)} placeholder="L’ambiance visuelle · lumière, palette, matière, cadrage" style={champ} />
        <div>
          <button type="button" data-bouton="ecrire-style" disabled={!peutProposer || !style.trim() || cycle.occupe === 'manuel'}
            onClick={() => cycle.ecrireManuel(changementStyleManuel(style), 'Intention de style écrite à la main · direction')}
            style={{ ...btnActionGhost, opacity: (!peutProposer || !style.trim() || cycle.occupe === 'manuel') ? 0.55 : 1 }}>
            {cycle.occupe === 'manuel' ? 'Enregistrement…' : 'Enregistrer l’intention de style'}
          </button>
        </div>
      </section>

      <section aria-label="Autre direction" style={{ display: 'grid', gap: 8 }}>
        <span style={sectionLbl}>Autre direction · Jarvis</span>
        <p style={note}>{jarvis?.disponible ? jarvis.mentionCout : (jarvis?.raison || 'Jarvis indisponible ici · utilise « Écrire l’intention de style ».')}</p>
        <div>
          <button type="button" data-bouton="autre-direction" disabled={!peutProposer || !jarvis?.disponible || cycle.occupe === 'demande'}
            onClick={() => cycle.demanderJarvis(demandeDirectionDepuisBrief(brief))}
            style={{ ...btnAction, opacity: (!peutProposer || !jarvis?.disponible || cycle.occupe === 'demande') ? 0.55 : 1 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="spark" size={14} />{cycle.occupe === 'demande' ? 'Jarvis réfléchit…' : 'Proposer une autre direction'}</span>
          </button>
        </div>
      </section>

      <section aria-label="Valider la direction" style={{ display: 'grid', gap: 8 }}>
        <span style={sectionLbl}>Valider la direction</span>
        <p style={note}>Adopter une proposition l’écrit dans le brief · elle devient la direction courante. L’ancienne reste dans l’historique.</p>
        <BlocPropositions cycle={cycle} onApplied={onApplied} />
      </section>
    </div>
  );
}
