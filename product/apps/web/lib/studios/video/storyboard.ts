import 'server-only';
import {
  entreeStoryboard, plansDepuisStoryboard, referencesDuProjet, estBriefCanonique, erreurStudio, MODES_PAROLE,
  sourcesCitees, lireReferencesSources, lireReferenceEpinglee, lireReferenceProduit,
  type ContenuVersion, type ModeParole, type PlanStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { estUuid, lireProjet, lireVersion } from '../depot';
import { executerTache } from '../prompts/resolveur';
import { erreurTache, MESSAGE_SANS_FOURNISSEUR, type DependancesTexteVideo, type Resultat } from './consigne';

/**
 * Studios · L6-A · du brief au storyboard (`storyboard.plan`, appel texte
 * PAYANT, barrière de dépense) · VIDEO-01.
 *
 * Le serveur alloue les identifiants des plans, transmet le brief, les fiches
 * d'identité et le produit du projet ; la sortie validée par le registre est
 * revérifiée par `plansDepuisStoryboard` (identifiants alloués, références du
 * projet, champs obligatoires, mode sans texte). RIEN n'est écrit dans le
 * projet : les plans reviennent à l'écran, qui les fait retenir comme un
 * scénario saisi (même validation, `appliquerOperationVideoPour`). « Pas de
 * génération avant validation des plans » (consigne de la tâche).
 */

export type ResultatStoryboardServeur =
  | { ok: true; statut: 'plans'; plans: PlanStudio[]; totalMs: number; avertissements: string[]; runId: string; projectVersionId: string }
  | { ok: true; statut: 'questions'; questions: string[]; runId: string | null; projectVersionId: string };

export async function planifierStoryboardPour(
  ctx: ContexteStudio,
  e: { projectId: unknown; nbPlans: unknown; dureeCibleMs: unknown; speechMode: unknown },
  o: DependancesTexteVideo,
): Promise<Resultat<ResultatStoryboardServeur>> {
  if (!estUuid(e.projectId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const nb = typeof e.nbPlans === 'number' && Number.isInteger(e.nbPlans) && e.nbPlans >= 1 && e.nbPlans <= 20 ? e.nbPlans : null;
  const duree = typeof e.dureeCibleMs === 'number' && Number.isInteger(e.dureeCibleMs) && e.dureeCibleMs >= 1000 && e.dureeCibleMs <= 180_000 ? e.dureeCibleMs : null;
  if (nb === null || duree === null || !MODES_PAROLE.includes(e.speechMode as ModeParole)) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'storyboard', raison: 'de 1 à 20 plans, durée cible de 1 à 180 s, mode de parole none, voiceover ou lipsync' }] });
  }
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok) return p;
  if (!p.projet.currentVersionId) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const v = await lireVersion(ctx, p.projet.currentVersionId);
  if (!v.ok) return v;
  const contenu = v.version.content as ContenuVersion;
  if (!estBriefCanonique(contenu.brief)) return erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, message: 'Ce projet n’a pas de brief · le storyboard se construit à partir du brief. Rien n’est parti.' });
  if (!o.adaptateur) return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: MESSAGE_SANS_FOURNISSEUR });

  const brief = contenu.brief;
  const entree = entreeStoryboard({ brief, versionId: v.version.id, contenu, nbPlans: nb, dureeCibleMs: duree, speechMode: e.speechMode as ModeParole });
  const sansTexte = brief.texts.length === 0;
  const r = await executerTache({
    templateKey: 'storyboard.plan',
    portee: { workspaceId: ctx.workspaceId, brandId: p.projet.brandId },
    acteur: { userId: ctx.userId, traceId: ctx.traceId },
    taskInputs: entree.taskInputs,
    contexte: {
      language: 'fr', projectVersionId: v.version.id, facts: entree.facts, invariants: entree.invariants,
      resolvedDocuments: entree.resolvedDocuments, allocatedIds: entree.allocatedIds,
      // Les faits du brief citent leurs sources : elles partent avec eux (même règle que Textes IA).
      sources: sourcesCitees(brief, lireReferencesSources(p.projet.sourceRefs).sources, lireReferenceEpinglee(contenu.productRef) ?? lireReferenceProduit(contenu.productRef)),
    },
    liens: { projectId: p.projet.id, documentVersionId: v.version.id },
    adaptateur: o.adaptateur,
    environnement: o.environnement,
    sansTexte,
  });
  if (!r.ok) return erreurTache(ctx, r.code);
  const plans = plansDepuisStoryboard(r.sortie, { idsAlloues: entree.idsAlloues, referencesPermises: referencesDuProjet(contenu), sansTexte });
  if (!plans.ok) {
    if (plans.cause === 'questions') return { ok: true, statut: 'questions', questions: plans.questions, runId: r.runId, projectVersionId: v.version.id };
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: plans.violations, message: 'Le storyboard reçu ne respecte pas les plans demandés · rien n’a été retenu.' });
  }
  return { ok: true, statut: 'plans', plans: plans.plans, totalMs: plans.totalMs, avertissements: plans.avertissements, runId: r.runId, projectVersionId: v.version.id };
}
