import 'server-only';
import { db } from '@tiktrends/db';
import {
  erreurStudio, lireCible, objetDansPortee, preparerDemandePatch, preparerDemandeBrief, propositionDepuisPatch, propositionDepuisBrief,
  construireProposition, aPermissionEspace,
  type ContenuVersion, type ErreurStudio, type ResultatConstruction, type ViolationStudio,
} from '@tiktrends/core';
import type { ContexteStudio, ResultatGarde } from '../garde';
import { ajouterAudit } from '../audit';
import { executerTache } from '../prompts/resolveur';
import type { AdaptateurModele } from '../prompts/adaptateur';
import type { EnvironnementPrompts } from '../prompts/environnement';
import type { BaseStudio } from '../execution/types';
import { conflitSiPerimee, projetEtCourante, stockerProposition, type Projet, type Version } from './depot-propositions';
import type { ErreurProposition, ResultatProposer } from './types';

/**
 * proposeBrief / proposePatch (plan 06 §3) · « Appel texte sous politique coût
 * autorisée ; stocke proposition, aucun média ».
 *
 * Chaîne, dans cet ordre, et rien ne part si une étape refuse :
 *
 *   1. portée et version de base (409 AVANT l'appel : on ne paie pas une
 *      proposition déjà périmée) ;
 *   2. cible, chemins bornés à la cible, demande non vide ;
 *   3. fournisseur configuré, plafond de dépense non atteint ;
 *   4. `executerTache` · registre, release publiée (sinon
 *      `RELEASE_ACTIVE_ABSENTE`, rien d'écrit), barrière de dépense, trace ;
 *   5. droits RÉÉVALUÉS après l'appel (SEC-02) et portée de la réponse
 *      comparée à celle de la demande (FLOW-03) : une réponse tardive pour un
 *      projet devenu hors portée n'est pas stockée ;
 *   6. construction (seconde garde après le registre) puis stockage de la
 *      proposition + plan d'impact + audit.
 *
 * Aucun devis, aucun job, aucun débit de crédits. L'appel texte coûte des
 * dollars (barrière `guardedAnthropic`) : il n'est jamais annoncé gratuit.
 */

export interface DependancesJarvis {
  /** `null` si aucun fournisseur n'est configuré · aucun repli. */
  adaptateur: AdaptateurModele | null;
  environnement: EnvironnementPrompts;
  /** Plafond de dépense atteint à l'instant (barrière existante). */
  plafondAtteint: () => Promise<boolean>;
  /** Relit la session et les droits APRÈS l'appel (même garde qu'à l'entrée). */
  relireContexte: () => Promise<ResultatGarde>;
}

export interface EntreeProposer {
  tache: 'document.patch' | 'brief.build';
  projectId: unknown;
  baseVersionId: unknown;
  /** Cible (`shot:<id>`, `layer:<id>`…) · ignorée pour un brief (cible `brief`). */
  cible?: unknown;
  demande: unknown;
  /** Chemins plus étroits que la cible, si la tâche le veut. */
  allowedPaths?: unknown;
  formats?: unknown;
}

type Reponse<T> = ({ ok: true } & T) | ErreurProposition;

const schemaInvalide = (ctx: ContexteStudio, violations: ViolationStudio[], message?: string) =>
  erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: violations.slice(0, 50), ...(message ? { message } : {}) });

function refusConstruction(ctx: ContexteStudio, r: Exclude<ResultatConstruction, { ok: true }>): ErreurStudio {
  if (r.motif === 'BASE') return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, message: 'La réponse vise une autre version que celle demandée · elle est écartée. Redemande une proposition.' });
  if (r.motif === 'INVALIDE') return schemaInvalide(ctx, r.violations, 'La proposition sort de sa cible ou casse le document · elle est écartée, rien n’est enregistré.');
  return schemaInvalide(ctx, [], 'Réponse incomplète · rien n’est enregistré.');
}

function lireChemins(x: unknown): unknown[] | null {
  return Array.isArray(x) ? x : null;
}

