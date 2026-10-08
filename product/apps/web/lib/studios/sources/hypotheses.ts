import 'server-only';
import {
  erreurStudio, validerHypotheses, idsHypothesesAlloues, metriquesDisponibles, scellerPropositions, LIBELLES_ELEMENT,
  type ErreurStudio, type HypotheseQualifiee, type SourceReferenceStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { executerTache } from '../prompts/resolveur';
import type { AdaptateurModele } from '../prompts/adaptateur';
import type { EnvironnementPrompts } from '../prompts/environnement';
import { chargerSources, estUuid } from './sources';
import { signerScelle } from './scelle';

/**
 * Proposer au plus trois hypothèses (cahier 01 §4.2 point 4) · tâche
 * `test.hypothesize` du registre, par `executerTache` (release, traces,
 * barrière de dépense via l'adaptateur réel en production).
 *
 * ── Honnêteté ────────────────────────────────────────────────────────────────
 *
 *  · Sans release publiée (`RELEASE_ACTIVE_ABSENTE`) ou sans fournisseur
 *    configuré : refus `UNSUPPORTED_CAPABILITY` qui le DIT et renvoie à la
 *    saisie manuelle. Jamais présenté comme disponible.
 *  · Un appel texte coûte : son plafond est annoncé avant le clic
 *    (`plafondPropositionUsd`), il passe la barrière et n'est jamais dit
 *    gratuit. Aucun crédit n'est débité (même politique que Jarvis).
 *  · La sortie du modèle est revalidée ici (au plus trois, sources de la
 *    sélection) puis SCELLÉE pour l'espace, la marque et la sélection.
 */

export interface DependancesIa {
  adaptateur: AdaptateurModele | null;
  environnement: EnvironnementPrompts;
}

export interface Propositions {
  brandId: string;
  hypotheses: HypotheseQualifiee[];
  jeton: string;
  runId: string | null;
  avertissements: string[];
}

export type ResultatPropositions =
  | ({ ok: true } & Propositions)
  | ({ ok: true; brandId: string; hypotheses: []; questions: string[]; jeton: null; runId: string | null; avertissements: string[] })
  | (ErreurStudio & { saisieManuelle: true });

const manuelle = (e: ErreurStudio): ErreurStudio & { saisieManuelle: true } => ({ ...e, saisieManuelle: true });

export const MESSAGE_SANS_RELEASE = 'Les propositions d’hypothèses ne sont pas encore activées : aucune version des consignes n’est publiée. Rédige ton hypothèse ci-dessous, le projet se crée de la même façon.';
export const MESSAGE_SANS_FOURNISSEUR = 'Les propositions d’hypothèses ne sont pas disponibles ici (aucun fournisseur configuré). Rédige ton hypothèse ci-dessous, le projet se crée de la même façon.';

/** Le texte d'une source donné au modèle · des DONNÉES, jamais des consignes. */
function texteSource(s: SourceReferenceStudio): string {
  return [
    `Annonce ${s.plateforme} de « ${s.annonceur || 'annonceur inconnu'} », observée le ${s.observeLe.slice(0, 10)}.`,
    s.extraitAutorise ? `Extrait autorisé du texte : ${s.extraitAutorise}` : 'Aucun texte.',
    `Ressources disponibles : ${s.modalites.join(', ') || 'aucune'}.`,
    ...s.absents.map((a) => `${LIBELLES_ELEMENT[a.element]} non observable : ${a.raison}`),
  ].join('\n').slice(0, 12_000);
}

export async function proposerHypothesesPour(
  ctx: ContexteStudio,
  e: { sources: unknown; brandId: unknown; objectif?: unknown },
  o: { veilleOuverte: boolean; maintenant: Date; ia: DependancesIa },
): Promise<ResultatPropositions> {
  if (!estUuid(e.brandId) || !ctx.marques.includes(e.brandId)) return manuelle(erreurStudio('NOT_FOUND', { traceId: ctx.traceId }));
  const brandId = e.brandId;
  const c = await chargerSources(ctx, e.sources, o);
  if (!c.ok) return manuelle(c);
  if (!o.ia.adaptateur) return manuelle(erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: MESSAGE_SANS_FOURNISSEUR }));

  const sources = c.sources;
  const sourceIds = sources.map((s) => s.sourceId);
  const observations = sources.flatMap((s) => s.observations);
  const objectif = typeof e.objectif === 'string' && e.objectif.trim()
    ? e.objectif.trim().slice(0, 2000)
    : 'Trouver ce qui, dans cette structure, peut améliorer une publicité de la marque cible · une variable à la fois.';
  const r = await executerTache({
    templateKey: 'test.hypothesize',
    portee: { workspaceId: ctx.workspaceId, brandId },
    acteur: { userId: ctx.userId, traceId: ctx.traceId },
    taskInputs: {
      observationIds: observations.map((x) => x.id),
      objective: objectif,
      availableMetrics: metriquesDisponibles(sources.some((s) => s.modalites.includes('video'))),
    },
    contexte: {
      language: 'fr',
      facts: observations.map((x) => ({ id: x.id, claim: x.claim, sourceIds: x.sourceIds, kind: x.kind, confidence: x.confidence })),
      allocatedIds: idsHypothesesAlloues().map((id, ordinal) => ({ id, entityType: 'hypothesis' as const, ordinal })),
      selectionIds: sourceIds,
      sources: sources.map((s) => ({ sourceId: s.sourceId, version: s.empreinte, text: texteSource(s), titre: s.annonceur || s.cle })),
    },
    adaptateur: o.ia.adaptateur,
    environnement: o.ia.environnement,
  });

  if (!r.ok) {
    const traceId = ctx.traceId;
    if (r.code === 'RELEASE_ACTIVE_ABSENTE') return manuelle(erreurStudio('UNSUPPORTED_CAPABILITY', { traceId, message: MESSAGE_SANS_RELEASE }));
    if (r.code === 'UNSUPPORTED_CAPABILITY') return manuelle(erreurStudio('UNSUPPORTED_CAPABILITY', { traceId, message: MESSAGE_SANS_FOURNISSEUR }));
    if (r.code === 'BUDGET_EXCEEDED') return manuelle(erreurStudio('BUDGET_EXCEEDED', { traceId }));
    if (r.code === 'PROVIDER_ERROR') return manuelle(erreurStudio('PROVIDER_UNCERTAIN', { traceId, message: 'Le fournisseur n’a pas répondu · rien n’est relancé automatiquement. Rédige ton hypothèse ou réessaie plus tard.' }));
    return manuelle(erreurStudio('INVALID_SCHEMA', { traceId, message: 'La proposition reçue n’est pas exploitable · rien n’a été retenu. Rédige ton hypothèse ou réessaie.' }));
  }
  const sortie = r.sortie as { status: string; questions?: string[]; warnings?: string[]; result: { hypotheses?: unknown } | null };
  const avertissements = (sortie.warnings ?? []).slice(0, 20);
  if (sortie.status !== 'ready' || !sortie.result) {
    return { ok: true, brandId, hypotheses: [], questions: (sortie.questions ?? []).slice(0, 5), jeton: null, runId: r.runId, avertissements };
  }
  const v = validerHypotheses(sortie.result.hypotheses, sourceIds);
  if (!v.ok) return manuelle(erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, message: 'La proposition reçue ne respecte pas les règles (trois hypothèses au plus, sources de la sélection) · rien n’a été retenu.' }));
  const jeton = signerScelle(scellerPropositions({ workspaceId: ctx.workspaceId, brandId, sourceIds, hypotheses: v.hypotheses, runId: r.runId, maintenant: o.maintenant.getTime() }));
  return { ok: true, brandId, hypotheses: v.hypotheses, jeton, runId: r.runId, avertissements };
}
