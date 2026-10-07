import 'server-only';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db, schema } from '@tiktrends/db';
import {
  appliquerPatch, validerContenuVersion, empreinteContenu, differencesDetaillees, contenuVide,
  objetDansPortee, erreurStudio, estIdStable, SCHEMA_VERSION_CONTENU, CLES_CONTENU,
  type ContenuVersion, type ErreurStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from './garde';
import { ajouterAudit } from './audit';

/**
 * Dépôt des studios · lecture et écriture des projets, versions, dispositions,
 * et lecture des autres objets de portée (média, job, trace de prompt).
 *
 * ── La règle, dans CHAQUE requête ────────────────────────────────────────────
 *
 * Toute requête porte `workspace_id = <espace de la session>` ET
 * `brand_id IN <marques visibles>` (`porteeSql`). Une ligne revenue de la base
 * est revérifiée par la règle pure `objetDansPortee` (deux gardes valent mieux
 * qu'une : une requête mal écrite ne suffit pas à fuir). Hors portée, la
 * réponse est `NOT_FOUND`, identique à « n'existe pas ».
 *
 * Ce module ne vérifie pas les permissions (`gardeStudio` le fait avant) : il
 * garantit la PORTÉE, même appelé directement avec un contexte valide.
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const estUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x);

/** Chemins qu'un enregistrement de l'éditeur peut toucher · le contenu entier, par clé. */
export const CHEMINS_EDITEUR: readonly string[] = CLES_CONTENU.map((k) => `/${k}`);

const TITRE_MAX = 200;
const POSITIONS_MAX = 2000;
const KINDS = ['image', 'video', 'ads', 'text', 'campaign'] as const;
type KindProjet = (typeof KINDS)[number];

/** Filtre de portée SQL · `false` si la session ne voit aucune marque. */
function porteeSql(t: { workspaceId: PgColumn; brandId: PgColumn }, ctx: ContexteStudio): SQL {
  if (ctx.marques.length === 0) return sql`false`;
  return and(eq(t.workspaceId, ctx.workspaceId), inArray(t.brandId, ctx.marques))!;
}

const introuvable = (ctx: ContexteStudio) => erreurStudio('NOT_FOUND', { traceId: ctx.traceId });

function horsPortee(ctx: ContexteStudio, ligne: { workspaceId: string; brandId: string } | undefined): boolean {
  return !ligne || !objetDansPortee(
    { workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque },
    ligne,
  );
}

function echecPersistance(ctx: ContexteStudio, e: unknown): ErreurStudio {
  // Trace côté serveur avec l'identifiant de trace ; jamais de détail SQL au client.
  console.error(`[studios] ${ctx.traceId} persistance`, e instanceof Error ? e.message : e);
  return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId });
}

/* ───────────────────────────────── Lectures ──────────────────────────────── */

export type ProjetStudio = typeof schema.studioProjects.$inferSelect;
export type VersionStudio = typeof schema.studioProjectVersions.$inferSelect;
export type DispositionStudio = typeof schema.studioLayouts.$inferSelect;

export async function listerProjets(ctx: ContexteStudio, o: { brandId?: string | null; limite?: number } = {}): Promise<ProjetStudio[]> {
  const t = schema.studioProjects;
  const conds: SQL[] = [porteeSql(t, ctx)];
  if (o.brandId) {
    if (!ctx.marques.includes(o.brandId)) return [];
    conds.push(eq(t.brandId, o.brandId));
  }
  const limite = Math.min(Math.max(1, Math.trunc(o.limite ?? 50)), 200);
  const lignes = await db.select().from(t).where(and(...conds)).orderBy(desc(t.updatedAt)).limit(limite);
  return lignes.filter((l) => !horsPortee(ctx, l));
}

export async function lireProjet(ctx: ContexteStudio, id: unknown): Promise<Resultat<{ projet: ProjetStudio }>> {
  if (!estUuid(id)) return introuvable(ctx);
  const t = schema.studioProjects;
  const [p] = await db.select().from(t).where(and(eq(t.id, id), porteeSql(t, ctx))).limit(1);
  if (horsPortee(ctx, p)) return introuvable(ctx);
  return { ok: true, projet: p! };
}

