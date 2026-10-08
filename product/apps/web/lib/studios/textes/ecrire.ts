import 'server-only';
import {
  entreeEcriture, relireVariantes, sourcesCitees, lireReferencesSources, lireReferenceProduit, estTypeTexte, validerFormeBrief, differencesDetaillees, erreurStudio,
  LIMITE_CARACTERES, TEXTE_MAX_CONTRAT, VARIANTES_DEFAUT, VARIANTES_MAX,
  type BriefCanonique, type ErreurStudio, type TypeTexte, type VarianteTexte,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { executerTache } from '../prompts/resolveur';
import type { AdaptateurModele } from '../prompts/adaptateur';
import type { EnvironnementPrompts } from '../prompts/environnement';
import { estUuid, lireProjet, lireVersion, type VersionStudio } from '../depot';

/**
 * Écrire des textes avec l'IA (cahier §4.7) · tâche `text.write` du registre
 * par `executerTache` (release, traces, barrière de dépense via l'adaptateur
 * réel en production, simulé en test seulement).
 *
 *  · Le MÊME brief : celui de la version COURANTE du projet. Une version de
 *    base périmée est refusée (409) AVANT l'appel : on ne paie pas pour écrire
 *    sur un brief qui a changé.
 *  · Sans release publiée, sans fournisseur, plafond atteint : refus honnête,
 *    la saisie manuelle reste ouverte (`saisieManuelle: true`).
 *  · Rien n'est écrit dans le projet : les variantes reviennent à l'écran, on
 *    les retient d'un geste explicite (`enregistrerTextesPour`). Seule la
 *    trace du registre (`studio_prompt_runs`) est écrite.
 */

export interface DependancesTextes {
  adaptateur: AdaptateurModele | null;
  environnement: EnvironnementPrompts;
  plafondAtteint: () => Promise<boolean>;
}

export interface EntreeEcritureTextes {
  projectId: unknown;
  baseVersionId: unknown;
  type: unknown;
  maxCaracteres?: unknown;
  nombre?: unknown;
  langue?: unknown;
}

export type ResultatEcriture =
  | { ok: true; statut: 'proposees'; versionId: string; type: TypeTexte; variantes: VarianteTexte[]; ecartees: Array<{ id: string; raison: string }>; avertissements: string[]; runId: string }
  | { ok: true; statut: 'questions'; versionId: string; type: TypeTexte; questions: string[]; avertissements: string[]; runId: string | null }
  | (ErreurStudio & { saisieManuelle: true });

export const MESSAGE_TEXTES_SANS_RELEASE = 'L’écriture par l’IA n’est pas encore activée : aucune version des consignes n’est publiée. Écris tes textes ci-dessous, ils se rangent de la même façon. Rien n’a été facturé.';
export const MESSAGE_TEXTES_SANS_FOURNISSEUR = 'Le fournisseur de texte n’est pas configuré sur ce serveur. Écris tes textes ci-dessous, ils se rangent de la même façon. Rien n’a été facturé.';

const manuelle = (e: ErreurStudio): ErreurStudio & { saisieManuelle: true } => ({ ...e, saisieManuelle: true });

/** Projet, version courante et brief lisible · lecture dans la portée. */
export async function projetEtBrief(ctx: ContexteStudio, projectId: unknown): Promise<({ ok: true; projet: { id: string; title: string; brandId: string; currentVersionId: string; sourceRefs: unknown }; version: VersionStudio; brief: BriefCanonique | null; briefIllisible: boolean }) | ErreurStudio> {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  if (!p.projet.currentVersionId) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const v = await lireVersion(ctx, p.projet.currentVersionId);
  if (!v.ok) return v;
  if (v.version.projectId !== p.projet.id) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const brut = (v.version.content as { brief?: unknown }).brief ?? null;
  const illisible = brut !== null && validerFormeBrief(brut).length > 0;
  return {
    ok: true, projet: { id: p.projet.id, title: p.projet.title, brandId: p.projet.brandId, currentVersionId: p.projet.currentVersionId, sourceRefs: p.projet.sourceRefs },
    version: v.version, brief: brut && !illisible ? (brut as BriefCanonique) : null, briefIllisible: illisible,
  };
}

/** 409 si la version de base n'est plus la courante · le diff pour recharger. */
export async function conflitDeBase(ctx: ContexteStudio, courante: VersionStudio, baseVersionId: unknown): Promise<ErreurStudio | null> {
  if (baseVersionId === courante.id) return null;
  if (!estUuid(baseVersionId)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version de base obligatoire' }] });
  const b = await lireVersion(ctx, baseVersionId);
  if (!b.ok || b.version.projectId !== courante.projectId) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version inconnue pour ce projet' }] });
  return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [courante.projectId, courante.id], conflit: { versionCouranteId: courante.id, differences: differencesDetaillees(b.version.content, courante.content) } });
}

