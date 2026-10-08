import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  admissibiliteVariante, sortiesOrdonnees, rangsDesLots, libelleVariante, natureDuMime, traceDuBrief, lireRegistre,
  parentParIteration, testDuLien, lireResultat, lireSnapshotJob, erreurStudio,
  type DonneesVariantes, type LotLu, type VarianteLue, type TestLu, type VerdictLu, type RelectureApprentissage,
  type EtatJob, type StatutQualite, type TestedVariable, type ProtocoleTest, type Conclusion, type StatutIsolation,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { ajouterAudit } from '../audit';
import type { BaseStudio, ExecStudio } from '../execution/types';
import { porteeSql, horsPortee, introuvable, echecPersistance, Refus, estUuid, iso, type Resultat } from './commun';

/**
 * Variantes (cahier 01 §4.4 point 10, §7) · un média PRÉCIS d'une version
 * PRÉCISE, avec sa variante parente. Lecture pure ou écriture idempotente,
 * jamais de génération ni de coût.
 *
 * ── Idempotence de `creerVariante` ───────────────────────────────────────────
 *
 * Une variante par média. La table n'a pas d'unicité sur `media_asset_id`
 * (aucune migration dans ce lot · besoin écrit au rapport) : la ligne du média
 * est VERROUILLÉE (`FOR UPDATE`) avant de chercher une variante existante,
 * donc deux clics simultanés passent l'un après l'autre et le second relit la
 * variante du premier (READ COMMITTED : chaque requête voit les validations
 * précédentes).
 */

const J = schema.studioJobs;
const A = schema.studioAssets;
const VA = schema.studioVariants;
const P = schema.studioProjects;
const V = schema.studioProjectVersions;
const TL = schema.studioTestLinks;

type Job = typeof J.$inferSelect;
type Asset = typeof A.$inferSelect;
type Variante = typeof VA.$inferSelect;

export interface VariantePresentee {
  id: string;
  libelle: string;
  projectId: string;
  versionId: string;
  parentVariantId: string | null;
  mediaAssetId: string;
  jobId: string;
  operation: string;
  position: number;
  lot: number;
  qualite: StatutQualite;
  hypothese: string | null;
  variable: string | null;
}

/** Le job qui a RÉELLEMENT livré ce média · lu dans `result.assets`, pas déduit. */
async function jobDuMedia(ex: ExecStudio, ctx: ContexteStudio, projectId: string, assetId: string): Promise<Job | null> {
  const [j] = await ex.select().from(J).where(and(
    eq(J.projectId, projectId), porteeSql(J, ctx),
    sql`exists (select 1 from jsonb_each_text(case when jsonb_typeof(${J.result}->'assets') = 'object' then ${J.result}->'assets' else '{}'::jsonb end) as e(cle, valeur) where e.valeur = ${assetId})`,
  )).limit(1);
  return j && !horsPortee(ctx, j) ? j : null;
}

function assetsDuJob(j: Pick<Job, 'result'>): Record<string, string> {
  const a = (j.result as { assets?: unknown } | null)?.assets;
  if (typeof a !== 'object' || a === null || Array.isArray(a)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) if (typeof v === 'string') out[k] = v;
  return out;
}

function lignesDuJob(j: Pick<Job, 'snapshot'>): Array<{ operation: string; credits: number }> {
  return lireSnapshotJob(j.snapshot)?.lignes.map((l) => ({ operation: l.operation, credits: l.credits })) ?? [];
}

/** Position du média dans son lot et rang du lot dans le projet. */
async function identite(ex: ExecStudio, ctx: ContexteStudio, job: Job, assetId: string): Promise<{ operation: string; position: number; lot: number }> {
  const jobs = await ex.select({ id: J.id, createdAt: J.createdAt }).from(J).where(and(eq(J.projectId, job.projectId), porteeSql(J, ctx)));
  const lot = rangsDesLots(jobs).get(job.id) ?? jobs.length;
  const s = sortiesOrdonnees(lignesDuJob(job), assetsDuJob(job)).find((x) => x.assetId === assetId);
  return { operation: s?.operation ?? '', position: s?.position ?? 0, lot };
}