export async function lireVersion(ctx: ContexteStudio, id: unknown): Promise<Resultat<{ version: VersionStudio }>> {
  if (!estUuid(id)) return introuvable(ctx);
  const t = schema.studioProjectVersions;
  const [v] = await db.select().from(t).where(and(eq(t.id, id), porteeSql(t, ctx))).limit(1);
  if (horsPortee(ctx, v)) return introuvable(ctx);
  return { ok: true, version: v! };
}

export async function lireDisposition(ctx: ContexteStudio, projectId: unknown): Promise<Resultat<{ disposition: DispositionStudio | null }>> {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  const t = schema.studioLayouts;
  const [l] = await db.select().from(t).where(and(eq(t.projectId, p.projet.id), porteeSql(t, ctx))).limit(1);
  if (l && horsPortee(ctx, l)) return introuvable(ctx);
  return { ok: true, disposition: l ?? null };
}

export async function lireAsset(ctx: ContexteStudio, id: unknown): Promise<Resultat<{ asset: typeof schema.studioAssets.$inferSelect }>> {
  if (!estUuid(id)) return introuvable(ctx);
  const t = schema.studioAssets;
  const [a] = await db.select().from(t).where(and(eq(t.id, id), porteeSql(t, ctx))).limit(1);
  if (horsPortee(ctx, a)) return introuvable(ctx);
  return { ok: true, asset: a! };
}

export async function lireJob(ctx: ContexteStudio, id: unknown): Promise<Resultat<{ job: typeof schema.studioJobs.$inferSelect }>> {
  if (!estUuid(id)) return introuvable(ctx);
  const t = schema.studioJobs;
  const [j] = await db.select().from(t).where(and(eq(t.id, id), porteeSql(t, ctx))).limit(1);
  if (horsPortee(ctx, j)) return introuvable(ctx);
  return { ok: true, job: j! };
}

/**
 * Trace d'exécution de prompt · portée d'abord, puis permission PLATEFORME
 * `run.inspect_redacted` : un membre de l'espace ne lit pas le prompt compilé.
 */
export async function lirePromptRun(ctx: ContexteStudio, id: unknown): Promise<Resultat<{ run: typeof schema.studioPromptRuns.$inferSelect }>> {
  if (!estUuid(id)) return introuvable(ctx);
  const t = schema.studioPromptRuns;
  const [r] = await db.select().from(t).where(and(eq(t.id, id), porteeSql(t, ctx))).limit(1);
  if (horsPortee(ctx, r)) return introuvable(ctx);
  if (!ctx.permissions.plateforme.has('run.inspect_redacted')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  return { ok: true, run: r! };
}

/* ───────────────────────────────── Écritures ─────────────────────────────── */

export interface EntreeCreation {
  brandId: unknown;
  kind: unknown;
  title: unknown;
  contenu?: unknown;
  raison?: unknown;
}

export async function creerProjet(ctx: ContexteStudio, e: EntreeCreation): Promise<Resultat<{ projet: ProjetStudio; version: VersionStudio }>> {
  if (!estUuid(e.brandId) || !ctx.marques.includes(e.brandId)) return introuvable(ctx);
  const violations: Array<{ chemin: string; raison: string }> = [];
  if (!(KINDS as readonly unknown[]).includes(e.kind)) violations.push({ chemin: 'kind', raison: `type parmi ${KINDS.join(', ')}` });
  const titre = typeof e.title === 'string' ? e.title.trim() : '';
  if (!titre || titre.length > TITRE_MAX) violations.push({ chemin: 'title', raison: `titre de 1 à ${TITRE_MAX} caractères` });
  const contenu = (e.contenu ?? contenuVide()) as ContenuVersion;
  violations.push(...validerContenuVersion(contenu));
  if (violations.length) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations });

  const brandId = e.brandId;
  try {
    return await db.transaction(async (tx) => {
      const [projet] = await tx.insert(schema.studioProjects).values({
        workspaceId: ctx.workspaceId, brandId, kind: e.kind as KindProjet, title: titre, ownerId: ctx.userId,
      }).returning();
      const [version] = await tx.insert(schema.studioProjectVersions).values({
        projectId: projet!.id, workspaceId: ctx.workspaceId, brandId, parentId: null, n: 1,
        schemaVersion: SCHEMA_VERSION_CONTENU, content: contenu, contentHash: empreinteContenu(contenu),
        authorId: ctx.userId, reason: typeof e.raison === 'string' ? e.raison.slice(0, 2000) : 'création',
      }).returning();
      const [maj] = await tx.update(schema.studioProjects)
        .set({ currentVersionId: version!.id, rowVersion: 1, updatedAt: new Date() })
        .where(and(eq(schema.studioProjects.id, projet!.id), porteeSql(schema.studioProjects, ctx)))
        .returning();
      await ajouterAudit(tx, ctx, {
        action: 'project.create', brandId, targetType: 'studio_project', targetId: projet!.id,
        versionBefore: null, versionAfter: version!.id, reason: 'création',
      });
      return { ok: true as const, projet: maj!, version: version! };
    });
  } catch (err) {
    return echecPersistance(ctx, err);
  }
}

