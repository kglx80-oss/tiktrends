'use client';

import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from 'react';
import {
  changementStyleManuel, demandeDirectionDepuisBrief, OBJECTIF_MAX,
  ALLOWED_PATHS_BRIEF, ligneTexte, lireLigneTexte, type ChangementPatch, type BriefCanonique,
} from '@tiktrends/core';
import { creerPropositionManuelle, appliquerProposition, inspecterProposition } from '../../../app/actions/studios/propositions';
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
export interface EnregistrementDirection { enregistrer: () => Promise<boolean>; peutFermer: () => boolean }

export function EtapeDirection({ brief, cycle, onApplied, apercuProduitUrl, enregistrementRef, projectId, baseVersionId, onRelire }: {
  onRelire?: () => Promise<boolean>;
  enregistrementRef?: Ref<EnregistrementDirection>;
  projectId?: string;
  baseVersionId?: string;
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
  const [sauvegarde, setSauvegarde] = useState(false);
  const [erreurSauvegarde, setErreurSauvegarde] = useState('');
  const verrouSauvegarde = useRef(false);
  const sauvegardeIncertaine = useRef(false);
  const operation = useRef<{base:string;signature:string;propositionId?:string;appliquee:boolean} | null>(null);
  const [lectureNecessaire,setLectureNecessaire] = useState(false);
  useEffect(() => {
    if (operation.current?.appliquee && operation.current.base !== baseVersionId) {
      operation.current=null;setLectureNecessaire(false);sauvegardeIncertaine.current=false;
    }
  },[baseVersionId]);
  async function relireEnregistrement() {
    if (verrouSauvegarde.current || !operation.current) return;
    verrouSauvegarde.current=true;setSauvegarde(true);
    try {
      if (!operation.current.appliquee) {
        if (!operation.current.propositionId) {
          await cycle.recharger();
          setErreurSauvegarde('La création de la proposition reste non confirmée. Aucune application n’a été demandée. Consulte les propositions du projet ou annule tes modifications pour fermer ; tes saisies sont conservées.');
          return;
        }
        const r=await inspecterProposition({proposalId:operation.current.propositionId});
        if(!r.ok){setErreurSauvegarde(r.message);return;}
        if(r.proposition.etat==='approved' && r.proposition.versionAppliquee) operation.current.appliquee=true;
        else if(r.proposition.etat==='proposed') {
          sauvegardeIncertaine.current=false;
          setErreurSauvegarde('Proposition retrouvée, pas encore appliquée. Valide la direction pour reprendre cette même proposition, sans en recréer.');return;
        } else {sauvegardeIncertaine.current=false;setErreurSauvegarde('Cette proposition ne peut plus être appliquée. Tes saisies restent affichées ; annule tes modifications pour repartir du brief.');return;}
      }
      sauvegardeIncertaine.current=false;setLectureNecessaire(true);
      if(await onRelire?.())setErreurSauvegarde('Direction enregistrée et relue. Tu peux continuer.');
      else setErreurSauvegarde('Direction enregistrée, mais relecture indisponible. Réessaie la relecture ; aucune nouvelle écriture ne sera lancée.');
    } catch {setErreurSauvegarde('Relecture indisponible. Tes saisies restent affichées. Réessaie la relecture sans relancer l’enregistrement.');}
    finally{verrouSauvegarde.current=false;setSauvegarde(false);}
  }
  const modifiee = concept !== (brief.concept ?? '') || style !== (brief.styleIntent ?? '') || accroche !== accrocheRelue || cta !== ctaRelu;
  useImperativeHandle(enregistrementRef, () => ({ peutFermer: () => {
    if (!modifiee && !verrouSauvegarde.current && !cycle.occupe && !sauvegardeIncertaine.current) return true;
    setErreurSauvegarde('Valide la direction ou annule tes modifications avant de fermer. Une opération non confirmée doit être vérifiée dans le projet.');
    return false;
  }, enregistrer: async () => {
    if (verrouSauvegarde.current || cycle.occupe || sauvegardeIncertaine.current) {
      setErreurSauvegarde('Une opération est en cours ou non confirmée. Vérifie son état avant de quitter la direction.');
      return false;
    }
    // Once applied, subsequent navigation retries only reread the project.
    if(operation.current?.appliquee)return true;
    const changes: ChangementPatch[] = [];
    if (concept !== (brief.concept ?? '')) changes.push({op:typeof brief.concept === 'string' ? 'replace' : 'add',path:'/brief/concept',newValue:concept.trim().slice(0,OBJECTIF_MAX),reason:'Concept validé à la main'});
    if (style !== (brief.styleIntent ?? '')) changes.push(changementStyleManuel(style));
    // Accroche et CTA partagent le tableau texts : appliquer les deux dans une
    // seule valeur pour qu'aucun champ n'écrase l'autre.
    if (accroche !== accrocheRelue || cta !== ctaRelu) {
      const texts = [...brief.texts];
      for (const [type, texte, index, original] of [
        ['hook', accroche, indexAccroche, accrocheRelue], ['cta', cta, indexCta, ctaRelu],
      ] as const) {
        if (texte === original) continue;
        const ancien = lignes[index];
        const valeur = ligneTexte({type,langue:ancien?.langue || 'fr',texte:texte.trim().slice(0,OBJECTIF_MAX),sources:ancien?.sources ?? []});
        if (index >= 0) texts[index] = valeur; else texts.push(valeur);
      }
      changes.push({op:'replace',path:'/brief/texts',newValue:texts,reason:'Accroche et appel à l’action validés à la main'});
    }
    if (!changes.length) return true;
    if (!peutProposer || !projectId || !baseVersionId) { setErreurSauvegarde('Tu ne peux pas enregistrer ces modifications avec tes droits actuels. Tes saisies restent affichées.'); return false; }
    verrouSauvegarde.current = true; setSauvegarde(true); setErreurSauvegarde('');
    try {
      const signature=JSON.stringify(changes);
      if(operation.current && (operation.current.base!==baseVersionId || operation.current.signature!==signature)) {
        setErreurSauvegarde('Une proposition précédente doit être vérifiée ou annulée avant de modifier cette direction.');return false;
      }
      operation.current ??= {base:baseVersionId,signature,appliquee:false};
      if(!operation.current.propositionId) {
        const cree = await creerPropositionManuelle({projectId,baseVersionId,cible:'brief',changes,explication:'Direction relue et validée par l’utilisateur · sans appel IA',allowedPaths:ALLOWED_PATHS_BRIEF});
        if (!cree.ok) {operation.current=null;setErreurSauvegarde(cree.message);return false;}
        if (cree.statut !== 'proposee') {operation.current=null;setErreurSauvegarde('La direction n’a pas pu être enregistrée. Tes saisies restent affichées.');return false;}
        operation.current.propositionId=cree.proposition.id;
      }
      const applique = await appliquerProposition({projectId,baseVersionId,proposalId:operation.current.propositionId});
      if (!applique.ok) {setErreurSauvegarde(applique.message);return false;}
      operation.current.appliquee=true;setLectureNecessaire(true);
      return true;
    } catch {
      sauvegardeIncertaine.current = true;
      setErreurSauvegarde('Enregistrement non confirmé. Tes saisies restent affichées ; vérifie la version du projet avant de recommencer.');
      return false;
    } finally {verrouSauvegarde.current = false;setSauvegarde(false);}
  }}));

  return (
    <div data-zone="assistant-direction" style={{ display: 'grid', gap: 16 }}>
      {erreurSauvegarde && <div><p role="alert">{erreurSauvegarde}</p>{modifiee && <button type="button" disabled={sauvegarde || !!cycle.occupe || !!operation.current?.appliquee || (sauvegardeIncertaine.current && !!operation.current?.propositionId)} onClick={() => {
        setConcept(brief.concept ?? '');setStyle(brief.styleIntent ?? '');setAccroche(accrocheRelue);setCta(ctaRelu);setErreurSauvegarde('');operation.current=null;sauvegardeIncertaine.current=false;setLectureNecessaire(false);
      }}>Annuler mes modifications</button>}</div>}
      {(lectureNecessaire || sauvegardeIncertaine.current) && <button type="button" disabled={sauvegarde} onClick={()=>void relireEnregistrement()}>Relire l’enregistrement · sans modification</button>}
      <fieldset disabled={sauvegarde || sauvegardeIncertaine.current || lectureNecessaire} style={{border:0,padding:0,margin:0,minWidth:0}}><div className={css.wzdir}>
        <section aria-label="Direction actuelle" className={css.wzmock}>
          <span className={css.eyebrow}>Aperçu de la direction</span>
          <div className={css.wzad} data-champ="resume-direction">
            <div className={css.wzadhead}><div><strong>{brief.concept || 'Votre concept'}</strong><small>Direction en préparation</small></div></div>
            {brief.texts.length > 0 && <p>{lignes[0]?.texte}</p>}
            {apercuProduitUrl ? <div className={`${css.wprev} ${css.wr45} ${css.big}`}><img src={apercuProduitUrl} alt="Photo produit sélectionnée · aperçu, pas une image générée" />{brief.texts[0] && <span className={css.wprevcap}>{lignes[0]?.texte}</span>}</div> : <div className={css.emptyPreview}>Aucun visuel généré pour cette direction</div>}
            <div className={css.wanglebody}><span data-resume="Angle">{brief.angle || 'Angle à définir'}</span><span data-resume="Concept">{brief.concept || 'Concept à définir'}</span><span data-resume="Intention de style">{brief.styleIntent || 'Style à définir'}</span></div>
          </div>
        </section>
        <div className={css.wzcol}>
          <section aria-label="Concept et accroche" style={{display:'grid',gap:12}}>
            <label className={css.field}><span className={css.wzlabel}>Concept</span><input data-champ="concept-libre" className={css.editor} style={{minHeight:44}} value={concept} maxLength={OBJECTIF_MAX} onChange={e=>setConcept(e.target.value)} /></label>
            {!enregistrementRef && <button type="button" data-bouton="ecrire-concept" style={btnActionGhost} disabled={!peutProposer || !concept.trim() || !!cycle.occupe} onClick={()=>cycle.ecrireManuel({op:typeof brief.concept === 'string' ? 'replace' : 'add',path:'/brief/concept',newValue:concept.trim().slice(0,OBJECTIF_MAX),reason:'Concept écrit à la main · direction'}, 'Concept écrit à la main · direction')}>Proposer ce concept</button>}
            <label className={css.field}><span className={css.wzlabel}>Accroche</span><input data-champ="accroche-libre" className={css.editor} style={{minHeight:44}} value={accroche} maxLength={OBJECTIF_MAX} onChange={e=>setAccroche(e.target.value)} /></label>
            {!enregistrementRef && <button type="button" data-bouton="ecrire-accroche" style={btnActionGhost} disabled={!peutProposer || !accroche.trim() || !!cycle.occupe} onClick={()=>cycle.ecrireManuel(texteManuel('hook',accroche),'Accroche écrite à la main · direction')}>Proposer cette accroche</button>}
          </section>
      <section aria-label="Écrire l’intention de style" style={{ display: 'grid', gap: 8 }}>
        <span className={css.wzlabel}>Écrire l’intention de style</span>
        <textarea data-champ="style-libre" value={style} maxLength={OBJECTIF_MAX} rows={3}
          onChange={(e) => setStyle(e.target.value)} placeholder="L’ambiance visuelle · lumière, palette, matière, cadrage" className={css.editor} />
        <div>
          {!enregistrementRef && <button type="button" data-bouton="ecrire-style" disabled={!peutProposer || !style.trim() || !!cycle.occupe}
            onClick={() => cycle.ecrireManuel(changementStyleManuel(style), 'Intention de style écrite à la main · direction')}
            style={{ ...btnActionGhost, opacity: (!peutProposer || !style.trim() || cycle.occupe === 'manuel') ? 0.55 : 1 }}>
            {cycle.occupe === 'manuel' ? 'Enregistrement…' : 'Enregistrer l’intention de style'}
          </button>}
        </div>
      </section>

      <section aria-label="Appel à l’action" style={{display:'grid',gap:12}}>
        <label className={css.field}><span className={css.wzlabel}>Appel à l’action</span><input data-champ="cta-libre" className={css.editor} style={{minHeight:44}} value={cta} maxLength={OBJECTIF_MAX} placeholder="Découvrir" onChange={e=>setCta(e.target.value)} /></label>
        {!enregistrementRef && <button type="button" data-bouton="ecrire-cta" style={btnActionGhost} disabled={!peutProposer || !cta.trim() || !!cycle.occupe} onClick={()=>cycle.ecrireManuel(texteManuel('cta',cta),'Appel à l’action écrit à la main · direction')}>Proposer cet appel à l’action</button>}
        <p style={note}>{enregistrementRef ? '« Valider la direction » enregistre tes modifications, sans appel IA.' : 'Ces modifications restent des propositions jusqu’à leur validation ci-dessous.'}</p>
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
      </div></fieldset>
    </div>
  );
}