function presenter(v: Variante, job: Job, id: { operation: string; position: number; lot: number }): VariantePresentee {
  return {
    id: v.id, libelle: v.label, projectId: v.projectId, versionId: v.projectVersionId, parentVariantId: v.parentVariantId,
    mediaAssetId: v.mediaAssetId, jobId: job.id, operation: id.operation, position: id.position, lot: id.lot,
    qualite: job.qualityStatus as StatutQualite, hypothese: v.hypothesis, variable: v.testedVariable,
  };
}

/* ────────────────────────────── creerVariante ────────────────────────────── */

export interface EntreeVariante { assetId: unknown; parentVariantId?: unknown }

/**
 * Fait d'une sortie stockée une variante. Depuis un média accepté OU à relire
 * (le statut qualité reste affiché à part) ; un média écarté est refusé. La
 * version est celle du JOB (FLOW-07). La parente est celle donnée, sinon celle
 * de l'itération qui a créé la version du lot (registre du projet).
 */
export async function creerVariante(ctx: ContexteStudio, e: EntreeVariante, base: BaseStudio = db): Promise<Resultat<{ variante: VariantePresentee; deja: boolean }>> {
  if (!estUuid(e.assetId)) return introuvable(ctx);
  const assetId = e.assetId;
  const parentDemande = e.parentVariantId === undefined || e.parentVariantId === null || e.parentVariantId === '' ? null : e.parentVariantId;
  if (parentDemande !== null && !estUuid(parentDemande)) return introuvable(ctx);
  try {
    return await base.transaction(async (tx) => {
      // Verrou du média · sérialise les doubles clics sur la même sortie.
      const [asset] = await tx.select().from(A).where(and(eq(A.id, assetId), porteeSql(A, ctx))).limit(1).for('update');
      if (horsPortee(ctx, asset)) throw new Refus(introuvable(ctx));
      const a = asset as Asset;
      if (!a.projectId) throw new Refus(erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, targetIds: [a.id], message: 'Ce média n’appartient à aucun projet · il ne peut pas devenir une variante.' }));

      const job = await jobDuMedia(tx, ctx, a.projectId, a.id);
      const [existante] = await tx.select().from(VA).where(and(eq(VA.mediaAssetId, a.id), porteeSql(VA, ctx))).limit(1);
      if (existante && job) return { ok: true as const, variante: presenter(existante, job, await identite(tx, ctx, job, a.id)), deja: true };

      const adm = admissibiliteVariante({
        job: job ? { state: job.state as EtatJob, qualityStatus: job.qualityStatus as StatutQualite, projectId: job.projectId, projectVersionId: job.projectVersionId } : { state: 'failed', qualityStatus: 'pending', projectId: '', projectVersionId: '' },
        asset: { projectId: a.projectId, storageState: a.storageState },
        assetDansLeJob: job !== null,
      });
      if (!adm.ok) throw new Refus(erreurStudio(adm.code, { traceId: ctx.traceId, targetIds: [a.id], message: adm.message }));
      const j = job!;

      const [projet] = await tx.select().from(P).where(and(eq(P.id, j.projectId), porteeSql(P, ctx))).limit(1);
      if (horsPortee(ctx, projet)) throw new Refus(introuvable(ctx));

      let parentVariantId: string | null = null;
      if (parentDemande) {
        const [p] = await tx.select({ id: VA.id, projectId: VA.projectId, workspaceId: VA.workspaceId, brandId: VA.brandId }).from(VA)
          .where(and(eq(VA.id, parentDemande), porteeSql(VA, ctx))).limit(1);
        if (horsPortee(ctx, p) || p!.projectId !== j.projectId) throw new Refus(introuvable(ctx));
        parentVariantId = p!.id;
      } else {
        parentVariantId = parentParIteration(lireRegistre(projet!.testRefs), adm.versionId);
      }

      const [version] = await tx.select({ content: V.content }).from(V).where(and(eq(V.id, adm.versionId), eq(V.projectId, j.projectId), porteeSql(V, ctx))).limit(1);
      const trace = traceDuBrief((version?.content as { brief?: unknown } | undefined)?.brief ?? null);
      const id = await identite(tx, ctx, j, a.id);
      const libelle = libelleVariante({ position: id.position, lot: id.lot, nature: natureDuMime(a.mime) });

      const [v] = await tx.insert(VA).values({
        workspaceId: a.workspaceId, brandId: a.brandId, projectId: j.projectId, projectVersionId: adm.versionId,
        parentVariantId, mediaAssetId: a.id, label: libelle,
        hypothesis: trace.hypothese, testedVariable: trace.variable, createdBy: ctx.userId,
      }).returning();
      await ajouterAudit(tx, ctx, {
        action: 'variant.create', brandId: a.brandId, targetType: 'studio_variant', targetId: v!.id,
        versionAfter: adm.versionId, reason: libelle,
        details: { mediaAssetId: a.id, jobId: j.id, operation: id.operation, position: id.position, lot: id.lot, parentVariantId, qualite: adm.qualite, sourceIds: trace.sourceIds },
      });
      return { ok: true as const, variante: presenter(v!, j, id), deja: false };
    });
  } catch (err) {
    if (err instanceof Refus) return err.erreur;
    return echecPersistance(ctx, err);
  }
}

