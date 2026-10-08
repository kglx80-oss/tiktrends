import 'server-only';
import {
  controlerAvantCompilation, controlerSortieCompilation, consigneFinale, entreeCompilation, sourcesCitees, erreurStudio,
  type ConsigneImage, type ModeImage, type PreparationCompilation, type ErreurStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { executerTache } from '../prompts/resolveur';
import type { AdaptateurModele } from '../prompts/adaptateur';
import type { EnvironnementPrompts } from '../prompts/environnement';
import { estUuid } from '../depot';
import { chargerCatalogueProjet, type Resultat } from './catalogue';

/**
 * Compiler la consigne image (`image.compile`) d'un projet · contrôle AVANT
 * l'appel (produit épinglé, rôles explicites, références concurrentes bornées
 * au style et à la composition), appel par `executerTache` (registre,
 * release, barrière de dépense), contrôle APRÈS (aucun rôle déduit, aucune
 * fuite du concurrent, composants protégés), puis consigne FINALE où les
 * interdits du serveur s'ajoutent à ceux du modèle.
 *
 * Ne produit AUCUN média : la consigne est rendue à l'appelant (le rendu et
 * les jobs appartiennent à L5-A). Un refus avant appel n'écrit rien, pas même
 * une trace, et n'appelle aucun fournisseur.
 */

export interface DependancesCompilation {
  adaptateur: AdaptateurModele | null;
  environnement: EnvironnementPrompts;
  veilleOuverte: boolean;
  maintenant: Date;
}

export const MESSAGE_COMPILATION_SANS_RELEASE = 'La compilation de la consigne image n’est pas encore activée : aucune version des consignes n’est publiée. Rien n’a été facturé.';
export const MESSAGE_COMPILATION_SANS_FOURNISSEUR = 'Le fournisseur de texte n’est pas configuré sur ce serveur · la consigne image ne peut pas être compilée ici. Rien n’a été facturé.';

const MODES: readonly ModeImage[] = ['faithful_composite', 'generative_scene'];

/** Contrôle seul · lecture pure, pour l'écran (aucun appel, aucune écriture). */
export async function preparerCompilationPour(ctx: ContexteStudio, e: { projectId: unknown; mode: unknown }, o: { veilleOuverte: boolean; maintenant: Date }): Promise<Resultat<{ preparation: PreparationCompilation }>> {
  if (!estUuid(e.projectId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const mode = MODES.includes(e.mode as ModeImage) ? (e.mode as ModeImage) : 'faithful_composite';
  const c = await chargerCatalogueProjet(ctx, e.projectId, o);
  if (!c.ok) return c;
  return { ok: true, preparation: controlerAvantCompilation({ mode, brief: c.catalogue.brief, produit: c.catalogue.epingle, fichiers: c.catalogue.fichiers }) };
}

export type ResultatCompilation =
  | { ok: true; statut: 'compilee'; consigne: ConsigneImage; runId: string; preparation: PreparationCompilation; projectVersionId: string }
  | { ok: true; statut: 'questions'; questions: string[]; runId: string | null; preparation: PreparationCompilation; projectVersionId: string }
  | ErreurStudio;

export async function compilerConsigneImagePour(
  ctx: ContexteStudio,
  e: { projectId: unknown; mode: unknown; largeur?: unknown; hauteur?: unknown },
  o: DependancesCompilation,
): Promise<ResultatCompilation> {
  if (!estUuid(e.projectId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  if (!MODES.includes(e.mode as ModeImage)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'mode', raison: 'mode faithful_composite ou generative_scene attendu' }] });
  const mode = e.mode as ModeImage;
  const c = await chargerCatalogueProjet(ctx, e.projectId, o);
  if (!c.ok) return c;
  const cat = c.catalogue;
  const prep = controlerAvantCompilation({ mode, brief: cat.brief, produit: cat.epingle, fichiers: cat.fichiers });
  if (!prep.ok || !cat.brief) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, targetIds: [cat.projet.id], violations: prep.violations, message: 'La consigne image n’est pas compilée : les références ne respectent pas leurs rôles · rien n’est parti, rien n’a été facturé.' });
  }
  if (!o.adaptateur) return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: MESSAGE_COMPILATION_SANS_FOURNISSEUR });

  const entree = entreeCompilation({
    prep, brief: cat.brief, versionId: cat.version.id, mode,
    largeur: typeof e.largeur === 'number' ? e.largeur : 1080, hauteur: typeof e.hauteur === 'number' ? e.hauteur : 1350,
  });
  const r = await executerTache({
    templateKey: 'image.compile',
    portee: { workspaceId: ctx.workspaceId, brandId: cat.projet.brandId },
    acteur: { userId: ctx.userId, traceId: ctx.traceId },
    taskInputs: entree.taskInputs,
    contexte: {
      language: 'fr', projectVersionId: cat.version.id, facts: entree.facts, invariants: entree.invariants,
      references: entree.references, resolvedDocuments: entree.resolvedDocuments, selectionIds: prep.referenceIds,
      sources: sourcesCitees(cat.brief, cat.sourcesProjet, cat.epingle ?? cat.instantane),
    },
    liens: { projectId: cat.projet.id, documentVersionId: cat.version.id },
    adaptateur: o.adaptateur,
    environnement: o.environnement,
  });
  if (!r.ok) {
    const traceId = ctx.traceId;
    if (r.code === 'RELEASE_ACTIVE_ABSENTE') return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId, message: MESSAGE_COMPILATION_SANS_RELEASE });
    if (r.code === 'UNSUPPORTED_CAPABILITY') return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId, message: MESSAGE_COMPILATION_SANS_FOURNISSEUR });
    if (r.code === 'BUDGET_EXCEEDED') return erreurStudio('BUDGET_EXCEEDED', { traceId });
    if (r.code === 'PROVIDER_ERROR') return erreurStudio('PROVIDER_UNCERTAIN', { traceId, message: 'Le fournisseur n’a pas répondu · rien n’est relancé automatiquement.' });
    return erreurStudio('INVALID_SCHEMA', { traceId, message: 'La consigne reçue n’est pas exploitable · rien n’a été retenu.' });
  }
  const sortie = r.sortie as { status: string; questions?: string[]; result: ConsigneImage | null };
  if (sortie.status !== 'ready' || !sortie.result) {
    return { ok: true, statut: 'questions', questions: (sortie.questions ?? []).slice(0, 5), runId: r.runId, preparation: prep, projectVersionId: cat.version.id };
  }
  const violations = controlerSortieCompilation(sortie.result, prep, cat.fichiers, cat.sources);
  if (violations.length) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations, message: 'La consigne reçue attribue un rôle non choisi, nomme ou recopie le concurrent, ou ne protège pas un composant · rien n’a été retenu.' });
  }
  return { ok: true, statut: 'compilee', consigne: consigneFinale(sortie.result, prep), runId: r.runId, preparation: prep, projectVersionId: cat.version.id };
}
