'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import {
  changementStyleManuel, demandeDirectionDepuisBrief, ligneTexte, lireLigneTexte,
  ALLOWED_PATHS_BRIEF, OBJECTIF_MAX,
  type BriefCanonique, type ChangementPatch,
} from '@tiktrends/core';
import { appliquerProposition, creerPropositionManuelle, inspecterProposition } from '../../../../app/actions/studios/propositions';
import type { CyclePropositionsBrief } from '../../../../lib/studios/propositions/use-propositions-brief';
import { Ic } from '../../../communs';
import { PropositionsBrief, RetourCycle } from './PropositionsBrief';

/**
 * Étape STYLE (la direction · porté de la V5 `EtapeDirection`), sur le VRAI
 * cycle de propositions :
 *  · la direction courante est LUE dans le brief (concept, accroche, intention
 *    de style, appel à l'action) · aucune mise en scène fabriquée ;
 *  · « Valider la direction » (barre d'action) écrit les champs modifiés par
 *    UNE proposition manuelle puis l'applique (gratuit, sans appel IA) · une
 *    réponse perdue n'est jamais rejouée à l'aveugle : on relit d'abord ;
 *  · « Proposer une autre direction » · Jarvis (`proposerBrief`), payant, coût
 *    affiché AVANT le bouton · relu puis appliqué par un geste.
 */

export interface EnregistrementDirection { enregistrer: () => Promise<boolean>; peutFermer: () => boolean }