/* ────────────────────────────── Lectures ─────────────────────────────────── */

export interface OptionsListe {
  adsmapAcces: boolean;
  relecture: { disponible: boolean; raison: string | null; coutMaxUsd: number | null };
}

const verdictLu = (r: { computed: string | null; validated: string | null; comparable: boolean | null; failedStage: string | null; killFlag: string | null; computedAt: Date | null } | null): VerdictLu | null => {
  if (!r || (!r.computed && !r.validated)) return null;
  return {
    computed: r.computed as VerdictLu['computed'], validated: r.validated as VerdictLu['validated'], comparable: r.comparable ?? false,
    failedStage: r.failedStage as VerdictLu['failedStage'], killFlag: r.killFlag as VerdictLu['killFlag'], computedAt: iso(r.computedAt),
  };
};

/** Liens de test et verdicts Adsmap des variantes données · l'ad est relue dans l'espace de la session. */
export async function liensEtVerdicts(ex: ExecStudio, ctx: ContexteStudio, variantIds: string[]) {
  if (variantIds.length === 0) return [];
  return ex.select({
    linkId: TL.id, variantId: TL.variantId, adsmapAdId: TL.adsmapAdId, createdAt: TL.createdAt,
    adStatus: schema.ads.status, hypothesis: schema.ads.hypothesis, testedVariable: schema.ads.testedVariable, variableValue: schema.ads.variableValue,
    computed: schema.verdicts.computed, validated: schema.verdicts.validated, comparable: schema.verdicts.comparable,
    failedStage: schema.verdicts.failedStage, killFlag: schema.verdicts.killFlag, computedAt: schema.verdicts.computedAt,
    workspaceId: TL.workspaceId, brandId: TL.brandId,
  }).from(TL)
    .innerJoin(schema.ads, and(eq(schema.ads.id, TL.adsmapAdId), eq(schema.ads.workspaceId, ctx.workspaceId)))
    .leftJoin(schema.verdicts, eq(schema.verdicts.adId, TL.adsmapAdId))
    .where(and(inArray(TL.variantId, variantIds), porteeSql(TL, ctx)))
    .orderBy(desc(TL.createdAt));
}

