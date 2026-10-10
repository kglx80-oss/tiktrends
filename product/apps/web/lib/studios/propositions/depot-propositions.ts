import 'server-only';
import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db, schema } from '@tiktrends/db';
import {
  objetDansPortee, erreurStudio, differencesDetaillees, empreinteContenu, etatACreation, etatEffectif, expirationProposition,
  deciderApplication, deciderRejet, lireCible, libelleCible, libelleCibleEtVersion, changementsLisibles, impactProposition,
  libelleNoeud, ciblesDisponibles, champsEditables, LIBELLES_ETAT, LIBELLES_ORIGINE, SCHEMA_VERSION_CONTENU,
  type ContenuVersion, type ErreurStudio, type EstimationNonExecutoire, type PlanImpact, type PropositionConstruite,
  type EtatProposition, type DisponibiliteJarvis,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { ajouterAudit } from '../audit';
import { estUuid } from '../depot';
import type { BaseStudio, ExecStudio } from '../execution/types';
import type { CiblePresentee, ImpactPresente, ListePropositions, OrigineProposition, PropositionPresentee, ResultatApplication } from './types';

/**
 * Dépôt des propositions · lecture, stockage, application, rejet.
 *
 * ── Portée ───────────────────────────────────────────────────────────────────
 *
 * Même double garde que `depot.ts` et `commandes.ts` : chaque requête filtre
 * `workspace_id` ET `brand_id IN (marques visibles)`, chaque ligne revenue est
 * revérifiée par `objetDansPortee`. Hors portée ⇒ `NOT_FOUND` neutre.
 *
 * ── Ce qu'une proposition ne fait jamais ─────────────────────────────────────
 *
 * Stocker ou appliquer une proposition n'écrit NI devis, NI job, NI débit, NI
 * registre : appliquer crée une version du document (compare-and-set sur la
 * version de base et `row_version`), passe la proposition `approved` et
 * journalise. La génération reste un geste distinct (devis L3).
 *
 * `base` est le client drizzle (par défaut `db`) · le test de concurrence en
 * passe un par connexion Postgres.
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

class Refus extends Error {
  constructor(public readonly erreur: ErreurStudio) { super(erreur.code); }
}

/** Recopie de `depot.ts` (non exporté) · `false` si la session ne voit aucune marque. */
function porteeSql(t: { workspaceId: PgColumn; brandId: PgColumn }, ctx: ContexteStudio): SQL {
  if (ctx.marques.length === 0) return sql`false`;
  return and(eq(t.workspaceId, ctx.workspaceId), inArray(t.brandId, ctx.marques))!;
}

function horsPortee(ctx: ContexteStudio, l: { workspaceId: string; brandId: string } | undefined): boolean {
  return !l || !objetDansPortee(
    { workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque },
    l,
  );
}

const introuvable = (ctx: ContexteStudio) => erreurStudio('NOT_FOUND', { traceId: ctx.traceId });

function echecPersistance(ctx: ContexteStudio, e: unknown): ErreurStudio {
  console.error(`[studios:l4a] ${ctx.traceId} persistance`, e instanceof Error ? e.message : e);
  return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId });
}

const P = schema.studioProjects;
const V = schema.studioProjectVersions;
const PR = schema.studioProposals;
const IP = schema.studioImpactPlans;
const J = schema.studioJobs;

export type Projet = typeof P.$inferSelect;
export type Version = typeof V.$inferSelect;
export type LigneProposition = typeof PR.$inferSelect;
type LignePlan = typeof IP.$inferSelect;

/* ──────────────────────────────── Lectures ───────────────────────────────── */

export async function projetEtCourante(ex: ExecStudio, ctx: ContexteStudio, projectId: unknown): Promise<Resultat<{ projet: Projet; courante: Version }>> {
  if (!estUuid(projectId)) return introuvable(ctx);
  const [projet] = await ex.select().from(P).where(and(eq(P.id, projectId), porteeSql(P, ctx))).limit(1);
  if (horsPortee(ctx, projet) || !projet!.currentVersionId) return introuvable(ctx);
  const [courante] = await ex.select().from(V).where(and(eq(V.id, projet!.currentVersionId), eq(V.projectId, projet!.id), porteeSql(V, ctx))).limit(1);
  if (horsPortee(ctx, courante)) return introuvable(ctx);
  return { ok: true, projet: projet!, courante: courante! };
}