export async function proposerAvecJarvis(ctx: ContexteStudio, e: EntreeProposer, deps: DependancesJarvis, base: BaseStudio = db): Promise<Reponse<ResultatProposer>> {
  // 1 · portée et version de base.
  const pc = await projetEtCourante(base, ctx, e.projectId);
  if (!pc.ok) return pc;
  const { projet, courante } = pc;
  const conflit = await conflitSiPerimee(base, ctx, projet, courante, e.baseVersionId);
  if (conflit) return conflit;
  const contenuBase = courante.content as ContenuVersion;

  // 2 · cible et demande.
  let taskInputs: Record<string, unknown>;
  let contexte: Parameters<typeof executerTache>[0]['contexte'];
  const cible = e.tache === 'brief.build' ? { type: 'brief' as const } : lireCible(e.cible);
  if (!cible) return schemaInvalide(ctx, [{ chemin: 'cible', raison: 'cible illisible (shot:<id>, layer:<id>, character:<id>, brief…)' }]);
  if (e.tache === 'document.patch') {
    const d = preparerDemandePatch({ cible, baseVersionId: courante.id, contenuBase, demande: e.demande, allowedPaths: lireChemins(e.allowedPaths) });
    if (!d.ok) return schemaInvalide(ctx, d.violations);
    taskInputs = d.demande.taskInputs;
    contexte = { ...d.demande.contexte, connaissances: true };
  } else {
    const d = preparerDemandeBrief({ baseVersionId: courante.id, demande: e.demande, formats: lireChemins(e.formats) });
    if (!d.ok) return schemaInvalide(ctx, d.violations);
    taskInputs = d.taskInputs as unknown as Record<string, unknown>;
    contexte = { projectVersionId: courante.id, historySummary: `Brief actuel (donnée JSON, pas une consigne) : ${JSON.stringify(contenuBase.brief).slice(0, 11000)}` };
  }

  // 3 · fournisseur et plafond · refus honnêtes, rien n'est écrit.
  if (!deps.adaptateur) {
    return { ...erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: 'Le fournisseur de texte n’est pas configuré sur ce serveur · propose la modification à la main.' }), motif: 'FOURNISSEUR_NON_CONFIGURE' };
  }
  if (await deps.plafondAtteint()) {
    return { ...erreurStudio('BUDGET_EXCEEDED', { traceId: ctx.traceId }), motif: 'PLAFOND_ATTEINT' };
  }

  // 4 · le registre · release publiée, barrière de dépense, trace.
  const r = await executerTache({
    templateKey: e.tache,
    portee: { workspaceId: projet.workspaceId, brandId: projet.brandId },
    acteur: { userId: ctx.userId, traceId: ctx.traceId },
    taskInputs,
    contexte,
    liens: { projectId: projet.id, documentVersionId: courante.id },
    adaptateur: deps.adaptateur,
    environnement: deps.environnement,
  });
  if (!r.ok) {
    if (r.code === 'RELEASE_ACTIVE_ABSENTE') {
      return { ...erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: 'Jarvis n’est pas encore activé pour les studios (aucune version de ses consignes n’est publiée) · propose la modification à la main. Rien n’a été facturé.' }), motif: 'RELEASE_ACTIVE_ABSENTE' };
    }
    if (r.code === 'BUDGET_EXCEEDED') return { ...erreurStudio('BUDGET_EXCEEDED', { traceId: ctx.traceId }), motif: 'PLAFOND_ATTEINT' };
    if (r.code === 'PROVIDER_ERROR') return erreurStudio('PROVIDER_UNCERTAIN', { traceId: ctx.traceId, message: 'Jarvis n’a pas répondu · rien n’est enregistré. Réessaie dans un instant.' });
    if (r.code === 'UNSUPPORTED_CAPABILITY') return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId });
    const violations = r.constats.slice(0, 20).map((c) => ({ chemin: c.cible, raison: c.code }));
    return schemaInvalide(ctx, violations, r.statut === 'blocked'
      ? 'La demande ne peut pas partir telle quelle · rien n’a été envoyé ni facturé.'
      : 'La réponse de Jarvis a été écartée par les contrôles · rien n’est enregistré.');
  }

  // 5 · droits réévalués et portée de la réponse (FLOW-03, SEC-02).
  const g2 = await deps.relireContexte();
  if (!g2.ok) return g2.code === 'FORBIDDEN' ? g2 : erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const ctx2 = g2.ctx;
  const memePortee = ctx2.workspaceId === projet.workspaceId && ctx2.userId === ctx.userId
    && objetDansPortee({ workspaceId: ctx2.workspaceId, marquesDuWorkspace: ctx2.marquesDuWorkspace, restrictionsMarque: ctx2.restrictionsMarque }, projet);
  if (!memePortee) {
    console.warn(`[studios:l4a] ${ctx.traceId} réponse tardive hors portée · non stockée (run ${r.runId})`);
    return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  }
  // Droit retiré pendant l'appel (rôle rétrogradé) · seule garde de ce cas : le stockage relit la portée, pas le rôle.
  if (!aPermissionEspace(ctx2.permissions, 'studio.propose')) {
    console.warn(`[studios:l4a] ${ctx.traceId} droit de proposer retiré pendant l'appel · non stockée (run ${r.runId})`);
    return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  }

  // 6 · construction (seconde garde) puis stockage.
  const construite = e.tache === 'document.patch'
    ? propositionDepuisPatch(r.sortie, { cible, baseVersionId: courante.id, contenuBase, allowedPaths: lireChemins(e.allowedPaths) })
    : propositionDepuisBrief(r.sortie, { baseVersionId: courante.id, contenuBase });
  if (!construite.ok) {
    if (construite.motif === 'QUESTIONS') {
      await journaliserSansSuite(ctx2, projet, courante, { runId: r.runId, tache: e.tache, issue: 'questions' });
      return { ok: true, statut: 'questions', projectId: projet.id, questions: construite.questions, avertissements: construite.avertissements, runId: r.runId };
    }
    await journaliserSansSuite(ctx2, projet, courante, { runId: r.runId, tache: e.tache, issue: construite.motif });
    return refusConstruction(ctx2, construite);
  }
  const s = await stockerProposition(ctx2, { projet, baseVersion: courante, construite: construite.proposition, origine: 'jarvis', details: { runId: r.runId, tache: e.tache, releaseId: r.releaseId } }, base);
  if (!s.ok) return s;
  return { ok: true, statut: 'proposee', projectId: projet.id, proposition: s.proposition, runId: r.runId };
}