export interface EntreeEnregistrement {
  projectId: unknown;
  baseVersionId: unknown;
  changes: unknown;
  allowedPaths?: unknown;
  raison?: unknown;
}

/** Échec métier dans une transaction · la transaction est annulée, l'erreur rendue. */
class Refus extends Error {
  constructor(public readonly erreur: ErreurStudio) { super(erreur.code); }
}

/**
 * Nouvelle version IMMUABLE à partir de la version de base. Si la base n'est
 * plus la version courante : 409 `VERSION_CONFLICT` avec le diff base → courante,
 * et rien n'est écrit. Jamais d'écrasement.
 */
export async function enregistrerVersion(ctx: ContexteStudio, e: EntreeEnregistrement): Promise<Resultat<{ version: VersionStudio; inchange: boolean }>> {
  if (!estUuid(e.projectId)) return introuvable(ctx);
  if (!estUuid(e.baseVersionId)) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version de base obligatoire' }] });
  }
  const allowedPaths = e.allowedPaths ?? CHEMINS_EDITEUR;
  const projectId = e.projectId;
  const baseVersionId = e.baseVersionId;
  const P = schema.studioProjects;
  const V = schema.studioProjectVersions;

  try {
    return await db.transaction(async (tx) => {
      // Verrou de ligne · deux enregistrements simultanés passent l'un après l'autre.
      const [projet] = await tx.select().from(P).where(and(eq(P.id, projectId), porteeSql(P, ctx))).limit(1).for('update');
      if (horsPortee(ctx, projet) || !projet!.currentVersionId) throw new Refus(introuvable(ctx));
      const [courante] = await tx.select().from(V)
        .where(and(eq(V.id, projet!.currentVersionId), eq(V.projectId, projet!.id), porteeSql(V, ctx))).limit(1);
      if (!courante) throw new Refus(introuvable(ctx));

      if (courante.id !== baseVersionId) {
        const [base] = await tx.select().from(V).where(and(eq(V.id, baseVersionId), eq(V.projectId, projet!.id), porteeSql(V, ctx))).limit(1);
        if (!base) {
          throw new Refus(erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version inconnue pour ce projet' }] }));
        }
        throw new Refus(erreurStudio('VERSION_CONFLICT', {
          traceId: ctx.traceId,
          targetIds: [projet!.id, courante.id],
          conflit: { versionCouranteId: courante.id, differences: differencesDetaillees(base.content, courante.content) },
        }));
      }

      const r = appliquerPatch(courante.content as ContenuVersion, e.changes, allowedPaths);
      if (!r.ok) throw new Refus(erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: r.violations }));
      const violations = validerContenuVersion(r.resultat);
      if (violations.length) throw new Refus(erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations }));

      const empreinte = empreinteContenu(r.resultat);
      if (empreinte === courante.contentHash) return { ok: true as const, version: courante, inchange: true };

      const [nouvelle] = await tx.insert(V).values({
        projectId: projet!.id, workspaceId: projet!.workspaceId, brandId: projet!.brandId, parentId: courante.id,
        n: courante.n + 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: r.resultat, contentHash: empreinte,
        promptReleaseId: null, authorId: ctx.userId,
        reason: typeof e.raison === 'string' ? e.raison.slice(0, 2000) : '',
      }).returning();
      // Compare-and-set sur row_version · ceinture en plus du verrou.
      const maj = await tx.update(P)
        .set({ currentVersionId: nouvelle!.id, rowVersion: projet!.rowVersion + 1, updatedAt: new Date() })
        .where(and(eq(P.id, projet!.id), eq(P.rowVersion, projet!.rowVersion), porteeSql(P, ctx)))
        .returning({ id: P.id });
      if (maj.length !== 1) {
        throw new Refus(erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [projet!.id], conflit: { versionCouranteId: courante.id, differences: [] } }));
      }
      await ajouterAudit(tx, ctx, {
        action: 'project.version.create', brandId: projet!.brandId, targetType: 'studio_project', targetId: projet!.id,
        versionBefore: courante.id, versionAfter: nouvelle!.id,
        reason: typeof e.raison === 'string' ? e.raison : '',
        details: { chemins: r.cheminsModifies.slice(0, 100) },
      });
      return { ok: true as const, version: nouvelle!, inchange: false };
    });
  } catch (err) {
    if (err instanceof Refus) return err.erreur;
    return echecPersistance(ctx, err);
  }
}