/** Version d'un projet par id · `null` si inconnue pour ce projet (ou hors portée). */
export async function versionDuProjet(ex: ExecStudio, ctx: ContexteStudio, projectId: string, versionId: unknown): Promise<Version | null> {
  if (!estUuid(versionId)) return null;
  const [v] = await ex.select().from(V).where(and(eq(V.id, versionId), eq(V.projectId, projectId), porteeSql(V, ctx))).limit(1);
  return v && !horsPortee(ctx, v) ? v : null;
}

/**
 * 409 si la base que l'écran envoie n'est plus la version courante · avant
 * tout appel modèle : on ne paie pas une proposition déjà périmée.
 */
export async function conflitSiPerimee(ex: ExecStudio, ctx: ContexteStudio, projet: Projet, courante: Version, baseVersionId: unknown): Promise<ErreurStudio | null> {
  if (!estUuid(baseVersionId)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version de base obligatoire' }] });
  if (baseVersionId === courante.id) return null;
  const base = await versionDuProjet(ex, ctx, projet.id, baseVersionId);
  if (!base) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version inconnue pour ce projet' }] });
  return erreurStudio('VERSION_CONFLICT', {
    traceId: ctx.traceId, targetIds: [projet.id, courante.id],
    conflit: { versionCouranteId: courante.id, differences: differencesDetaillees(base.content, courante.content) },
  });
}

/** Sorties livrées pour une version (job `completed` de cette version) · même règle que L3. */
export async function sortiesExistantes(ex: ExecStudio, ctx: ContexteStudio, projectId: string, versionId: string): Promise<string[]> {
  const jobs = await ex.select({ result: J.result }).from(J)
    .where(and(eq(J.projectId, projectId), eq(J.projectVersionId, versionId), eq(J.state, 'completed'), porteeSql(J, ctx)));
  const s = new Set<string>();
  for (const j of jobs) for (const op of Object.keys((j.result as { assets?: Record<string, string> } | null)?.assets ?? {})) s.add(op);
  return [...s];
}

/* ──────────────────────────────── Présentation ───────────────────────────── */

/** Un nœud du graphe L1 : `prefixe:<id>` est une génération, un nom seul un calcul déterministe. */
function noeuds(ids: Array<string | { id: string; nature: 'generation' | 'calcul' }>, contenu: ContenuVersion | null) {
  return ids.map((x) => {
    const id = typeof x === 'string' ? x : x.id;
    const nature: 'generation' | 'calcul' = typeof x === 'string' ? (id.includes(':') ? 'generation' : 'calcul') : x.nature;
    return { id, libelle: libelleNoeud(id, contenu), nature };
  });
}

function impactPresente(plan: LignePlan | undefined, estimation: Partial<EstimationNonExecutoire> | null, contenu: ContenuVersion | null): ImpactPresente | null {
  if (!plan) return null;
  return {
    planId: plan.id,
    planHash: plan.planHash,
    aRefaire: noeuds(plan.redo as Array<{ id: string; nature: 'generation' | 'calcul' }>, contenu),
    reutilisees: noeuds(plan.reused as string[], contenu),
    obsoletes: noeuds(plan.obsolete as string[], contenu),
    touchees: noeuds(estimation?.touchees ?? [], contenu),
    creditsIndicatifs: typeof estimation?.creditsIndicatifs === 'number' ? estimation.creditsIndicatifs : 0,
    nonTarifees: (estimation?.nonTarifees ?? []).map((id) => libelleNoeud(id, contenu)),
  };
}

export function presenter(l: LigneProposition, versions: ReadonlyMap<string, Version>, courante: Version, plan: LignePlan | undefined, maintenant: Date): PropositionPresentee {
  const base = versions.get(l.baseVersionId) ?? null;
  const contenuBase = (base?.content ?? null) as ContenuVersion | null;
  const cible = lireCible(l.target);
  const etat = etatEffectif({ state: l.state as EtatProposition, expiresAt: l.expiresAt }, maintenant);
  const appliquee = l.appliedVersionId ? versions.get(l.appliedVersionId) ?? null : null;
  const n = base?.n ?? 0;
  return {
    id: l.id,
    projectId: l.projectId,
    origine: l.origin as OrigineProposition,
    libelleOrigine: LIBELLES_ORIGINE[l.origin as OrigineProposition] ?? l.origin,
    etat,
    libelleEtat: LIBELLES_ETAT[etat],
    cible: l.target,
    libelleCible: cible ? libelleCible(cible, contenuBase) : l.target,
    baseVersion: { id: l.baseVersionId, n },
    libelleCibleVersion: cible ? libelleCibleEtVersion(cible, contenuBase, n) : `${l.target} · version ${n}`,
    perimee: etat === 'proposed' && l.baseVersionId !== courante.id,
    changements: cible ? changementsLisibles(cible, contenuBase, l.changes) : [],
    explication: l.explanation,
    sources: Array.isArray(l.sourceIds) ? (l.sourceIds as unknown[]).filter((s): s is string => typeof s === 'string') : [],
    impact: impactPresente(plan, l.estimatedCosts as Partial<EstimationNonExecutoire> | null, contenuBase),
    creeLe: l.createdAt.toISOString(),
    expireLe: l.expiresAt ? l.expiresAt.toISOString() : null,
    decideLe: l.decidedAt ? l.decidedAt.toISOString() : null,
    versionAppliquee: appliquee ? { id: appliquee.id, n: appliquee.n } : null,
  };
}

/** Versions et plans d'impact (au moment de la proposition) des lignes données · portée filtrée. */
async function contexteDePresentation(ex: ExecStudio, ctx: ContexteStudio, projectId: string, lignes: LigneProposition[], courante: Version) {
  const idsVersions = [...new Set(lignes.flatMap((l) => [l.baseVersionId, l.appliedVersionId]).filter((x): x is string => !!x))];
  const versions = new Map<string, Version>([[courante.id, courante]]);
  if (idsVersions.length) {
    const vs = await ex.select().from(V).where(and(eq(V.projectId, projectId), inArray(V.id, idsVersions), porteeSql(V, ctx)));
    for (const v of vs) if (!horsPortee(ctx, v)) versions.set(v.id, v);
  }
  const plans = new Map<string, LignePlan>();
  const idsProps = lignes.map((l) => l.id);
  if (idsProps.length) {
    const ps = await ex.select().from(IP).where(and(inArray(IP.proposalId, idsProps), isNull(IP.toVersionId), porteeSql(IP, ctx)));
    for (const p of ps) if (p.proposalId && !horsPortee(ctx, p)) plans.set(p.proposalId, p);
  }
  return { versions, plans };
}

export interface OptionsListe {
  jarvis: DisponibiliteJarvis;
  maintenant?: Date;
  limite?: number;
}

/** LECTURE PURE · aucune écriture, aucune préparation cachée, aucune expiration écrite. */
export async function listerPropositions(ctx: ContexteStudio, e: { projectId: unknown }, o: OptionsListe, base: BaseStudio = db): Promise<Resultat<ListePropositions>> {
  const pc = await projetEtCourante(base, ctx, e.projectId);
  if (!pc.ok) return pc;
  const { projet, courante } = pc;
  const limite = Math.min(Math.max(1, Math.trunc(o.limite ?? 50)), 100);
  const lignes = (await base.select().from(PR).where(and(eq(PR.projectId, projet.id), porteeSql(PR, ctx))).orderBy(desc(PR.createdAt)).limit(limite))
    .filter((l) => !horsPortee(ctx, l));
  const { versions, plans } = await contexteDePresentation(base, ctx, projet.id, lignes, courante);
  const maintenant = o.maintenant ?? new Date();
  const contenu = courante.content as ContenuVersion;
  const cibles: CiblePresentee[] = ciblesDisponibles(contenu).map((c) => {
    const lue = lireCible(c.cible);
    return { ...c, champs: lue ? champsEditables(lue, contenu) : [] };
  });
  return {
    ok: true,
    projectId: projet.id,
    versionCourante: { id: courante.id, n: courante.n },
    propositions: lignes.map((l) => presenter(l, versions, courante, plans.get(l.id), maintenant)),
    jarvis: o.jarvis,
    peutProposer: ctx.permissions.espace.has('studio.propose'),
    cibles,
  };
}

/** LECTURE PURE · une proposition, par id, dans la portée. */
export async function inspecterProposition(ctx: ContexteStudio, e: { proposalId: unknown }, base: BaseStudio = db, maintenant = new Date()): Promise<Resultat<{ projectId: string; versionCourante: { id: string; n: number }; proposition: PropositionPresentee }>> {
  if (!estUuid(e.proposalId)) return introuvable(ctx);
  const [l] = await base.select().from(PR).where(and(eq(PR.id, e.proposalId), porteeSql(PR, ctx))).limit(1);
  if (horsPortee(ctx, l)) return introuvable(ctx);
  const pc = await projetEtCourante(base, ctx, l!.projectId);
  if (!pc.ok) return pc;
  const { versions, plans } = await contexteDePresentation(base, ctx, pc.projet.id, [l!], pc.courante);
  return { ok: true, projectId: pc.projet.id, versionCourante: { id: pc.courante.id, n: pc.courante.n }, proposition: presenter(l!, versions, pc.courante, plans.get(l!.id), maintenant) };
}

/* ──────────────────────────────── Stockage ───────────────────────────────── */

export interface EntreeStockage {
  projet: Projet;
  baseVersion: Version;
  construite: PropositionConstruite;
  origine: OrigineProposition;
  /** Pour l'audit · trace du registre (`studio_prompt_runs`), clé de tâche. */
  details?: Record<string, unknown>;
  maintenant?: Date;
}

/**
 * Stocke UNE proposition `proposed` et son plan d'impact calculé SERVEUR, plus
 * l'audit, dans une transaction. Aucun devis, aucun job, aucun débit.
 */
export async function stockerProposition(ctx: ContexteStudio, e: EntreeStockage, base: BaseStudio = db): Promise<Resultat<{ proposition: PropositionPresentee }>> {
  const maintenant = e.maintenant ?? new Date();
  const creation = etatACreation();
  if (!creation.verdict.ok) return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, message: creation.verdict.raison });
  try {
    return await base.transaction(async (tx) => {
      // La portée est relue ici, avec le contexte de l'appelant : un projet
      // sorti de la portée entre-temps n'accueille rien.
      const pc = await projetEtCourante(tx, ctx, e.projet.id);
      if (!pc.ok) throw new Refus(pc);
      const baseV = await versionDuProjet(tx, ctx, pc.projet.id, e.baseVersion.id);
      if (!baseV) throw new Refus(introuvable(ctx));
      const contenuBase = baseV.content as ContenuVersion;
      const existantes = await sortiesExistantes(tx, ctx, pc.projet.id, baseV.id);
      const { plan, estimation } = impactProposition(contenuBase, e.construite.contenuApres, existantes);

      const [ligne] = await tx.insert(PR).values({
        workspaceId: pc.projet.workspaceId, brandId: pc.projet.brandId, projectId: pc.projet.id,
        target: e.construite.target, baseVersionId: baseV.id, allowedPaths: e.construite.allowedPaths,
        changes: e.construite.changes, explanation: e.construite.explanation, sourceIds: e.construite.sourceIds,
        estimatedCosts: estimation, state: creation.etat, origin: e.origine, expiresAt: expirationProposition(maintenant),
        createdBy: ctx.userId,
      }).returning();
      const [lp] = await tx.insert(IP).values(planVersLigne(pc.projet, ctx, plan, baseV.id, null, ligne!.id)).returning();
      await ajouterAudit(tx, ctx, {
        action: 'proposal.create', brandId: pc.projet.brandId, targetType: 'studio_proposal', targetId: ligne!.id,
        versionBefore: baseV.id, versionAfter: null, reason: e.origine === 'jarvis' ? 'proposition de Jarvis' : 'proposition saisie',
        details: { origine: e.origine, cible: e.construite.target, chemins: e.construite.changes.map((c) => c.path).slice(0, 100), planHash: plan.empreinte, ...(e.details ?? {}) },
      });
      const versions = new Map<string, Version>([[baseV.id, baseV], [pc.courante.id, pc.courante]]);
      return { ok: true as const, proposition: presenter(ligne!, versions, pc.courante, lp, maintenant) };
    });
  } catch (err) {
    if (err instanceof Refus) return err.erreur;
    return echecPersistance(ctx, err);
  }
}

