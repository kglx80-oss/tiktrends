'use client';

import Link from 'next/link';
import { liensAtelierProjet } from '../../../lib/navigation';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  CIBLE_TACTILE_MIN, CIBLE_CONCEPT, actionsConceptResolues, demandeProposition, nombreAppels,
  type ActionConceptResolue, type DefActionConcept,
} from '@tiktrends/core';
import { listerPropositions, proposerPatch } from '../../../app/actions/studios/propositions';
import type { ListePropositions, ReponseProposition } from '../../../lib/studios/propositions/types';

/**
 * Concept créatif V5 · PR6 · les ACTIONS TYPÉES du fil (items 4-5-7 du mandat
 * Kevin du 20/10). Au-dessus des cartes de propositions, une rangée de gestes
 * concrets : « Proposer des directions visuelles », « Proposer 3 accroches »,
 * « Écrire le scénario », « Préparer la création ».
 *
 * ── Pas de second moteur, pas de bouton mort, pas de succès simulé ───────────
 *
 * Quelles actions montrer, lesquelles sont actives, et pourquoi une action est
 * grisée · c'est la règle PURE du noyau (`actionsConceptResolues`) qui tranche,
 * jamais ce JSX. Une action « proposition » demande au serveur une proposition
 * BORNÉE à un chemin du brief (`proposerPatch`, cible `brief`, `allowedPaths` =
 * le seul chemin visé) · elle passe par la garde `studio.propose` ET la barrière
 * de dépense existantes, et la proposition est RELUE puis appliquée seulement par
 * un geste dans les cartes. Le texte libre du fil, lui, ne propose ni ne dépense
 * jamais · seul un de ces boutons TYPÉS (demande fermée, dérivée de la clé) peut
 * déclencher un appel. « 3 accroches » = trois propositions concurrentes sur
 * `/brief/texts`, que la personne départage.
 *
 * « Préparer la création » ouvre le parcours produit pour une image active,
 * sans lancer de génération. On lit la disponibilité (brief prêt, droit, Jarvis)
 * par une LECTURE pure (`listerPropositions`) · aucune écriture, aucune dépense.
 */

const btn: CSSProperties = {
  minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 650,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer',
  border: '1px solid var(--accent-strong)', background: 'var(--accent-soft)', color: 'var(--accent-strong)',
};
const btnGrise: CSSProperties = {
  ...btn, cursor: 'not-allowed', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--muted)',
};
const note: CSSProperties = { margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 };

/** `brief prêt` = la version courante porte un brief canonique (un champ autre que l'amorce « objectif »). */
function briefPret(liste: ReponseProposition<ListePropositions> | null): boolean {
  if (!liste?.ok) return false;
  const brief = liste.cibles.find((c) => c.cible === CIBLE_CONCEPT);
  return !!brief && brief.champs.some((ch) => ch.forme !== 'objectif-brief');
}

