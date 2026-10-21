'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  changementStyleManuel, demandeDirectionDepuisBrief, OBJECTIF_MAX,
  ligneTexte, lireLigneTexte, type ChangementPatch, type BriefCanonique,
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
  const [concept, setConcept] = useState(brief.concept ?? '');
  const lignes = brief.texts.map(lireLigneTexte);
  const indexHook = lignes.findIndex(t => t.type === 'hook');
  const indexAccroche = indexHook >= 0 ? indexHook : lignes.findIndex(t => t.type === 'libre');
  const indexCta = lignes.findIndex(t => t.type === 'cta');
  const [accroche, setAccroche] = useState(lignes[indexAccroche]?.texte ?? '');
  const [cta, setCta] = useState(lignes[indexCta]?.texte ?? '');
  const accrocheRelue = lignes[indexAccroche]?.texte ?? '';
  const ctaRelu = lignes[indexCta]?.texte ?? '';
  useEffect(() => { setConcept(brief.concept ?? ''); }, [brief.concept]);
  useEffect(() => { setStyle(brief.styleIntent); }, [brief.styleIntent]);
  useEffect(() => { setAccroche(accrocheRelue); }, [accrocheRelue]);
  useEffect(() => { setCta(ctaRelu); }, [ctaRelu]);
  const texteManuel = (type: 'hook' | 'cta', texte: string): ChangementPatch => {
    const index = type === 'hook' ? indexAccroche : indexCta;
    const original = lignes[index];
    const remplacement = ligneTexte({type, langue: original?.langue || 'fr', texte: texte.trim().slice(0, OBJECTIF_MAX), sources: original?.sources ?? []});
    const texts = [...brief.texts];
    if (index >= 0) texts[index] = remplacement; else texts.push(remplacement);
    return {op:'replace', path:'/brief/texts', newValue:texts, reason:type === 'hook' ? 'Accroche modifiée à la main · direction' : 'Appel à l’action modifié à la main · direction'};
  };
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
          <section aria-label="Concept et accroche" style={{display:'grid',gap:12}}>
            <label className={css.field}><span className={css.wzlabel}>Concept</span><input data-champ="concept-libre" className={css.editor} style={{minHeight:44}} value={concept} maxLength={OBJECTIF_MAX} onChange={e=>setConcept(e.target.value)} /></label>
            <button type="button" data-bouton="ecrire-concept" style={btnActionGhost} disabled={!peutProposer || !concept.trim() || !!cycle.occupe} onClick={()=>cycle.ecrireManuel({op:typeof brief.concept === 'string' ? 'replace' : 'add',path:'/brief/concept',newValue:concept.trim().slice(0,OBJECTIF_MAX),reason:'Concept écrit à la main · direction'}, 'Concept écrit à la main · direction')}>Proposer ce concept</button>
            <label className={css.field}><span className={css.wzlabel}>Accroche</span><input data-champ="accroche-libre" className={css.editor} style={{minHeight:44}} value={accroche} maxLength={OBJECTIF_MAX} onChange={e=>setAccroche(e.target.value)} /></label>
            <button type="button" data-bouton="ecrire-accroche" style={btnActionGhost} disabled={!peutProposer || !accroche.trim() || !!cycle.occupe} onClick={()=>cycle.ecrireManuel(texteManuel('hook',accroche),'Accroche écrite à la main · direction')}>Proposer cette accroche</button>
          </section>
      <section aria-label="Écrire l’intention de style" style={{ display: 'grid', gap: 8 }}>
        <span className={css.wzlabel}>Écrire l’intention de style</span>
        <textarea data-champ="style-libre" value={style} maxLength={OBJECTIF_MAX} rows={3}
          onChange={(e) => setStyle(e.target.value)} placeholder="L’ambiance visuelle · lumière, palette, matière, cadrage" className={css.editor} />
        <div>
          <button type="button" data-bouton="ecrire-style" disabled={!peutProposer || !style.trim() || !!cycle.occupe}
            onClick={() => cycle.ecrireManuel(changementStyleManuel(style), 'Intention de style écrite à la main · direction')}
            style={{ ...btnActionGhost, opacity: (!peutProposer || !style.trim() || cycle.occupe === 'manuel') ? 0.55 : 1 }}>
            {cycle.occupe === 'manuel' ? 'Enregistrement…' : 'Enregistrer l’intention de style'}
          </button>
        </div>
      </section>

      <section aria-label="Appel à l’action" style={{display:'grid',gap:12}}>
        <label className={css.field}><span className={css.wzlabel}>Appel à l’action</span><input data-champ="cta-libre" className={css.editor} style={{minHeight:44}} value={cta} maxLength={OBJECTIF_MAX} placeholder="Découvrir" onChange={e=>setCta(e.target.value)} /></label>
        <button type="button" data-bouton="ecrire-cta" style={btnActionGhost} disabled={!peutProposer || !cta.trim() || !!cycle.occupe} onClick={()=>cycle.ecrireManuel(texteManuel('cta',cta),'Appel à l’action écrit à la main · direction')}>Proposer cet appel à l’action</button>
        <p style={note}>Ces modifications restent des propositions jusqu’à leur validation ci-dessous.</p>
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

      {cycle.liste?.ok && !cycle.liste.propositions.some(p => p.cible === 'brief')
        ? cycle.retour && <p role={cycle.retour.type === 'err' ? 'alert' : 'status'}>{cycle.retour.message}</p>
        : <section aria-label="Valider la direction" style={{ display: 'grid', gap: 8 }}>
        <span className={css.wzlabel}>Valider la direction</span>
        <p style={note}>Adopter une proposition l’écrit dans le brief · elle devient la direction courante. L’ancienne reste dans l’historique.</p>
        <BlocPropositions cycle={cycle} onApplied={onApplied} />
      </section>}
        </div>
      </div>
    </div>
  );
}
