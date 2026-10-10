'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { capacitesDuRefus, type ErreurStudio, type ModeImage } from '@tiktrends/core';
import type { VueParcoursImage } from '../../../lib/studios/image/parcours';
import {
  lireParcoursImage, compilerConsigneImage, retenirConsigneImage, demanderDevisImage, approuverEtLancerImage, controlerMediaImage,
} from '../../../app/actions/studios/image';
import { annulerJob } from '../../../app/actions/studios/execution';
import { trancherComposants } from '../../../app/actions/studios/produit';
import { panneau, texte, mini, signal } from '../propositions/styles';
import { VueParcours } from './VueParcours';

/**
 * Le parcours image monté sur la page « Produit et références » (lot F-B).
 *
 * L'état vient du SERVEUR (`lireParcoursImage`, lecture pure) et se relit
 * après chaque geste ; tant qu'un job n'est pas terminé, il se relit toutes
 * les 4 s (le worker avance sans cet onglet : fermer la page n'annule rien).
 * La clé du clic « Approuver et lancer » est gardée par devis dans
 * `sessionStorage` : un double clic ou une reconnexion retrouve le même job,
 * sans second débit.
 *
 * Un média livré en `pending` passe au contrôle des composants (POST
 * explicite, `studio.propose`) dès que l'écran le voit · l'affichage seul de
 * la page n'écrit jamais rien.
 */

const RELECTURE_MS = 4_000;

function messageErreur(r: ErreurStudio): string {
  if (r.violations?.length) return r.violations.map((v) => v.raison).join(' · ');
  return r.message;
}

function cleDuClic(quoteId: string): string {
  const k = `tt-studio-image-cle-${quoteId}`;
  try {
    const deja = window.sessionStorage.getItem(k);
    if (deja) return deja;
    const cle = `img-${crypto.randomUUID()}`;
    window.sessionStorage.setItem(k, cle);
    return cle;
  } catch {
    return `img-${quoteId}`;
  }
}

/** `versionId` · la version que la page affiche : quand elle change (épinglage, références), l'état se relit. */
export function ParcoursImage({ projectId, versionId }: { projectId: string; versionId: string }) {
  const router = useRouter();
  const [vue, setVue] = useState<VueParcoursImage | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // F1 · génération coupée pour l'espace : un état, pas une erreur (aucun geste offert).
  const [nonActive, setNonActive] = useState<string | null>(null);
  const [mode, setMode] = useState<ModeImage | ''>('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const controles = useRef(new Set<string>());

  const charger = useCallback(async () => {
    try {
      const r = await lireParcoursImage({ projectId });
      if (r.ok) { setVue(r.vue); setErreur(null); setNonActive(null); } else if (capacitesDuRefus(r).length) setNonActive(r.message); else setErreur(`${messageErreur(r)} · identifiant support ${r.traceId}`);
    } catch {
      setErreur('Le serveur n’a pas répondu · recharge la page.');
    }
  }, [projectId]);

  useEffect(() => { void charger(); }, [charger, versionId]);

  useEffect(() => {
    // Le mode de la consigne en cours (retenue ou compilée), sinon le premier que le contrôle laisse passer.
    if (vue && !mode) {
      const voulu = vue.enAttente?.mode ?? vue.retenue?.mode;
      const m = vue.modes.find((x) => x.mode === voulu && x.pret) ?? vue.modes.find((x) => x.pret);
      if (m) setMode(m.mode);
    }
  }, [vue, mode]);

  useEffect(() => {
    if (!vue || !vue.jobs.some((j) => !j.terminal)) return;
    const t = setTimeout(() => { void charger(); }, RELECTURE_MS);
    return () => clearTimeout(t);
  }, [vue, charger]);

  useEffect(() => {
    if (!vue?.peutRelire) return;
    for (const j of vue.jobs) {
      if (j.etat === 'completed' && j.qualite === 'pending' && !controles.current.has(j.id)) {
        controles.current.add(j.id);
        // Un refus (issue incertaine à réconcilier, plafond…) est DIT, jamais avalé (raccord E2).
        void controlerMediaImage({ jobId: j.id }).then((r) => {
          if (!r.ok) setRetour({ ok: false, texte: r.message });
          return charger();
        }).catch(() => undefined);
      }
    }
  }, [vue, charger]);

  async function agir(nom: string, f: () => Promise<{ ok: true } | ErreurStudio>, succes: string, apres?: () => void) {
    setEnCours(nom);
    setRetour(null);
    try {
      const r = await f();
      if (r.ok) { setRetour({ ok: true, texte: succes }); apres?.(); } else setRetour({ ok: false, texte: messageErreur(r) });
    } catch {
      setRetour({ ok: false, texte: 'Le serveur n’a pas répondu · rien n’a été confirmé. Recharge avant de réessayer.' });
    } finally {
      setEnCours(null);
      await charger();
    }
  }

  if (nonActive) return <ParcoursNonActive message={nonActive} />;

  if (!vue) {
    return (
      <section style={panneau} data-zone="parcours-image" aria-busy={!erreur}>
        {erreur ? <p style={signal('err')} role="alert">{erreur}</p> : <p style={texte}>Chargement de l’état de l’image…</p>}
        <p style={mini}>Rien n’est lancé à l’ouverture de la page.</p>
      </section>
    );
  }

  return (
    <VueParcours
      vue={vue} mode={mode} enCours={enCours} retour={retour} questions={questions}
      surMode={setMode}
      surCompiler={() => agir('compiler', async () => {
        setQuestions([]);
        const r = await compilerConsigneImage({ projectId, mode });
        if (r.ok && r.statut === 'questions') { setQuestions(r.questions); return { ok: false, code: 'INVALID_SCHEMA', status: 422, message: 'La consigne n’est pas compilée · réponds aux questions dans le brief puis recompile.', targetIds: [], recoverable: true, traceId: '' } as ErreurStudio; }
        return r;
      }, 'Consigne compilée et validée par le serveur · relis-la puis retiens-la.')}
      surRetenir={(runId) => agir('retenir', () => retenirConsigneImage({ projectId, baseVersionId: vue.version.id, runId }), 'Consigne retenue · nouvelle version du projet.', () => router.refresh())}
      surDevis={(o) => agir('devis', () => demanderDevisImage({ projectId, controleVision: o?.controleVision }), 'Devis prêt · relis le prix avant d’approuver.')}
      surLancer={() => {
        const d = vue.devis;
        if (!d) return;
        void agir('lancer', () => approuverEtLancerImage({ quoteId: d.id, inputHash: d.inputHash, creditsAnnonces: d.credits, idempotencyKey: cleDuClic(d.id) }), 'Lancé · le job est en file, tu peux fermer la page.');
      }}
      surAnnuler={(jobId) => agir(`annuler:${jobId}`, () => annulerJob({ jobId }), 'Annulation demandée.')}
      surRelire={(jobId, constats) => agir('relire', () => trancherComposants({ jobId, constats }), 'Relecture enregistrée.')}
    />
  );
}

/** F1 · la génération d'images est coupée pour l'espace · ce que la page peut encore faire, sans aucun geste payant. */
export function ParcoursNonActive({ message }: { message: string }) {
  return (
    <section style={panneau} data-zone="parcours-image" data-etat="non-active" aria-labelledby="parcours-non-active">
      <h2 id="parcours-non-active" style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Génération d’images · non activé pour cet espace</h2>
      <p role="status" style={texte}>{message}</p>
      <p style={mini}>Le produit, les références et l’éditeur de calques restent disponibles. L’ouverture se fait d’abord pour des espaces pilotes, puis pour tous après recette.</p>
    </section>
  );
}