function planVersLigne(projet: Projet, ctx: ContexteStudio, plan: PlanImpact, depuis: string, vers: string | null, proposalId: string) {
  return {
    workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id, proposalId,
    fromVersionId: depuis, toVersionId: vers, changedInputs: plan.entreesModifiees, reused: plan.reutilisees,
    obsolete: plan.obsoletes, redo: plan.aRefaire, planHash: plan.empreinte, createdBy: ctx.userId,
  };
}

/* ─────────────────────────────── Application ─────────────────────────────── */

export interface EntreeApplication { proposalId: unknown; projectId?: unknown; baseVersionId?: unknown }

const messageEtat = (raison: string) => `Cette ${raison} · elle ne peut plus être appliquée. Demande une nouvelle proposition sur la version courante.`;

/**
 * Applique une proposition · nouvelle version IMMUABLE par compare-and-set.
 *
 * Verrous dans cet ordre : la proposition (deux clics sur la même ne passent
 * qu'une fois), puis le projet (deux propositions sur la même base : la
 * seconde voit la nouvelle version et rend 409). Aucune génération.
 */
export async function appliquerProposition(ctx: ContexteStudio, e: EntreeApplication, base: BaseStudio = db, maintenant = new Date()): Promise<Resultat<ResultatApplication>> {
  if (!estUuid(e.proposalId)) return introuvable(ctx);
  if (e.projectId !== undefined && !estUuid(e.projectId)) return introuvable(ctx);
  if (e.baseVersionId !== undefined && e.baseVersionId !== null && !estUuid(e.baseVersionId)) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'identifiant de version attendu' }] });
  }
  const proposalId = e.proposalId;
  try {
    return await base.transaction(async (tx) => {
      const [l] = await tx.select().from(PR).where(and(eq(PR.id, proposalId), porteeSql(PR, ctx))).limit(1).for('update');
      if (horsPortee(ctx, l)) throw new Refus(introuvable(ctx));
      // FLOW-03 · l'écran applique sur SON projet ; une proposition d'un autre projet n'existe pas pour lui.
      if (e.projectId !== undefined && l!.projectId !== e.projectId) throw new Refus(introuvable(ctx));
      const [projet] = await tx.select().from(P).where(and(eq(P.id, l!.projectId), porteeSql(P, ctx))).limit(1).for('update');
      if (horsPortee(ctx, projet) || !projet!.currentVersionId) throw new Refus(introuvable(ctx));
      const [courante] = await tx.select().from(V).where(and(eq(V.id, projet!.currentVersionId), eq(V.projectId, projet!.id), porteeSql(V, ctx))).limit(1);
      if (!courante) throw new Refus(introuvable(ctx));
      const baseV = l!.baseVersionId === courante.id ? courante : await versionDuProjet(tx, ctx, projet!.id, l!.baseVersionId);

      const d = deciderApplication(
        {
          id: l!.id, workspaceId: l!.workspaceId, brandId: l!.brandId, projectId: l!.projectId, target: l!.target,
          baseVersionId: l!.baseVersionId, allowedPaths: l!.allowedPaths, changes: l!.changes,
          state: l!.state as EtatProposition, expiresAt: l!.expiresAt, appliedVersionId: l!.appliedVersionId,
        },
        {
          workspaceId: projet!.workspaceId, brandId: projet!.brandId, projectId: projet!.id,
          versionCouranteId: courante.id, contenuCourant: courante.content as ContenuVersion, contenuBase: (baseV?.content ?? null) as ContenuVersion | null,
        },
        maintenant,
        typeof e.baseVersionId === 'string' ? e.baseVersionId : null,
      );

      if (!d.ok) {
        switch (d.motif) {
          case 'PORTEE': throw new Refus(introuvable(ctx));
          case 'DEJA_APPLIQUEE': {
            const v = await versionDuProjet(tx, ctx, projet!.id, d.appliedVersionId);
            const versions = new Map<string, Version>([[courante.id, courante]]);
            if (v) versions.set(v.id, v);
            if (baseV) versions.set(baseV.id, baseV);
            const plan = await planDeProposition(tx, ctx, l!.id);
            return { ok: true as const, projectId: projet!.id, deja: true, version: { id: d.appliedVersionId, n: v?.n ?? 0 }, proposition: presenter(l!, versions, courante, plan, maintenant) };
          }
          case 'ETAT': {
            if (d.etat === 'expired' && l!.state === 'proposed') await expirer(tx, ctx, l!, maintenant);
            // L'expiration écrite est conservée (commit) ; le geste est refusé.
            return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, targetIds: [l!.id], message: messageEtat(d.raison) });
          }
          case 'VERSION_CONFLICT':
            throw new Refus(erreurStudio('VERSION_CONFLICT', {
              traceId: ctx.traceId, targetIds: [projet!.id, courante.id],
              message: 'Le projet a changé depuis cette proposition · recharge la version courante, puis redemande une proposition.',
              conflit: { versionCouranteId: d.versionCouranteId, differences: d.differences },
            }));
          case 'INVALIDE':
            throw new Refus(erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, targetIds: [l!.id], violations: d.violations }));
        }
      }

      const empreinte = empreinteContenu(d.resultat);
      let nouvelle: Version = courante;
      if (empreinte !== courante.contentHash) {
        const [v] = await tx.insert(V).values({
          projectId: projet!.id, workspaceId: projet!.workspaceId, brandId: projet!.brandId, parentId: courante.id,
          n: courante.n + 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: d.resultat, contentHash: empreinte,
          promptReleaseId: null, authorId: ctx.userId, reason: `proposition ${l!.id}`.slice(0, 2000),
        }).returning();
        nouvelle = v!;
        // Compare-and-set sur row_version · ceinture en plus du verrou.
        const maj = await tx.update(P)
          .set({ currentVersionId: nouvelle.id, rowVersion: projet!.rowVersion + 1, updatedAt: new Date() })
          .where(and(eq(P.id, projet!.id), eq(P.rowVersion, projet!.rowVersion), eq(P.currentVersionId, courante.id), porteeSql(P, ctx)))
          .returning({ id: P.id });
        if (maj.length !== 1) {
          throw new Refus(erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [projet!.id], conflit: { versionCouranteId: courante.id, differences: [] } }));
        }
      }
      const [approuvee] = await tx.update(PR)
        .set({ state: 'approved', appliedVersionId: nouvelle.id, decidedBy: ctx.userId, decidedAt: maintenant, rowVersion: l!.rowVersion + 1 })
        .where(and(eq(PR.id, l!.id), eq(PR.state, 'proposed'), eq(PR.rowVersion, l!.rowVersion), porteeSql(PR, ctx)))
        .returning();
      if (!approuvee) throw new Refus(erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [l!.id], conflit: { versionCouranteId: courante.id, differences: [] } }));

      const existantes = await sortiesExistantes(tx, ctx, projet!.id, courante.id);
      const { plan } = impactProposition(courante.content as ContenuVersion, d.resultat, existantes);
      if (nouvelle.id !== courante.id) await tx.insert(IP).values(planVersLigne(projet!, ctx, plan, courante.id, nouvelle.id, l!.id));
      if (nouvelle.id !== courante.id) {
        await ajouterAudit(tx, ctx, {
          action: 'project.version.create', brandId: projet!.brandId, targetType: 'studio_project', targetId: projet!.id,
          versionBefore: courante.id, versionAfter: nouvelle.id, reason: `application de la proposition ${l!.id}`,
          details: { chemins: d.cheminsModifies.slice(0, 100), proposalId: l!.id },
        });
      }
      await ajouterAudit(tx, ctx, {
        action: 'proposal.apply', brandId: projet!.brandId, targetType: 'studio_proposal', targetId: l!.id,
        versionBefore: courante.id, versionAfter: nouvelle.id, reason: 'proposition appliquée',
        details: { cible: l!.target, origine: l!.origin, inchange: nouvelle.id === courante.id, planHash: plan.empreinte },
      });
      const versions = new Map<string, Version>([[courante.id, courante], [nouvelle.id, nouvelle]]);
      const planPropose = await planDeProposition(tx, ctx, l!.id);
      return { ok: true as const, projectId: projet!.id, deja: false, version: { id: nouvelle.id, n: nouvelle.n }, proposition: presenter(approuvee, versions, nouvelle, planPropose, maintenant) };
    });
  } catch (err) {
    if (err instanceof Refus) return err.erreur;
    return echecPersistance(ctx, err);
  }
}

