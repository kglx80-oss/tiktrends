'use client';

import { useState, type CSSProperties } from 'react';
import {
  changementStyleManuel, demandeDirectionDepuisBrief, OBJECTIF_MAX,
  type BriefCanonique,
} from '@tiktrends/core';
import css from './AssistantProjet.module.css';
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
export function EtapeDirection({ brief, cycle, onApplied, apercuProduitUrl }: {
  brief: BriefCanonique;
  cycle: CyclePropositionsBrief;
  onApplied: () => void;
  apercuProduitUrl?: string;
}) {
  const [style, setStyle] = useState(brief.styleIntent ?? '');
  const jarvis = cycle.liste?.ok ? cycle.liste.jarvis : null;
  const peutProposer = cycle.liste?.ok ? cycle.liste.peutProposer : false;

  return (
    <div data-zone="assistant-direction" style={{ display: 'grid', gap: 16 }}>
      <div className={css.wzdir}>
        <section aria-label="Direction actuelle" className={css.wzmock}>
          <span className={css.eyebrow}>Aperçu de la direction</span>
          <div className={css.wzad} data-champ="resume-direction">
            <div className={css.wzadhead}><div><strong>{brief.concept || 'Votre concept'}</strong><small>Direction en préparation</small></div></div>
            {brief.texts.length > 0 && <p>{brief.texts[0]}</p>}
            {apercuProduitUrl ? <div className={`${css.wprev} ${css.wr45} ${css.big}`}><img src={apercuProduitUrl} alt="Photo produit sélectionnée · aperçu, pas une image générée" />{brief.texts[0] && <span className={css.wprevcap}>{brief.texts[0]}</span>}</div> : <div className={css.emptyPreview}>Aucun visuel généré pour cette direction</div>}
            <div className={css.wanglebody}><span data-resume="Angle">{brief.angle || 'Angle à définir'}</span><span data-resume="Concept">{brief.concept || 'Concept à définir'}</span><span data-resume="Intention de style">{brief.styleIntent || 'Style à définir'}</span></div>
          </div>
        </section>
        <div className={css.wzcol}>
      <section aria-label="Écrire l’intention de style" style={{ display: 'grid', gap: 8 }}>
        <span className={css.wzlabel}>Écrire l’intention de style</span>
        <textarea data-champ="style-libre" value={style} maxLength={OBJECTIF_MAX} rows={3}
          onChange={(e) => setStyle(e.target.value)} placeholder="L’ambiance visuelle · lumière, palette, matière, cadrage" className={css.editor} />
        <div>
          <button type="button" data-bouton="ecrire-style" disabled={!peutProposer || !style.trim() || cycle.occupe === 'manuel'}
            onClick={() => cycle.ecrireManuel(changementStyleManuel(style), 'Intention de style écrite à la main · direction')}
            style={{ ...btnActionGhost, opacity: (!peutProposer || !style.trim() || cycle.occupe === 'manuel') ? 0.55 : 1 }}>
            {cycle.occupe === 'manuel' ? 'Enregistrement…' : 'Enregistrer l’intention de style'}
          </button>
        </div>
      </section>

      <section aria-label="Autre direction" style={{ display: 'grid', gap: 8 }}>
        <span className={css.wzlabel}>Autre direction · Jarvis</span>
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
        <span className={css.wzlabel}>Valider la direction</span>
        <p style={note}>Adopter une proposition l’écrit dans le brief · elle devient la direction courante. L’ancienne reste dans l’historique.</p>
        <BlocPropositions cycle={cycle} onApplied={onApplied} />
      </section>
        </div>
      </div>
    </div>
  );
}
