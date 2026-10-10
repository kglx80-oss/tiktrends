'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { appliquerOperationVideo as appliquerNoyau, impactVideo, messageHorsLigneStudio, ECHEC_RESEAU_STUDIO, type ErreurStudio, type OperationVideo } from '@tiktrends/core';
import type { VueVideo as DonneesVideo } from '../../../lib/studios/video/lecture';
import {
  appliquerOperationVideo, planifierStoryboard, compilerConsignePlan, retenirConsignePlan, demanderDevisKeyframe, approuverEtLancerKeyframe,
  demanderDevisClip, approuverEtLancerClip, assemblerVideoFinale,
} from '../../../app/actions/studios/video';
import { VueVideo, type ApercuGeste, type StoryboardPropose, type RetourGesteVideo } from './VueVideo';

/**
 * Le studio vidéo d'un projet (lot L6-A) · état servi par la page (lecture
 * serveur pure), relu après chaque geste (`router.refresh`) et toutes les 4 s
 * tant qu'un job d'image clé n'est pas terminé.
 *
 * Un geste de montage n'est JAMAIS envoyé directement : le noyau calcule
 * d'abord son impact sur le contenu affiché (ce qui sera refait, conservé,
 * rendu obsolète, les durées), l'écran le montre, puis « Enregistrer ce
 * changement » envoie l'opération ; le serveur la rejoue sur SA version.
 * La clé du clic « Approuver et lancer » est gardée par devis dans
 * `sessionStorage` : un double clic ou une reconnexion retrouve le même job.
 */

const RELECTURE_MS = 4_000;

/**
 * L8-B · gestes que « Réessayer » peut rejouer sans rien dépenser : enregistrer
 * une version, retenir une consigne, demander un devis (gratuit). Un appel texte
 * payant (storyboard, consigne) ne se rejoue jamais par ce bouton · son prix est
 * annoncé à côté de son propre bouton. « Lancer » garde sa clé de clic.
 */
export function gesteVideoReessayable(nom: string): boolean {
  return nom === 'confirmer' || nom.startsWith('retenir:') || nom.startsWith('devis:') || nom.startsWith('devis-clip:');
}

const messageErreur = (r: ErreurStudio): string => (r.violations?.length ? r.violations.map((v) => v.raison).join(' · ') : r.message);

export function cleDuClicVideo(quoteId: string): string {
  const k = `tt-studio-video-cle-${quoteId}`;
  try {
    const deja = window.sessionStorage.getItem(k);
    if (deja) return deja;
    const cle = `vid-${crypto.randomUUID()}`;
    window.sessionStorage.setItem(k, cle);
    return cle;
  } catch {
    return `vid-${quoteId}`;
  }
}

/** L'aperçu d'un geste · calcul pur du noyau sur le contenu affiché, rien n'est envoyé. */
export function apercuDuGeste(vue: DonneesVideo, operation: OperationVideo): ApercuGeste {
  const r = appliquerNoyau(vue.contenu, operation, { sortiesExistantes: vue.mediasValides });
  if (!r.ok) {
    const detail = r.violations.map((v) => v.raison).join(' · ');
    return { operation, libelle: 'changement refusé', impact: null, durees: null, signalements: [], refus: detail ? `${r.message} ${detail}` : r.message };
  }
  return { operation, libelle: r.libelle, impact: impactVideo(vue.contenu, r.contenu, { mediasExistants: vue.mediasValides }), durees: r.durees, signalements: r.signalements, refus: null };
}