/** Toutes les données de l'écran d'un projet · LECTURE PURE, aucune écriture. */
export async function listerVariantes(ctx: ContexteStudio, e: { projectId: unknown }, o: OptionsListe, base: BaseStudio = db): Promise<Resultat<{ donnees: DonneesVariantes }>> {
  if (!estUuid(e.projectId)) return introuvable(ctx);
  const [projet] = await base.select().from(P).where(and(eq(P.id, e.projectId), porteeSql(P, ctx))).limit(1);
  if (horsPortee(ctx, projet)) return introuvable(ctx);
  const p = projet!;

  const versions = await base.select({ id: V.id, n: V.n, parentId: V.parentId, createdAt: V.createdAt, content: V.content }).from(V)
    .where(and(eq(V.projectId, p.id), porteeSql(V, ctx)));
  const jobs = (await base.select().from(J).where(and(eq(J.projectId, p.id), porteeSql(J, ctx)))).filter((j) => !horsPortee(ctx, j));
  const rangs = rangsDesLots(jobs);
  const assets = (await base.select().from(A).where(and(eq(A.projectId, p.id), porteeSql(A, ctx)))).filter((a) => !horsPortee(ctx, a));
  const parAsset = new Map(assets.map((a) => [a.id, a]));
  const variantes = (await base.select().from(VA).where(and(eq(VA.projectId, p.id), porteeSql(VA, ctx)))).filter((v) => !horsPortee(ctx, v));
  const varParAsset = new Map(variantes.map((v) => [v.mediaAssetId, v]));

  const lots: LotLu[] = jobs.map((j) => {
    const lignes = lignesDuJob(j);
    const sorties = sortiesOrdonnees(lignes, assetsDuJob(j)).flatMap((s) => {
      const a = parAsset.get(s.assetId);
      if (!a || a.storageState !== 'stored') return [];
      return [{ operation: s.operation, position: s.position, assetId: a.id, mime: a.mime, largeur: a.width, hauteur: a.height, sha256: a.sha256, varianteId: varParAsset.get(a.id)?.id ?? null }];
    });
    const payantes = lignes.filter((l) => l.credits > 0).length;
    return {
      jobId: j.id, lot: rangs.get(j.id) ?? 0, versionId: j.projectVersionId, etat: j.state as EtatJob, qualite: j.qualityStatus as StatutQualite,
      creeLe: iso(j.createdAt)!, attendues: payantes || lignes.length, sorties,
    };
  });
  const lotParJob = new Map(lots.map((l) => [l.jobId, l]));
  const jobParAsset = new Map<string, Job>();
  for (const j of jobs) for (const id of Object.values(assetsDuJob(j))) jobParAsset.set(id, j);

  const registre = lireRegistre(p.testRefs);
  const liens = await liensEtVerdicts(base, ctx, variantes.map((v) => v.id));
  const lienOuvertOuDernier = new Map<string, (typeof liens)[number]>();
  for (const l of liens) if (!horsPortee(ctx, l) && !lienOuvertOuDernier.has(l.variantId)) lienOuvertOuDernier.set(l.variantId, l);

  // Relectures IA déjà faites · journal d'audit (ajout seul), la plus récente par lien.
  const idsLiens = [...lienOuvertOuDernier.values()].map((l) => l.linkId);
  const E = schema.studioAuditEvents;
  const relectures = idsLiens.length ? await base.select({ targetId: E.targetId, details: E.details, occurredAt: E.occurredAt, workspaceId: E.workspaceId, brandId: E.brandId }).from(E)
    .where(and(eq(E.action, 'learning.review'), eq(E.targetType, 'studio_test_link'), inArray(E.targetId, idsLiens), eq(E.workspaceId, ctx.workspaceId), inArray(E.brandId, ctx.marques.length ? ctx.marques : ['00000000-0000-0000-0000-000000000000'])))
    .orderBy(desc(E.occurredAt)) : [];
  const relectureParLien = new Map<string, RelectureApprentissage>();
  for (const r of relectures) {
    if (relectureParLien.has(r.targetId) || horsPortee(ctx, r.workspaceId ? { workspaceId: r.workspaceId, brandId: r.brandId } : null)) continue;
    const d = (r.details ?? {}) as { conclusion?: Conclusion; apprentissage?: string; variableSuivante?: string; ecart?: string | null };
    if (!d.conclusion) continue;
    relectureParLien.set(r.targetId, { conclusion: d.conclusion, apprentissage: d.apprentissage ?? '', variableSuivante: d.variableSuivante ?? '', ecart: d.ecart ?? null, le: iso(r.occurredAt)! });
  }

  const parId = new Map(variantes.map((v) => [v.id, v]));
  const lignee = (v: Variante) => {
    const vues = new Set<string>();
    const changees: TestedVariable[] = [];
    let profondeur = 0;
    for (let x = v.parentVariantId ? parId.get(v.parentVariantId) : undefined; x && !vues.has(x.id) && profondeur < 20; x = x.parentVariantId ? parId.get(x.parentVariantId) : undefined) {
      vues.add(x.id);
      profondeur++;
      const t = lienOuvertOuDernier.get(x.id)?.testedVariable;
      if (t) changees.unshift(t as TestedVariable);
    }
    return { profondeur, variablesChangees: changees };
  };

  const lues: VarianteLue[] = variantes.map((v) => {
    const a = parAsset.get(v.mediaAssetId);
    const j = jobParAsset.get(v.mediaAssetId);
    const lot = j ? lotParJob.get(j.id) : undefined;
    const position = lot?.sorties.find((s) => s.assetId === v.mediaAssetId)?.position ?? 0;
    const l = lienOuvertOuDernier.get(v.id);
    let test: TestLu | null = null;
    if (l) {
      const entree = testDuLien(registre, l.linkId);
      test = {
        linkId: l.linkId, adsmapAdId: l.adsmapAdId, adStatus: l.adStatus,
        hypothese: l.hypothesis ?? entree?.hypothese ?? '', variable: l.testedVariable ?? entree?.variable ?? '',
        valeurVariable: l.variableValue ?? entree?.valeurVariable ?? null,
        objectif: entree?.objectif ?? null, protocole: (entree?.protocole ?? null) as ProtocoleTest | null,
        periode: entree?.periode ?? null, metrique: entree?.metrique ?? null,
        isolation: entree?.isolation ?? null, verdict: verdictLu(l),
      };
    }
    const parentLien = v.parentVariantId ? lienOuvertOuDernier.get(v.parentVariantId) : undefined;
    const lecture = test ? lireResultat({
      variable: (test.variable || 'none_control') as TestedVariable,
      isolation: (test.isolation?.statut ?? (v.parentVariantId ? 'plusieurs' : 'sans_parent')) as StatutIsolation,
      verdict: test.verdict,
      parent: v.parentVariantId ? { verdict: parentLien ? verdictLu(parentLien) : null } : null,
      lignee: lignee(v),
    }) : null;
    return {
      id: v.id, assetId: v.mediaAssetId, versionId: v.projectVersionId, parentVariantId: v.parentVariantId,
      jobId: j?.id ?? '', lot: lot?.lot ?? 0, position,
      mime: a?.mime ?? '', largeur: a?.width ?? null, hauteur: a?.height ?? null, sha256: a?.sha256 ?? '',
      hypothese: v.hypothesis, variable: v.testedVariable,
      qualite: (j?.qualityStatus ?? 'pending') as StatutQualite, etatTechnique: (j?.state ?? 'completed') as EtatJob,
      creeLe: iso(v.createdAt)!, test, lecture, relecture: l ? relectureParLien.get(l.linkId) ?? null : null,
    };
  });

  let adsmap: DonneesVariantes['adsmap'] = { acces: false, protocoleMarque: null, offres: [], pages: [] };
  if (o.adsmapAcces) {
    const [proto] = await base.select({ structure: schema.testProtocols.structure }).from(schema.testProtocols)
      .where(and(eq(schema.testProtocols.brandId, p.brandId), eq(schema.testProtocols.workspaceId, ctx.workspaceId))).limit(1);
    const offres = await base.select({ id: schema.offers.id, libelle: schema.offers.label }).from(schema.offers)
      .where(and(eq(schema.offers.brandId, p.brandId), eq(schema.offers.workspaceId, ctx.workspaceId), eq(schema.offers.active, true))).limit(50);
    const pages = await base.select({ id: schema.landingPages.id, libelle: schema.landingPages.label }).from(schema.landingPages)
      .where(and(eq(schema.landingPages.brandId, p.brandId), eq(schema.landingPages.workspaceId, ctx.workspaceId))).limit(50);
    adsmap = { acces: true, protocoleMarque: (proto?.structure ?? null) as ProtocoleTest | null, offres, pages };
  }

  return {
    ok: true,
    donnees: {
      projet: { id: p.id, titre: p.title, versionCouranteId: p.currentVersionId },
      versions: versions.map((v) => ({ id: v.id, n: v.n, parentId: v.parentId, creeLe: iso(v.createdAt)! })),
      lots, variantes: lues, adsmap,
      droits: { proposer: ctx.permissions.espace.has('studio.propose') },
      relecture: o.relecture,
    },
  };
}

