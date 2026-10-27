'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {useAppelPayant,MESSAGE_APPEL_PAYANT,resultatPayantIncertain} from '../appel-payant';
import type { ChangementPatch } from '@tiktrends/core';
import {
  listerPropositions, proposerBrief, creerPropositionManuelle, appliquerProposition, rejeterProposition,
} from '../../../app/actions/studios/propositions';
import { ALLOWED_PATHS_BRIEF } from '@tiktrends/core';
import type { ListePropositions, PropositionPresentee, ReponseProposition } from './types';

/**
 * Le cycle de propositions du BRIEF, partagé par les étapes stratégie et
 * direction de l'assistant V5. Il n'écrit JAMAIS lui-même : il demande une
 * proposition (Jarvis, payant et annoncé · ou à la main, gratuit), la liste,
 * et l'applique PAR UN GESTE EXPLICITE. La garantie « seul un état `proposed`
 * s'applique, et il devient `approved` » vit au serveur (`appliquerProposition`
 * → `deciderApplication`) · ce hook la RÉUTILISE, il ne la refait pas.
 *
 * FLOW-03 · une réponse qui arrive après un changement de projet est ignorée
 * (le projet actif a changé). Toute application crée une version · on relit.
 */

export type EtatListe = ReponseProposition<ListePropositions> | null;
export type RetourGeste = { type: 'ok' | 'err'; message: string; code?:string } | null;

export interface CyclePropositionsBrief {
  liste: EtatListe;
  version: { id: string; n: number };
  /** `'demande'`, `'manuel'`, ou l'identifiant de la proposition en cours de geste. */
  occupe: string | null;
  retour: RetourGeste;
  recharger: () => Promise<void>;
  demanderJarvis: (demande: string) => Promise<void>;
  ecrireManuel: (changement: ChangementPatch, explication: string) => Promise<void>;
  adopter: (p: PropositionPresentee, onApplied: () => void) => Promise<void>;
  rejeter: (p: PropositionPresentee) => Promise<void>;
}

export function usePropositionsBrief(projectId: string, versionInit: { id: string; n: number }): CyclePropositionsBrief {
  const appelPayant=useAppelPayant(projectId,'propositions-brief');
  const [liste, setListe] = useState<EtatListe>(null);
  const [version, setVersion] = useState(versionInit);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [retour, setRetour] = useState<RetourGeste>(null);
  const actif = useRef(projectId);
  actif.current = projectId;

  const recharger = useCallback(async () => {
    const pour = projectId;
    try {
      const r = await listerPropositions({ projectId: pour });
      if (actif.current !== pour) return;
      setListe(r);
      if (r.ok) setVersion(r.versionCourante);
    } catch {
      if (actif.current === pour) setRetour({ type: 'err', message: 'Hors ligne · impossible de lire les propositions. Réessaie.' });
    }
  }, [projectId]);

  useEffect(() => { void recharger(); }, [recharger]);

  const baseId = () => (liste?.ok ? liste.versionCourante.id : version.id);

  async function geste(etat: string, appel: () => Promise<RetourGeste>) {
    const tentative=etat==='demande'?appelPayant.commencer():null;if(etat==='demande'&&!tentative)return;
    const pour = projectId;
    setOccupe(etat);
    setRetour(null);
    try {
      const r = await appel();
      if(tentative)appelPayant.terminer(tentative,resultatPayantIncertain({ok:r?.type==='ok',code:r?.code}));
      if (actif.current !== pour) return;
      setRetour(r);
      await recharger();
    } catch {
      if(tentative)appelPayant.terminer(tentative,true);
      if (actif.current === pour) setRetour({ type: 'err', message: tentative?MESSAGE_APPEL_PAYANT:'Hors ligne · résultat non confirmé. Recharge le projet avant de recommencer.' });
    } finally {
      if (actif.current === pour) setOccupe(null);
    }
  }

  const demanderJarvis = (demande: string) => geste('demande', async () => {
    const r = await proposerBrief({ projectId, baseVersionId: baseId(), demande });
    if (!r.ok) return { type: 'err', message: r.message, code:r.code };
    if (r.statut === 'questions') return { type: 'err', message: `Jarvis a besoin d’une précision · ${r.questions.join(' · ')}. Rien n’a été enregistré.` };
    return { type: 'ok', message: 'Proposition reçue · relis-la, puis adopte-la si elle te convient. Rien n’est appliqué sans ton geste.' };
  });

  const ecrireManuel = (changement: ChangementPatch, explication: string) => geste('manuel', async () => {
    const r = await creerPropositionManuelle({ projectId, baseVersionId: versionInit.id, cible: 'brief', changes: [changement], explication, allowedPaths: ALLOWED_PATHS_BRIEF });
    return r.ok
      ? { type: 'ok', message: 'Proposition enregistrée · relis l’avant/après, puis adopte-la pour l’écrire dans le brief.' }
      : { type: 'err', message: r.message };
  });

  const adopter = (p: PropositionPresentee, onApplied: () => void) => geste(p.id, async () => {
    const r = await appliquerProposition({ proposalId: p.id, projectId, baseVersionId: baseId() });
    if (!r.ok) return { type: 'err', message: r.message, code:r.code };
    setVersion(r.version);
    onApplied();
    return { type: 'ok', message: r.deja ? `Déjà appliquée · version ${r.version.n}. Rien n’a été réécrit.` : `Appliquée · version ${r.version.n} créée. Rien n’a été généré ni débité.` };
  });

  const rejeter = (p: PropositionPresentee) => geste(p.id, async () => {
    const r = await rejeterProposition({ proposalId: p.id, projectId });
    return r.ok ? { type: 'ok', message: 'Proposition rejetée · rien n’a été modifié.' } : { type: 'err', message: r.message };
  });

  const listeAffichee=liste?.ok&&appelPayant.bloque?{...liste,jarvis:{...liste.jarvis,disponible:false,raison:MESSAGE_APPEL_PAYANT}}:liste;
  return { liste:listeAffichee, version, occupe, retour, recharger, demanderJarvis, ecrireManuel, adopter, rejeter };
}