export interface EntreeDisposition {
  projectId: unknown;
  positions: unknown;
  viewport?: unknown;
  rowVersion: unknown;
}

function validerPositions(x: unknown): string | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return 'positions indexées par identifiant attendues';
  const entrees = Object.entries(x);
  if (entrees.length > POSITIONS_MAX) return `${POSITIONS_MAX} positions au plus`;
  for (const [id, p] of entrees) {
    if (!estIdStable(id)) return 'identifiant de position instable';
    if (typeof p !== 'object' || p === null) return 'position {x, y} attendue';
    const { x: px, y: py, ...reste } = p as Record<string, unknown>;
    if (!Number.isFinite(px) || !Number.isFinite(py) || Object.keys(reste).some((k) => !['w', 'h'].includes(k))) return 'position {x, y} finie attendue';
  }
  return null;
}

/**
 * Positions du canvas · ne touche NI la version, NI l'ordre des plans, NI le
 * projet. Concurrence optimiste sur `row_version` de la disposition.
 */
export async function enregistrerDisposition(ctx: ContexteStudio, e: EntreeDisposition): Promise<Resultat<{ disposition: DispositionStudio }>> {
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok) return p;
  const refus = validerPositions(e.positions);
  if (refus) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'positions', raison: refus }] });
  if (!Number.isInteger(e.rowVersion) || (e.rowVersion as number) < 0) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'rowVersion', raison: 'version de disposition attendue' }] });
  }
  const attendue = e.rowVersion as number;
  const viewport = typeof e.viewport === 'object' && e.viewport !== null && !Array.isArray(e.viewport) ? e.viewport : null;
  const L = schema.studioLayouts;
  const projet = p.projet;
  try {
    if (attendue === 0) {
      const ins = await db.insert(L).values({
        projectId: projet.id, workspaceId: projet.workspaceId, brandId: projet.brandId,
        positions: e.positions as Record<string, unknown>, viewport, rowVersion: 1, updatedBy: ctx.userId,
      }).onConflictDoNothing({ target: L.projectId }).returning();
      if (ins[0]) return { ok: true, disposition: ins[0] };
    } else {
      const maj = await db.update(L)
        .set({ positions: e.positions as Record<string, unknown>, viewport, rowVersion: attendue + 1, updatedBy: ctx.userId, updatedAt: new Date() })
        .where(and(eq(L.projectId, projet.id), eq(L.rowVersion, attendue), porteeSql(L, ctx)))
        .returning();
      if (maj[0]) return { ok: true, disposition: maj[0] };
    }
  } catch (err) {
    return echecPersistance(ctx, err);
  }
  const [actuelle] = await db.select({ rowVersion: L.rowVersion }).from(L).where(and(eq(L.projectId, projet.id), porteeSql(L, ctx))).limit(1);
  return erreurStudio('VERSION_CONFLICT', {
    traceId: ctx.traceId,
    targetIds: [projet.id],
    message: `La disposition a changé (version ${actuelle?.rowVersion ?? 0}) · recharge le canvas puis replace tes éléments.`,
  });
}