export function Direction({ brief, cycle, onApplied, apercuProduitUrl, enregistrementRef, projectId, baseVersionId, onRelire }: {
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
  const indexHook = lignes.findIndex((t) => t.type === 'hook');
  const indexAccroche = indexHook >= 0 ? indexHook : lignes.findIndex((t) => t.type === 'libre');
  const indexCta = lignes.findIndex((t) => t.type === 'cta');
  const accrocheRelue = lignes[indexAccroche]?.texte ?? '';
  const ctaRelu = lignes[indexCta]?.texte ?? '';
  const [accroche, setAccroche] = useState(accrocheRelue);
  const [cta, setCta] = useState(ctaRelu);
  useEffect(() => { setConcept(brief.concept ?? ''); }, [brief.concept]);
  useEffect(() => { setStyle(brief.styleIntent); }, [brief.styleIntent]);
  useEffect(() => { setAccroche(accrocheRelue); }, [accrocheRelue]);
  useEffect(() => { setCta(ctaRelu); }, [ctaRelu]);

  const texteManuel = (type: 'hook' | 'cta', texte: string): ChangementPatch => {
    const index = type === 'hook' ? indexAccroche : indexCta;
    const original = lignes[index];
    const remplacement = ligneTexte({ type, langue: original?.langue || 'fr', texte: texte.trim().slice(0, OBJECTIF_MAX), sources: original?.sources ?? [] });
    const texts = [...brief.texts];
    if (index >= 0) texts[index] = remplacement; else texts.push(remplacement);
    return { op: 'replace', path: '/brief/texts', newValue: texts, reason: type === 'hook' ? 'Accroche modifiée à la main · direction' : 'Appel à l’action modifié à la main · direction' };
  };
  const jarvis = cycle.liste?.ok ? cycle.liste.jarvis : null;
  const peutProposer = cycle.liste?.ok ? cycle.liste.peutProposer : false;
  const [sauvegarde, setSauvegarde] = useState(false);
  const [erreurSauvegarde, setErreurSauvegarde] = useState('');
  const verrouSauvegarde = useRef(false);
  const sauvegardeIncertaine = useRef(false);
  const operation = useRef<{ base: string; signature: string; propositionId?: string; appliquee: boolean } | null>(null);
  const [lectureNecessaire, setLectureNecessaire] = useState(false);
  useEffect(() => {
    if (operation.current?.appliquee && operation.current.base !== baseVersionId) {
      operation.current = null; setLectureNecessaire(false); sauvegardeIncertaine.current = false;
    }
  }, [baseVersionId]);

  async function relireEnregistrement() {
    if (verrouSauvegarde.current || !operation.current) return;
    verrouSauvegarde.current = true; setSauvegarde(true);
    try {
      if (!operation.current.appliquee) {
        if (!operation.current.propositionId) {
          await cycle.recharger();
          setErreurSauvegarde('La création de la proposition reste non confirmée. Aucune application n’a été demandée. Consulte les propositions du projet ou annule tes modifications pour fermer ; tes saisies sont conservées.');
          return;
        }
        const r = await inspecterProposition({ proposalId: operation.current.propositionId });
        if (!r.ok) { setErreurSauvegarde(r.message); return; }
        if (r.proposition.etat === 'approved' && r.proposition.versionAppliquee) operation.current.appliquee = true;
        else if (r.proposition.etat === 'proposed') {
          sauvegardeIncertaine.current = false;
          setErreurSauvegarde('Proposition retrouvée, pas encore appliquée. Valide la direction pour reprendre cette même proposition, sans en recréer.'); return;
        } else { sauvegardeIncertaine.current = false; setErreurSauvegarde('Cette proposition ne peut plus être appliquée. Tes saisies restent affichées ; annule tes modifications pour repartir du brief.'); return; }
      }
      sauvegardeIncertaine.current = false; setLectureNecessaire(true);
      if (await onRelire?.()) setErreurSauvegarde('Direction enregistrée et relue. Tu peux continuer.');
      else setErreurSauvegarde('Direction enregistrée, mais relecture indisponible. Réessaie la relecture ; aucune nouvelle écriture ne sera lancée.');
    } catch { setErreurSauvegarde('Relecture indisponible. Tes saisies restent affichées. Réessaie la relecture sans relancer l’enregistrement.'); }
    finally { verrouSauvegarde.current = false; setSauvegarde(false); }
  }

  const modifiee = concept !== (brief.concept ?? '') || style !== (brief.styleIntent ?? '') || accroche !== accrocheRelue || cta !== ctaRelu;
  useImperativeHandle(enregistrementRef, () => ({
    peutFermer: () => {
      if (!modifiee && !verrouSauvegarde.current && !cycle.occupe && !sauvegardeIncertaine.current) return true;
      setErreurSauvegarde('Valide la direction ou annule tes modifications avant de quitter. Une opération non confirmée doit être vérifiée dans le projet.');
      return false;
    },
    enregistrer: async () => {
      if (verrouSauvegarde.current || cycle.occupe || sauvegardeIncertaine.current) {
        setErreurSauvegarde('Une opération est en cours ou non confirmée. Vérifie son état avant de quitter la direction.');
        return false;
      }
      // Une fois appliquée, une nouvelle tentative de navigation ne fait que relire le projet.
      if (operation.current?.appliquee) return true;
      const changes: ChangementPatch[] = [];
      if (concept !== (brief.concept ?? '')) changes.push({ op: typeof brief.concept === 'string' ? 'replace' : 'add', path: '/brief/concept', newValue: concept.trim().slice(0, OBJECTIF_MAX), reason: 'Concept validé à la main' });
      if (style !== (brief.styleIntent ?? '')) changes.push(changementStyleManuel(style));
      // Accroche et CTA partagent `texts` · une seule valeur, aucun champ n'écrase l'autre.
      if (accroche !== accrocheRelue || cta !== ctaRelu) {
        const texts = [...brief.texts];
        for (const [type, texte, index, original] of [['hook', accroche, indexAccroche, accrocheRelue], ['cta', cta, indexCta, ctaRelu]] as const) {
          if (texte === original) continue;
          const ancien = lignes[index];
          const valeur = ligneTexte({ type, langue: ancien?.langue || 'fr', texte: texte.trim().slice(0, OBJECTIF_MAX), sources: ancien?.sources ?? [] });
          if (index >= 0) texts[index] = valeur; else texts.push(valeur);
        }
        changes.push({ op: 'replace', path: '/brief/texts', newValue: texts, reason: 'Accroche et appel à l’action validés à la main' });
      }
      if (!changes.length) return true;
      if (!peutProposer || !projectId || !baseVersionId) { setErreurSauvegarde('Tu ne peux pas enregistrer ces modifications avec tes droits actuels. Tes saisies restent affichées.'); return false; }
      verrouSauvegarde.current = true; setSauvegarde(true); setErreurSauvegarde('');
      try {
        const signature = JSON.stringify(changes);
        if (operation.current && (operation.current.base !== baseVersionId || operation.current.signature !== signature)) {
          setErreurSauvegarde('Une proposition précédente doit être vérifiée ou annulée avant de modifier cette direction.'); return false;
        }
        operation.current ??= { base: baseVersionId, signature, appliquee: false };
        if (!operation.current.propositionId) {
          const cree = await creerPropositionManuelle({ projectId, baseVersionId, cible: 'brief', changes, explication: 'Direction relue et validée par l’utilisateur · sans appel IA', allowedPaths: ALLOWED_PATHS_BRIEF });
          if (!cree.ok) { operation.current = null; setErreurSauvegarde(cree.message); return false; }
          if (cree.statut !== 'proposee') { operation.current = null; setErreurSauvegarde('La direction n’a pas pu être enregistrée. Tes saisies restent affichées.'); return false; }
          operation.current.propositionId = cree.proposition.id;
        }
        const applique = await appliquerProposition({ projectId, baseVersionId, proposalId: operation.current.propositionId });
        if (!applique.ok) { setErreurSauvegarde(applique.message); return false; }
        operation.current.appliquee = true; setLectureNecessaire(true);
        return true;
      } catch {
        sauvegardeIncertaine.current = true;
        setErreurSauvegarde('Enregistrement non confirmé. Tes saisies restent affichées ; vérifie la version du projet avant de recommencer.');
        return false;
      } finally { verrouSauvegarde.current = false; setSauvegarde(false); }
    },
  }));

  const occupe = !!cycle.occupe;
  const bouton = (cle: string, libelle: string, valeur: string, changement: () => ChangementPatch, explication: string) => !enregistrementRef && (
    <div className="kc" style={{ marginTop: 8 }}>
      <button className="btn sm" type="button" data-bouton={cle} disabled={!peutProposer || !valeur.trim() || occupe} onClick={() => void cycle.ecrireManuel(changement(), explication)}>{libelle}</button>
    </div>
  );

  return (
    <div data-zone="assistant-direction" className="wz" style={{ maxWidth: 'none' }}>
      {erreurSauvegarde && (
        <div className="banner" role="alert">
          <Ic n="info" />
          <div style={{ display: 'grid', gap: 8, flex: 1 }}>
            <span>{erreurSauvegarde}</span>
            {modifiee && (
              <div className="kc">
                <button className="btn sm" type="button" disabled={sauvegarde || occupe || !!operation.current?.appliquee || (sauvegardeIncertaine.current && !!operation.current?.propositionId)} onClick={() => {
                  setConcept(brief.concept ?? ''); setStyle(brief.styleIntent ?? ''); setAccroche(accrocheRelue); setCta(ctaRelu); setErreurSauvegarde('');
                  operation.current = null; sauvegardeIncertaine.current = false; setLectureNecessaire(false);
                }}>Annuler mes modifications</button>
              </div>
            )}
          </div>
        </div>
      )}
      {(lectureNecessaire || sauvegardeIncertaine.current) && (
        <div className="kc"><button className="btn sm" type="button" disabled={sauvegarde} onClick={() => void relireEnregistrement()}>Relire l’enregistrement · sans modification</button></div>
      )}
      <fieldset disabled={sauvegarde || sauvegardeIncertaine.current || lectureNecessaire} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="grid2" style={{ alignItems: 'start' }}>
          <section className="tile" aria-label="Direction actuelle" style={{ display: 'grid', gap: 10 }}>
            <div className="lbl">Aperçu de la direction</div>
            <div data-champ="resume-direction" style={{ display: 'grid', gap: 10 }}>
              <strong style={{ fontSize: 14 }}>{brief.concept || 'Ton concept'}</strong>
              {apercuProduitUrl
                ? <div className="ad" style={{ maxWidth: 260 }}><div className="ph"><img src={apercuProduitUrl} alt="Photo produit sélectionnée · aperçu, pas une image générée" /></div>{lignes[0] && <div className="band">{lignes[0].texte}</div>}</div>
                : <p className="faint" style={{ fontSize: '12.5px' }}>Aucun visuel généré pour cette direction.</p>}
              <div className="kc">
                <span className="pill" data-resume="Angle" style={{ whiteSpace: 'normal' }}>{brief.angle || 'Angle à définir'}</span>
                <span className="pill" data-resume="Concept" style={{ whiteSpace: 'normal' }}>{brief.concept || 'Concept à définir'}</span>
                <span className="pill" data-resume="Intention de style" style={{ whiteSpace: 'normal' }}>{brief.styleIntent || 'Style à définir'}</span>
              </div>
            </div>
          </section>
          <div style={{ display: 'grid', gap: 18 }}>
            <label className="field">Concept
              <input data-champ="concept-libre" value={concept} maxLength={OBJECTIF_MAX} onChange={(e) => setConcept(e.target.value)} />
            </label>
            {bouton('ecrire-concept', 'Proposer ce concept', concept, () => ({ op: typeof brief.concept === 'string' ? 'replace' : 'add', path: '/brief/concept', newValue: concept.trim().slice(0, OBJECTIF_MAX), reason: 'Concept écrit à la main · direction' }), 'Concept écrit à la main · direction')}
            <label className="field">Accroche
              <input data-champ="accroche-libre" value={accroche} maxLength={OBJECTIF_MAX} onChange={(e) => setAccroche(e.target.value)} />
            </label>
            {bouton('ecrire-accroche', 'Proposer cette accroche', accroche, () => texteManuel('hook', accroche), 'Accroche écrite à la main · direction')}
            <label className="field">Intention de style
              <textarea className="ta" data-champ="style-libre" value={style} maxLength={OBJECTIF_MAX} rows={3} onChange={(e) => setStyle(e.target.value)} placeholder="L’ambiance visuelle · lumière, palette, matière, cadrage" />
            </label>
            {bouton('ecrire-style', cycle.occupe === 'manuel' ? 'Enregistrement…' : 'Enregistrer l’intention de style', style, () => changementStyleManuel(style), 'Intention de style écrite à la main · direction')}
            <label className="field">Appel à l’action
              <input data-champ="cta-libre" value={cta} maxLength={OBJECTIF_MAX} placeholder="Découvrir" onChange={(e) => setCta(e.target.value)} />
            </label>
            {bouton('ecrire-cta', 'Proposer cet appel à l’action', cta, () => texteManuel('cta', cta), 'Appel à l’action écrit à la main · direction')}
            <p className="faint" style={{ fontSize: '11.5px' }}>{enregistrementRef ? '« Valider la direction » enregistre tes modifications, sans appel IA, gratuit.' : 'Ces modifications restent des propositions jusqu’à leur validation ci-dessous.'}</p>
          </div>
        </div>

        <section aria-label="Autre direction" style={{ marginTop: 22 }}>
          <h2 style={{ marginBottom: 10 }}>Autre direction · Jarvis</h2>
          <p className="faint" style={{ fontSize: '11.5px' }} data-cout="direction">{jarvis?.disponible ? jarvis.mentionCout : (jarvis?.raison || 'Jarvis indisponible ici · écris l’intention de style toi-même.')}</p>
          <div className="kc" style={{ marginTop: 8 }}>
            <button className="btn sm" type="button" data-bouton="autre-direction" disabled={!peutProposer || !jarvis?.disponible || occupe} onClick={() => void cycle.demanderJarvis(demandeDirectionDepuisBrief(brief))}>
              <Ic n="spark" />{cycle.occupe === 'demande' ? 'Jarvis réfléchit…' : 'Proposer une autre direction'}
            </button>
          </div>
        </section>

        {cycle.liste?.ok && !cycle.liste.propositions.some((p) => p.cible === 'brief')
          ? cycle.retour && <div style={{ marginTop: 14 }}><RetourCycle retour={cycle.retour} /></div>
          : (
            <section aria-label="Valider la direction" style={{ marginTop: 22 }}>
              <h2 style={{ marginBottom: 10 }}>Propositions de direction</h2>
              <p className="muted" style={{ fontSize: '12.5px', marginBottom: 10 }}>Appliquer une proposition l’écrit dans le brief · elle devient la direction courante. L’ancienne reste dans l’historique.</p>
              <PropositionsBrief cycle={cycle} onApplied={onApplied} />
            </section>
          )}
      </fieldset>
    </div>
  );
}