export function ActionsConcept({ projectId, kind, generationImageActive, versionCourante, onPropose, signalRecharge = 0, ancienneVersion = false }: {
  projectId: string;
  kind: string;
  /** État de la capacité d'espace `generation_image` · décide la raison de « Préparer la création ». */
  generationImageActive: boolean;
  /** La version courante du concept · `null` = pas encore de version, aucune action. */
  versionCourante: { id: string; n: number } | null;
  /** Prévient l'hôte qu'une proposition a été reçue · il recharge les cartes. */
  onPropose: () => void;
  /** Bump externe (après application d'une carte) · relit la disponibilité. */
  signalRecharge?: number;
  ancienneVersion?: boolean;
}) {
  const [liste, setListe] = useState<ReponseProposition<ListePropositions> | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);
  const actif = useRef(projectId);
  actif.current = projectId;

  const charger = useCallback(async () => {
    const pour = projectId;
    try {
      const r = await listerPropositions({ projectId: pour });
      if (actif.current === pour) setListe(r);
    } catch {
      /* hors ligne · on garde l'état précédent, les actions restent prudentes */
    }
  }, [projectId]);

  useEffect(() => { void charger(); }, [charger, versionCourante?.id, signalRecharge]);

  if (!versionCourante) return null;

  const dispo = liste?.ok ? liste.jarvis : null;
  const resolues = actionsConceptResolues({
    kind,
    peutProposer: liste?.ok ? liste.peutProposer : false,
    briefPret: briefPret(liste),
    jarvisDisponible: !!dispo?.disponible,
    jarvisRaison: dispo?.raison ?? '',
    generationImageActive,
    ancienneVersion,
  });
  const auMoinsUneActive = resolues.some((a) => a.etat === 'actif' && a.def.genre === 'proposition');

  async function lancer(def: DefActionConcept) {
    if (!liste?.ok || def.genre !== 'proposition' || !def.cibleBrief) return;
    const base = liste.versionCourante.id;
    setEnCours(def.key);
    setRetour(null);
    let recues = 0;
    try {
      const n = nombreAppels(def);
      for (let i = 0; i < n; i += 1) {
        const demande = demandeProposition(def.key, i);
        if (!demande) continue;
        const r = await proposerPatch({ projectId, baseVersionId: base, cible: CIBLE_CONCEPT, demande, allowedPaths: [def.cibleBrief.chemin] });
        if (actif.current !== projectId) return;
        if (!r.ok) { setRetour({ type: 'err', message: r.message }); break; }
        if (r.statut === 'questions') { setRetour({ type: 'err', message: `Jarvis a besoin d’une précision · ${r.questions.join(' · ')}. Rien n’a été enregistré.` }); break; }
        recues += 1;
      }
      if (recues > 0) {
        setRetour({ type: 'ok', message: recues === 1
          ? 'Proposition reçue · relis-la dans les créations, puis adopte-la si elle te convient. Rien n’est appliqué sans ton geste.'
          : `${recues} propositions reçues · départage-les dans les créations. Rien n’est appliqué sans ton geste.` });
        onPropose();
      }
    } catch {
      if (actif.current === projectId) setRetour({ type: 'err', message: 'La réponse a été interrompue · le résultat de la demande est inconnu. Recharge les cartes avant toute nouvelle demande.' });
    } finally {
      if (actif.current === projectId) setEnCours(null);
    }
  }

  return (
    <section data-actions-concept aria-label="Actions du concept" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {resolues.map((a: ActionConceptResolue) => {
          const occupe = enCours === a.def.key;
          const grise = a.etat !== 'actif' || !!enCours;
          if (a.def.genre === 'preparation' && !grise) {
            const href = liensAtelierProjet(projectId, () => true).find((l) => l.segment === 'produit')!.href!;
            return <Link key={a.def.key} href={href} prefetch={false} data-action={a.def.key} data-etat={a.etat}
              title="Ouvrir la préparation de l’image · aucune génération à ce clic."
              style={{ ...btn, textDecoration: 'none' }}>{a.def.label}</Link>;
          }
          return (
            <button
              key={a.def.key} type="button" data-action={a.def.key} data-etat={a.etat}
              disabled={grise}
              title={a.raison ?? a.def.effet}
              aria-label={a.raison ? `${a.def.label} · ${a.raison}` : a.def.label}
              onClick={a.etat === 'actif' ? () => void lancer(a.def) : undefined}
              style={a.etat === 'actif' && !enCours ? btn : btnGrise}
            >
              {occupe ? 'Jarvis prépare…' : a.def.label}
            </button>
          );
        })}
      </div>

      {/* Prix ANNONCÉ avant le clic · jamais « gratuit ». */}
      {auMoinsUneActive && dispo && <p data-cout style={note}>{dispo.mentionCout}</p>}

      {/* Les raisons des actions grisées, dites en clair (une seule par raison). */}
      {[...new Set(resolues.filter((a) => a.etat !== 'actif' && a.raison).map((a) => a.raison!))].map((r) => (
        <p key={r} data-raison style={note}>{r}</p>
      ))}

      {retour && (
        <p role={retour.type === 'err' ? 'alert' : 'status'} data-retour={retour.type}
          style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: retour.type === 'err' ? 'var(--err-text)' : 'var(--ink)' }}>
          {retour.message}
        </p>
      )}
    </section>
  );
}