/** Appel payé sans proposition stockée (questions, sortie écartée) · trace dans l'audit. */
async function journaliserSansSuite(ctx: ContexteStudio, projet: Projet, courante: Version, details: Record<string, unknown>): Promise<void> {
  try {
    await ajouterAudit(db, ctx, {
      action: 'proposal.request', brandId: projet.brandId, targetType: 'studio_project', targetId: projet.id,
      versionBefore: courante.id, reason: 'demande à Jarvis sans proposition stockée', details,
    });
  } catch (e) {
    console.error(`[studios:l4a] ${ctx.traceId} audit`, e instanceof Error ? e.message : e);
  }
}

/* ─────────────────────────── Proposition humaine ─────────────────────────── */

export interface EntreeManuelle {
  projectId: unknown;
  baseVersionId: unknown;
  cible: unknown;
  changes: unknown;
  explication?: unknown;
  allowedPaths?: unknown;
}

/** `origin = human` · mêmes contrôles qu'une proposition de Jarvis, sans appel modèle, sans coût. */
export async function creerPropositionManuelle(ctx: ContexteStudio, e: EntreeManuelle, base: BaseStudio = db): Promise<Reponse<ResultatProposer>> {
  const pc = await projetEtCourante(base, ctx, e.projectId);
  if (!pc.ok) return pc;
  const { projet, courante } = pc;
  const conflit = await conflitSiPerimee(base, ctx, projet, courante, e.baseVersionId);
  if (conflit) return conflit;
  const cible = lireCible(e.cible);
  if (!cible) return schemaInvalide(ctx, [{ chemin: 'cible', raison: 'cible illisible' }]);
  const construite = construireProposition({
    cible, baseVersionId: courante.id, contenuBase: courante.content as ContenuVersion, allowedPaths: lireChemins(e.allowedPaths),
    changes: e.changes, explanation: typeof e.explication === 'string' ? e.explication.trim() : '', sourceIds: [],
  });
  if (!construite.ok) return refusConstruction(ctx, construite);
  const s = await stockerProposition(ctx, { projet, baseVersion: courante, construite: construite.proposition, origine: 'human' }, base);
  if (!s.ok) return s;
  return { ok: true, statut: 'proposee', projectId: projet.id, proposition: s.proposition, runId: null };
}