async function planDeProposition(ex: ExecStudio, ctx: ContexteStudio, proposalId: string): Promise<LignePlan | undefined> {
  const [p] = await ex.select().from(IP).where(and(eq(IP.proposalId, proposalId), isNull(IP.toVersionId), porteeSql(IP, ctx))).limit(1);
  return p && !horsPortee(ctx, p) ? p : undefined;
}

/** `proposed → expired` par le système, par compare-and-set, journalisé. */
async function expirer(ex: ExecStudio, ctx: ContexteStudio, l: LigneProposition, maintenant: Date): Promise<void> {
  const maj = await ex.update(PR).set({ state: 'expired', decidedAt: maintenant, rowVersion: l.rowVersion + 1 })
    .where(and(eq(PR.id, l.id), eq(PR.state, 'proposed'), eq(PR.rowVersion, l.rowVersion), porteeSql(PR, ctx))).returning({ id: PR.id });
  if (maj.length === 1) {
    await ajouterAudit(ex, ctx, { action: 'proposal.expire', brandId: l.brandId, targetType: 'studio_proposal', targetId: l.id, reason: 'échéance passée' });
  }
}

/* ──────────────────────────────── Rejet ──────────────────────────────────── */

export async function rejeterProposition(ctx: ContexteStudio, e: { proposalId: unknown; projectId?: unknown; raison?: unknown }, base: BaseStudio = db, maintenant = new Date()): Promise<Resultat<{ projectId: string; proposition: PropositionPresentee }>> {
  if (!estUuid(e.proposalId)) return introuvable(ctx);
  if (e.projectId !== undefined && !estUuid(e.projectId)) return introuvable(ctx);
  const proposalId = e.proposalId;
  try {
    return await base.transaction(async (tx) => {
      const [l] = await tx.select().from(PR).where(and(eq(PR.id, proposalId), porteeSql(PR, ctx))).limit(1).for('update');
      if (horsPortee(ctx, l)) throw new Refus(introuvable(ctx));
      if (e.projectId !== undefined && l!.projectId !== e.projectId) throw new Refus(introuvable(ctx));
      const pc = await projetEtCourante(tx, ctx, l!.projectId);
      if (!pc.ok) throw new Refus(pc);
      const d = deciderRejet({ state: l!.state as EtatProposition, expiresAt: l!.expiresAt }, maintenant);
      if (!d.ok) {
        if (d.etat === 'expired' && l!.state === 'proposed') await expirer(tx, ctx, l!, maintenant);
        return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, targetIds: [l!.id], message: `Cette ${d.raison} · rien à rejeter.` });
      }
      const [maj] = await tx.update(PR).set({ state: 'rejected', decidedBy: ctx.userId, decidedAt: maintenant, rowVersion: l!.rowVersion + 1 })
        .where(and(eq(PR.id, l!.id), eq(PR.state, 'proposed'), eq(PR.rowVersion, l!.rowVersion), porteeSql(PR, ctx))).returning();
      if (!maj) throw new Refus(erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [l!.id] }));
      await ajouterAudit(tx, ctx, {
        action: 'proposal.reject', brandId: l!.brandId, targetType: 'studio_proposal', targetId: l!.id,
        reason: typeof e.raison === 'string' ? e.raison.slice(0, 2000) : 'proposition rejetée',
      });
      const versions = new Map<string, Version>([[pc.courante.id, pc.courante]]);
      const baseV = await versionDuProjet(tx, ctx, pc.projet.id, l!.baseVersionId);
      if (baseV) versions.set(baseV.id, baseV);
      return { ok: true as const, projectId: pc.projet.id, proposition: presenter(maj, versions, pc.courante, await planDeProposition(tx, ctx, l!.id), maintenant) };
    });
  } catch (err) {
    if (err instanceof Refus) return err.erreur;
    return echecPersistance(ctx, err);
  }
}