export async function ecrireTextesPour(ctx: ContexteStudio, e: EntreeEcritureTextes, deps: DependancesTextes): Promise<ResultatEcriture> {
  const traceId = ctx.traceId;
  if (!estUuid(e.projectId)) return manuelle(erreurStudio('NOT_FOUND', { traceId }));
  if (!estTypeTexte(e.type)) return manuelle(erreurStudio('INVALID_SCHEMA', { traceId, violations: [{ chemin: 'type', raison: 'type hook, ad_copy, cta ou script attendu' }] }));
  const type = e.type;
  const max = e.maxCaracteres === undefined ? LIMITE_CARACTERES[type] : e.maxCaracteres;
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > TEXTE_MAX_CONTRAT) return manuelle(erreurStudio('INVALID_SCHEMA', { traceId, violations: [{ chemin: 'maxCaracteres', raison: `entier de 1 à ${TEXTE_MAX_CONTRAT}` }] }));
  const nombre = e.nombre === undefined ? VARIANTES_DEFAUT : e.nombre;
  if (typeof nombre !== 'number' || !Number.isInteger(nombre) || nombre < 1 || nombre > VARIANTES_MAX) return manuelle(erreurStudio('INVALID_SCHEMA', { traceId, violations: [{ chemin: 'nombre', raison: `de 1 à ${VARIANTES_MAX} variantes` }] }));
  const langue = typeof e.langue === 'string' && /^[a-z]{2}$/.test(e.langue) ? e.langue : 'fr';

  const pb = await projetEtBrief(ctx, e.projectId);
  if (!pb.ok) return manuelle(pb);
  const conflit = await conflitDeBase(ctx, pb.version, e.baseVersionId);
  if (conflit) return manuelle(conflit);
  if (!pb.brief) return manuelle(erreurStudio('MISSING_REFERENCE', { traceId, targetIds: [pb.projet.id], message: 'Ce projet n’a pas de brief lisible · les textes s’écrivent à partir du brief.' }));
  if (!deps.adaptateur) return manuelle(erreurStudio('UNSUPPORTED_CAPABILITY', { traceId, message: MESSAGE_TEXTES_SANS_FOURNISSEUR }));
  if (await deps.plafondAtteint()) return manuelle(erreurStudio('BUDGET_EXCEEDED', { traceId, message: 'Le plafond de dépense est atteint · rien n’est parti. Écris tes textes ci-dessous.' }));

  const entree = entreeEcriture({ brief: pb.brief, versionId: pb.version.id, type, maxCaracteres: max, nombre, langue });
  const r = await executerTache({
    templateKey: 'text.write',
    portee: { workspaceId: ctx.workspaceId, brandId: pb.projet.brandId },
    acteur: { userId: ctx.userId, traceId },
    taskInputs: entree.taskInputs,
    contexte: {
      language: langue, projectVersionId: pb.version.id, facts: entree.facts, invariants: entree.invariants,
      resolvedDocuments: entree.resolvedDocuments, allocatedIds: entree.allocatedIds,
      sources: sourcesCitees(pb.brief, lireReferencesSources(pb.projet.sourceRefs).sources, lireReferenceProduit((pb.version.content as { productRef?: unknown }).productRef)),
    },
    liens: { projectId: pb.projet.id, documentVersionId: pb.version.id },
    adaptateur: deps.adaptateur,
    environnement: deps.environnement,
  });
  if (!r.ok) {
    if (r.code === 'RELEASE_ACTIVE_ABSENTE') return manuelle(erreurStudio('UNSUPPORTED_CAPABILITY', { traceId, message: MESSAGE_TEXTES_SANS_RELEASE }));
    if (r.code === 'UNSUPPORTED_CAPABILITY') return manuelle(erreurStudio('UNSUPPORTED_CAPABILITY', { traceId, message: MESSAGE_TEXTES_SANS_FOURNISSEUR }));
    if (r.code === 'BUDGET_EXCEEDED') return manuelle(erreurStudio('BUDGET_EXCEEDED', { traceId }));
    if (r.code === 'PROVIDER_ERROR') return manuelle(erreurStudio('PROVIDER_UNCERTAIN', { traceId, message: 'Le fournisseur n’a pas répondu · rien n’est relancé automatiquement. Écris tes textes ou réessaie plus tard.' }));
    return manuelle(erreurStudio('INVALID_SCHEMA', { traceId, message: 'La réponse reçue n’est pas exploitable · rien n’a été retenu. Écris tes textes ou réessaie.' }));
  }
  const sortie = r.sortie as { status: string; questions?: string[]; warnings?: string[]; result: unknown };
  const avertissements = (sortie.warnings ?? []).slice(0, 20);
  if (sortie.status !== 'ready' || !sortie.result) {
    return { ok: true, statut: 'questions', versionId: pb.version.id, type, questions: (sortie.questions ?? []).slice(0, 5), avertissements, runId: r.runId };
  }
  const { variantes, ecartees } = relireVariantes(sortie.result, { brief: pb.brief, type, maxCaracteres: max, langue });
  return { ok: true, statut: 'proposees', versionId: pb.version.id, type, variantes, ecartees, avertissements, runId: r.runId };
}