export function EcranVideo({ vue }: { vue: DonneesVideo }) {
  const router = useRouter();
  const [apercu, setApercu] = useState<ApercuGeste | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardPropose | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [retour, setRetour] = useState<RetourGesteVideo | null>(null);
  const dernierGeste = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!vue.jobs.some((j) => !['completed', 'failed', 'cancelled'].includes(j.etat))) return;
    const t = setTimeout(() => router.refresh(), RELECTURE_MS);
    return () => clearTimeout(t);
  }, [vue, router]);

  async function agir(nom: string, f: () => Promise<{ ok: true } | ErreurStudio>, succes: (r: { ok: true }) => string, apres?: () => void) {
    setEnCours(nom);
    setRetour(null);
    const reessayable = gesteVideoReessayable(nom);
    dernierGeste.current = reessayable ? () => { void agir(nom, f, succes, apres); } : null;
    try {
      const r = await f();
      if (r.ok) { setRetour({ ok: true, texte: succes(r) }); apres?.(); router.refresh(); } else setRetour({ ok: false, code: r.code, reessayable, texte: `${messageErreur(r)}${r.traceId ? ` · identifiant support ${r.traceId}` : ''}` });
    } catch {
      setRetour({ ok: false, code: ECHEC_RESEAU_STUDIO, reessayable, texte: messageHorsLigneStudio('enregistrement') });
    } finally {
      setEnCours(null);
    }
  }

  const projectId = vue.projet.id;
  return (
    <VueVideo
      vue={vue} apercu={apercu} storyboard={storyboard} questions={questions} enCours={enCours} retour={retour}
      surRecharger={() => { setRetour(null); setApercu(null); router.refresh(); }}
      surReessayer={() => dernierGeste.current?.()}
      surPrevoir={(op) => { setRetour(null); setApercu(apercuDuGeste(vue, op)); }}
      surAbandonner={() => setApercu(null)}
      surConfirmer={() => {
        const a = apercu;
        if (!a) return;
        void agir('confirmer', () => appliquerOperationVideo({ projectId, baseVersionId: vue.version.id, operation: a.operation }), (r) => {
          const x = r as { impact?: { resume: string }; durees?: { phrase: string } };
          return `${a.libelle} · nouvelle version. ${x.impact?.resume ?? ''} ${x.durees?.phrase ?? ''}`.trim();
        }, () => { setApercu(null); if (a.operation.type === 'scenario') setStoryboard(null); });
      }}
      surStoryboard={(e) => agir('storyboard', async () => {
        setQuestions([]);
        const r = await planifierStoryboard({ projectId, ...e });
        if (!r.ok) return r;
        if (r.statut === 'questions') { setQuestions(r.questions); return { ok: true as const }; }
        setStoryboard({ plans: r.plans, totalMs: r.totalMs, avertissements: r.avertissements });
        return { ok: true as const };
      }, () => 'Réponse reçue · relis les plans, rien n’est encore écrit dans le projet.')}
      surRetenirStoryboard={() => { if (storyboard) setApercu(apercuDuGeste(vue, { type: 'scenario', plans: storyboard.plans })); }}
      surEcarterStoryboard={() => { setStoryboard(null); setQuestions([]); }}
      surCompiler={(shotId) => agir(`compiler:${shotId}`, async () => {
        const r = await compilerConsignePlan({ projectId, shotId });
        if (r.ok && r.statut === 'questions') { setQuestions(r.questions); return { ok: true as const }; }
        return r;
      }, () => 'Consigne compilée et validée par le serveur · relis-la puis retiens-la.')}
      surRetenirConsigne={(runId) => {
        const sid = Object.entries(vue.keyframes).find(([, k]) => k.enAttente?.runId === runId)?.[0] ?? '';
        void agir(`retenir:${sid}`, () => retenirConsignePlan({ projectId, baseVersionId: vue.version.id, runId }), () => 'Consigne retenue · nouvelle version, seule l’image clé de ce plan est concernée.');
      }}
      surDevis={(shotId) => agir(`devis:${shotId}`, () => demanderDevisKeyframe({ projectId, shotId }), () => 'Devis prêt · relis le prix avant d’approuver.')}
      surLancer={(shotId) => {
        const d = vue.keyframes[shotId]?.devis;
        if (!d) return;
        void agir(`lancer:${shotId}`, () => approuverEtLancerKeyframe({ quoteId: d.id, inputHash: d.inputHash, creditsAnnonces: d.credits, idempotencyKey: cleDuClicVideo(d.id) }), () => 'Lancé · le job est en file, tu peux fermer la page.');
      }}
      surAssembler={() => agir('assembler', () => assemblerVideoFinale({ projectId }), (r) => {
        const x = r as { video?: { dureeMs: number } };
        return `Vidéo finale assemblée${x.video ? ` · ${Math.round(x.video.dureeMs / 100) / 10} s` : ''} · lis-la ou télécharge-la ci-dessous.`;
      })}
      surDevisClip={(shotId) => agir(`devis-clip:${shotId}`, () => demanderDevisClip({ projectId, shotId }), () => 'Devis du clip prêt · relis le prix avant d’approuver.')}
      surLancerClip={(shotId) => {
        const d = vue.clips[shotId]?.devis;
        if (!d) return;
        void agir(`lancer-clip:${shotId}`, () => approuverEtLancerClip({ quoteId: d.id, inputHash: d.inputHash, creditsAnnonces: d.credits, idempotencyKey: cleDuClicVideo(d.id) }), () => 'Animation lancée · le clip est en file, tu peux fermer la page.');
      }}
    />
  );
}