/* ───────────────────────────── Filiation ─────────────────────────────────── */

export interface MaillonFiliation {
  variantId: string;
  libelle: string;
  versionId: string;
  versionN: number;
  mediaAssetId: string;
  sha256: string;
  jobId: string | null;
  promptReleaseId: string | null;
  hypothese: string | null;
  variable: string | null;
  sourceIds: string[];
  tests: Array<{ linkId: string; adsmapAdId: string }>;
}

/**
 * Filiation serveur d'une variante · elle, sa parente, la parente de sa
 * parente… avec, à chaque maillon, le média exact (empreinte), la version, la
 * release de prompts du job, l'hypothèse, la variable, les sources du brief et
 * les tests. LECTURE PURE. Les sources du projet sont rendues telles quelles.
 */
export async function filiationVariante(ctx: ContexteStudio, e: { variantId: unknown }, base: BaseStudio = db): Promise<Resultat<{ maillons: MaillonFiliation[]; sourcesProjet: unknown }>> {
  if (!estUuid(e.variantId)) return introuvable(ctx);
  const maillons: MaillonFiliation[] = [];
  const vues = new Set<string>();
  let courant: string | null = e.variantId;
  let projectId: string | null = null;
  while (courant && !vues.has(courant) && maillons.length < 20) {
    vues.add(courant);
    const [v]: Variante[] = await base.select().from(VA).where(and(eq(VA.id, courant), porteeSql(VA, ctx))).limit(1);
    if (horsPortee(ctx, v)) {
      if (maillons.length === 0) return introuvable(ctx);
      break;
    }
    const x: Variante = v!;
    projectId ??= x.projectId;
    const [a] = await base.select({ sha256: A.sha256 }).from(A).where(and(eq(A.id, x.mediaAssetId), porteeSql(A, ctx))).limit(1);
    const j = await jobDuMedia(base, ctx, x.projectId, x.mediaAssetId);
    const [ver] = await base.select({ n: V.n, content: V.content }).from(V).where(and(eq(V.id, x.projectVersionId), porteeSql(V, ctx))).limit(1);
    const tests = await base.select({ linkId: TL.id, adsmapAdId: TL.adsmapAdId }).from(TL).where(and(eq(TL.variantId, x.id), porteeSql(TL, ctx)));
    maillons.push({
      variantId: x.id, libelle: x.label, versionId: x.projectVersionId, versionN: ver?.n ?? 0, mediaAssetId: x.mediaAssetId,
      sha256: a?.sha256 ?? '', jobId: j?.id ?? null, promptReleaseId: j?.promptReleaseId ?? null,
      hypothese: x.hypothesis, variable: x.testedVariable,
      sourceIds: traceDuBrief((ver?.content as { brief?: unknown } | undefined)?.brief ?? null).sourceIds, tests,
    });
    courant = x.parentVariantId;
  }
  const [p] = projectId ? await base.select({ sourceRefs: P.sourceRefs, workspaceId: P.workspaceId, brandId: P.brandId }).from(P).where(and(eq(P.id, projectId), porteeSql(P, ctx))).limit(1) : [];
  return { ok: true, maillons, sourcesProjet: p && !horsPortee(ctx, p) ? p.sourceRefs : [] };
}
