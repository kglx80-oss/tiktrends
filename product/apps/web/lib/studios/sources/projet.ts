import 'server-only';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db, schema } from '@tiktrends/db';
import {
  composerBrief, validerFormeBrief, validerRelationsBrief, validerHypothese, hypotheseSaisie, saisieSuffisante,
  propositionValidePour, referenceProduit, lireReferenceProduit, lireReferencesSources, completudeProjet, hypotheseDuBrief,
  exporterBrief as exporterBriefNoyau, contenuVide, creationsHorsMarque, validerContenuVersion, empreinteContenu, objetDansPortee, erreurStudio,
  LIBELLES_TYPE_PROJET, SCHEMA_VERSION_CONTENU, TEXTES_REFUS_PROPOSITION,
  type BriefCanonique, type ContenuVersion, type ErreurStudio, type HypotheseTest, type ManqueProjet, type EtapeProjet,
  type ReferenceProduitStudio, type ExportBrief, type FormatExportBrief, type SourceReferenceStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { ajouterAudit } from '../audit';
import { chargerSources, etatSources, estUuid, type VueSource } from './sources';
import { lireScelle } from './scelle';

/**
 * Projet créé depuis des sources · création idempotente, lecture complète
 * (reprise durable, FLOW-05), cartes de reprise, export du brief (FLOW-10).
 *
 * ── Portée, dans chaque requête ──────────────────────────────────────────────
 *
 * Comme le dépôt L1 : `workspace_id = session` ET `brand_id IN marques
 * visibles`, puis revérification pure (`objetDansPortee`) de chaque ligne.
 * Hors portée : `NOT_FOUND`, identique à « n'existe pas ».
 *
 * ── Idempotence par clé de clic ──────────────────────────────────────────────
 *
 * Le bouton « Créer le projet » porte une clé tirée à l'ouverture du panneau.
 * La création prend un verrou consultatif transactionnel sur (espace, clé),
 * cherche l'événement d'audit `project.create_from_sources` de cette clé, et
 * rend le projet déjà créé s'il existe. Un double clic, une requête rejouée ou
 * deux onglets avec la même clé donnent UN projet. Aucune colonne nouvelle :
 * la clé vit dans l'audit (ajout seul, même transaction que la création).
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

const KINDS = ['ads', 'image', 'video', 'text', 'campaign'] as const;
type KindProjet = (typeof KINDS)[number];
const CLE_CLIC = /^[A-Za-z0-9_-]{8,100}$/;
export const ACTION_CREATION = 'project.create_from_sources';

function porteeSql(t: { workspaceId: PgColumn; brandId: PgColumn }, ctx: ContexteStudio): SQL {
  if (ctx.marques.length === 0) return sql`false`;
  return and(eq(t.workspaceId, ctx.workspaceId), inArray(t.brandId, ctx.marques))!;
}
const dansPortee = (ctx: ContexteStudio, l: { workspaceId: string; brandId: string } | undefined): boolean =>
  !!l && objetDansPortee({ workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque }, l);
const introuvable = (ctx: ContexteStudio) => erreurStudio('NOT_FOUND', { traceId: ctx.traceId });

class Refus extends Error {
  constructor(public readonly erreur: ErreurStudio) { super(erreur.code); }
}

/* ─────────────────────────────── Création ────────────────────────────────── */

export interface EntreeCreationDepuisSources {
  sources: unknown;
  brandId: unknown;
  kind?: unknown;
  titre?: unknown;
  objectif?: unknown;
  /** `{ origine: 'proposee', hypothese, jeton }` · `{ origine: 'saisie', saisie }` · `null`. */
  hypothese?: unknown;
  productId?: unknown;
  cleClic: unknown;
}

export interface ProjetCree { projet: { id: string; title: string; kind: string; brandId: string }; versionId: string; deja: boolean }

function lireHypothese(ctx: ContexteStudio, brut: unknown, cible: { brandId: string; sourceIds: string[]; maintenant: Date }): Resultat<{ hypothese: HypotheseTest | null; origine: 'proposee' | 'saisie' | null; runId: string | null }> {
  if (brut === null || brut === undefined) return { ok: true, hypothese: null, origine: null, runId: null };
  if (typeof brut !== 'object') return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'hypothese', raison: 'hypothèse attendue' }] });
  const h = brut as { origine?: unknown; hypothese?: unknown; jeton?: unknown; saisie?: unknown };
  if (h.origine === 'saisie') {
    const saisie = hypotheseSaisie((h.saisie ?? {}) as Parameters<typeof hypotheseSaisie>[0], cible.sourceIds);
    if (!saisieSuffisante(saisie)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'hypothese/saisie', raison: 'énoncé et variable testée requis' }] });
    return { ok: true, hypothese: saisie, origine: 'saisie', runId: null };
  }
  if (h.origine === 'proposee') {
    // `isolee` est une qualification calculée, pas un champ du contrat.
    const { isolee: _isolee, ...propre } = (h.hypothese ?? {}) as Record<string, unknown>;
    void _isolee;
    const v = validerHypothese(propre, cible.sourceIds);
    if (v.length) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: v.map((x) => ({ chemin: `hypothese${x.chemin.replace('/hypothese', '')}`, raison: x.raison })) });
    const scelle = lireScelle(h.jeton);
    if (!scelle) return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, message: 'Cette proposition n’est pas reconnue · repropose des hypothèses ou rédige la tienne.' });
    const hypothese = propre as unknown as HypotheseTest;
    const refus = propositionValidePour(scelle, { workspaceId: ctx.workspaceId, brandId: cible.brandId, sourceIds: cible.sourceIds, hypothese, maintenant: cible.maintenant.getTime() });
    if (refus) return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, message: TEXTES_REFUS_PROPOSITION[refus] });
    return { ok: true, hypothese, origine: 'proposee', runId: scelle.runId };
  }
  return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'hypothese/origine', raison: 'origine proposee ou saisie' }] });
}

export async function creerProjetDepuisSourcesPour(
  ctx: ContexteStudio,
  e: EntreeCreationDepuisSources,
  o: { veilleOuverte: boolean; maintenant: Date },
): Promise<Resultat<ProjetCree>> {
  if (typeof e.cleClic !== 'string' || !CLE_CLIC.test(e.cleClic)) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'cleClic', raison: 'clé de clic de 8 à 100 caractères [A-Za-z0-9_-]' }] });
  }
  const cleClic = e.cleClic;
  if (!estUuid(e.brandId) || !ctx.marques.includes(e.brandId)) return introuvable(ctx);
  const brandId = e.brandId;
  const kind: KindProjet = e.kind === undefined || e.kind === null ? 'ads' : (KINDS as readonly unknown[]).includes(e.kind) ? (e.kind as KindProjet) : ('' as KindProjet);
  if (!kind) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'kind', raison: `type parmi ${KINDS.join(', ')}` }] });

  const [marque] = await db.select({ id: schema.brands.id, nom: schema.brands.name, audience: schema.brands.audience, workspaceId: schema.brands.workspaceId })
    .from(schema.brands).where(and(eq(schema.brands.id, brandId), eq(schema.brands.workspaceId, ctx.workspaceId))).limit(1);
  if (!marque) return introuvable(ctx);

  const c = await chargerSources(ctx, e.sources, o);
  if (!c.ok) return c;
  const sources = c.sources;
  // Une création précédente porte le produit et la DA de SA marque · elle ne se greffe pas sur une autre.
  if (creationsHorsMarque(sources, brandId).length) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'sources', raison: 'création précédente d’une autre marque' }] });
  }
  const sourceIds = sources.map((s) => s.sourceId);

  const h = lireHypothese(ctx, e.hypothese, { brandId, sourceIds, maintenant: o.maintenant });
  if (!h.ok) return h;

  let produit: ReferenceProduitStudio | null = null;
  if (e.productId !== undefined && e.productId !== null && e.productId !== '') {
    if (!estUuid(e.productId)) return introuvable(ctx);
    const [p] = await db.select().from(schema.products).where(and(eq(schema.products.id, e.productId), eq(schema.products.brandId, brandId))).limit(1);
    if (!p) return introuvable(ctx);
    produit = referenceProduit({ id: p.id, name: p.name, description: p.description, usp: p.usp, price: p.price, url: p.url, imageUrl: p.imageUrl, imageUrls: p.imageUrls }, o.maintenant);
  }

  const objectif = typeof e.objectif === 'string' ? e.objectif.slice(0, 2000) : undefined;
  const brief = composerBrief({ sources, hypothese: h.hypothese, produit, audience: marque.audience ?? '', ...(objectif !== undefined ? { objectif } : {}) });
  const violations = [...validerFormeBrief(brief), ...validerRelationsBrief(brief, { sources, productId: produit?.productId ?? null })];
  if (violations.length) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations });
  const contenu: ContenuVersion = { ...contenuVide(), brief: brief as unknown as Record<string, unknown>, productRef: produit as unknown as ContenuVersion['productRef'] };
  const vc = validerContenuVersion(contenu);
  if (vc.length) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: vc });

  const titreBrut = typeof e.titre === 'string' ? e.titre.replace(/\s+/g, ' ').trim() : '';
  const titre = (titreBrut || `D’après ${sources[0]!.annonceur || 'une annonce observée'}`).slice(0, 200);

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`studio_projet_clic:${ctx.workspaceId}:${cleClic}`}))`);
      const A = schema.studioAuditEvents;
      const [deja] = await tx.select({ targetId: A.targetId, versionAfter: A.versionAfter }).from(A)
        .where(and(eq(A.workspaceId, ctx.workspaceId), eq(A.action, ACTION_CREATION), sql`${A.details}->>'cleClic' = ${cleClic}`)).limit(1);
      if (deja) {
        const P = schema.studioProjects;
        const [p] = await tx.select().from(P).where(and(eq(P.id, deja.targetId), porteeSql(P, ctx))).limit(1);
        if (!dansPortee(ctx, p)) throw new Refus(introuvable(ctx));
        return { ok: true as const, projet: { id: p!.id, title: p!.title, kind: p!.kind, brandId: p!.brandId }, versionId: deja.versionAfter ?? p!.currentVersionId!, deja: true };
      }
      const [projet] = await tx.insert(schema.studioProjects).values({
        workspaceId: ctx.workspaceId, brandId, kind, title: titre, ownerId: ctx.userId, sourceRefs: sources,
      }).returning();
      const [version] = await tx.insert(schema.studioProjectVersions).values({
        projectId: projet!.id, workspaceId: ctx.workspaceId, brandId, parentId: null, n: 1,
        schemaVersion: SCHEMA_VERSION_CONTENU, content: contenu, contentHash: empreinteContenu(contenu),
        authorId: ctx.userId, reason: 'création depuis des sources',
      }).returning();
      await tx.update(schema.studioProjects)
        .set({ currentVersionId: version!.id, rowVersion: 1, updatedAt: new Date() })
        .where(and(eq(schema.studioProjects.id, projet!.id), porteeSql(schema.studioProjects, ctx)));
      await ajouterAudit(tx, ctx, {
        action: ACTION_CREATION, brandId, targetType: 'studio_project', targetId: projet!.id,
        versionBefore: null, versionAfter: version!.id, reason: 'création depuis des sources',
        details: {
          cleClic, sourceIds, hypothesisId: h.hypothese?.id ?? null, origineHypothese: h.origine, runId: h.runId,
          productId: produit?.productId ?? null, empreintes: sources.map((s) => s.empreinte),
        },
      });
      return { ok: true as const, projet: { id: projet!.id, title: projet!.title, kind: projet!.kind, brandId }, versionId: version!.id, deja: false };
    });
  } catch (err) {
    if (err instanceof Refus) return err.erreur;
    console.error(`[studios] ${ctx.traceId} création depuis sources`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId });
  }
}

/* ─────────────────────────────── Lecture ─────────────────────────────────── */

export interface VersionResumee { id: string; n: number; createdAt: string; reason: string; contentHash: string; courante: boolean }

export interface DetailProjet {
  projet: { id: string; title: string; kind: string; libelleType: string; status: string; brandId: string; marque: string; createdAt: string; updatedAt: string };
  version: { id: string; n: number; createdAt: string; contentHash: string };
  brief: BriefCanonique | null;
  briefIllisible: boolean;
  hypothese: HypotheseTest | null;
  produit: ReferenceProduitStudio | null;
  sources: VueSource[];
  sourcesIllisibles: number;
  completude: { manques: ManqueProjet[]; etape: EtapeProjet; libelleEtape: string };
  versions: VersionResumee[];
}

function briefDe(content: unknown): { brief: BriefCanonique | null; illisible: boolean } {
  const b = (content as { brief?: unknown } | null)?.brief ?? null;
  if (b === null) return { brief: null, illisible: false };
  return validerFormeBrief(b).length ? { brief: null, illisible: true } : { brief: b as BriefCanonique, illisible: false };
}

function aDuContenuDeProduction(content: unknown): boolean {
  const c = (content ?? {}) as Partial<ContenuVersion>;
  return (c.shots?.order?.length ?? 0) > 0 || c.document != null || c.timeline != null;
}

/** Lecture PURE · projet, version (courante ou demandée), sources vivantes, complétude, historique. */
export async function lireProjetDetailPour(
  ctx: ContexteStudio,
  projectId: unknown,
  o: { veilleOuverte: boolean; maintenant: Date; versionId?: unknown },
): Promise<Resultat<{ detail: DetailProjet }>> {
  if (!estUuid(projectId)) return introuvable(ctx);
  const P = schema.studioProjects;
  const V = schema.studioProjectVersions;
  const [p] = await db.select().from(P).where(and(eq(P.id, projectId), porteeSql(P, ctx))).limit(1);
  if (!dansPortee(ctx, p) || !p!.currentVersionId) return introuvable(ctx);
  const projet = p!;
  const voulue = o.versionId === undefined || o.versionId === null ? projet.currentVersionId : o.versionId;
  if (!estUuid(voulue)) return introuvable(ctx);
  const versions = await db.select({ id: V.id, n: V.n, createdAt: V.createdAt, reason: V.reason, contentHash: V.contentHash, workspaceId: V.workspaceId, brandId: V.brandId })
    .from(V).where(and(eq(V.projectId, projet.id), porteeSql(V, ctx))).orderBy(desc(V.n)).limit(100);
  const [v] = await db.select().from(V).where(and(eq(V.id, voulue), eq(V.projectId, projet.id), porteeSql(V, ctx))).limit(1);
  if (!dansPortee(ctx, v)) return introuvable(ctx);
  const [marque] = await db.select({ nom: schema.brands.name }).from(schema.brands).where(and(eq(schema.brands.id, projet.brandId), eq(schema.brands.workspaceId, ctx.workspaceId))).limit(1);

  const { sources: refs, illisibles } = lireReferencesSources(projet.sourceRefs);
  const sources = await etatSources(ctx, refs, o);
  const { brief, illisible } = briefDe(v!.content);
  const produit = lireReferenceProduit((v!.content as { productRef?: unknown }).productRef);
  const hypothese = brief ? hypotheseDuBrief(brief) : null;
  return {
    ok: true,
    detail: {
      projet: {
        id: projet.id, title: projet.title, kind: projet.kind, libelleType: LIBELLES_TYPE_PROJET[projet.kind] ?? projet.kind, status: projet.status,
        brandId: projet.brandId, marque: marque?.nom ?? '', createdAt: projet.createdAt.toISOString(), updatedAt: projet.updatedAt.toISOString(),
      },
      version: { id: v!.id, n: v!.n, createdAt: v!.createdAt.toISOString(), contentHash: v!.contentHash },
      brief,
      briefIllisible: illisible,
      hypothese: hypothese ? { ...hypothese, invariants: brief?.invariants ?? [] } : null,
      produit,
      sources,
      sourcesIllisibles: illisibles,
      completude: completudeProjet({ brief, produit, sources, aDuContenuDeProduction: aDuContenuDeProduction(v!.content) }),
      versions: versions.filter((x) => dansPortee(ctx, x)).map((x) => ({
        id: x.id, n: x.n, createdAt: x.createdAt.toISOString(), reason: x.reason, contentHash: x.contentHash, courante: x.id === projet.currentVersionId,
      })),
    },
  };
}

/* ─────────────────────────────── Cartes ──────────────────────────────────── */

export interface CarteProjet {
  id: string;
  title: string;
  kind: string;
  libelleType: string;
  brandId: string;
  marque: string;
  etape: EtapeProjet;
  libelleEtape: string;
  manques: ManqueProjet[];
  versionN: number | null;
  sources: number;
  updatedAt: string;
}

/** Cartes de reprise · lecture pure, trois requêtes quel que soit le nombre de projets. */
export async function listerCartesPour(
  ctx: ContexteStudio,
  o: { brandId?: string | null; veilleOuverte: boolean; maintenant: Date; limite?: number },
): Promise<CarteProjet[]> {
  const P = schema.studioProjects;
  const V = schema.studioProjectVersions;
  const conds: SQL[] = [porteeSql(P, ctx), eq(P.status, 'active')];
  if (o.brandId) {
    if (!ctx.marques.includes(o.brandId)) return [];
    conds.push(eq(P.brandId, o.brandId));
  }
  const projets = (await db.select().from(P).where(and(...conds)).orderBy(desc(P.updatedAt)).limit(Math.min(Math.max(1, o.limite ?? 60), 200)))
    .filter((p) => dansPortee(ctx, p));
  if (projets.length === 0) return [];
  const courantes = projets.map((p) => p.currentVersionId).filter(estUuid);
  const versions = courantes.length
    ? await db.select({ id: V.id, n: V.n, content: V.content, workspaceId: V.workspaceId, brandId: V.brandId }).from(V).where(and(inArray(V.id, courantes), porteeSql(V, ctx)))
    : [];
  const parVersion = new Map(versions.filter((v) => dansPortee(ctx, v)).map((v) => [v.id, v]));
  const marques = await db.select({ id: schema.brands.id, nom: schema.brands.name }).from(schema.brands)
    .where(and(eq(schema.brands.workspaceId, ctx.workspaceId), inArray(schema.brands.id, [...new Set(projets.map((p) => p.brandId))])));
  const nomMarque = new Map(marques.map((m) => [m.id, m.nom]));
  const refsParProjet = new Map(projets.map((p) => [p.id, lireReferencesSources(p.sourceRefs).sources]));
  const vivantes = await etatSources(ctx, [...refsParProjet.values()].flat(), o);
  const statut = new Map(vivantes.map((s) => [`${s.sourceId}`, s.statut]));
  return projets.map((p) => {
    const v = p.currentVersionId ? parVersion.get(p.currentVersionId) : undefined;
    const { brief } = briefDe(v?.content ?? null);
    const produit = lireReferenceProduit((v?.content as { productRef?: unknown } | undefined)?.productRef);
    const sources = (refsParProjet.get(p.id) ?? []).map((s) => ({ statut: statut.get(s.sourceId) ?? s.statut }));
    const c = completudeProjet({ brief, produit, sources, aDuContenuDeProduction: aDuContenuDeProduction(v?.content) });
    return {
      id: p.id, title: p.title, kind: p.kind, libelleType: LIBELLES_TYPE_PROJET[p.kind] ?? p.kind, brandId: p.brandId,
      marque: nomMarque.get(p.brandId) ?? '', etape: c.etape, libelleEtape: c.libelleEtape,
      manques: [...c.manques].sort((a, b) => Number(b.bloquant) - Number(a.bloquant)),
      versionN: v?.n ?? null, sources: sources.length, updatedAt: p.updatedAt.toISOString(),
    };
  });
}

/* ─────────────────────────────── Export ──────────────────────────────────── */

/** Export du brief · LECTURE PURE (aucune écriture, aucun devis, aucune génération). */
export async function exporterBriefPour(
  ctx: ContexteStudio,
  e: { projectId: unknown; versionId?: unknown; format?: unknown },
  o: { veilleOuverte: boolean; maintenant: Date },
): Promise<Resultat<ExportBrief>> {
  const format: FormatExportBrief | null = e.format === undefined || e.format === 'markdown' ? 'markdown' : e.format === 'json' ? 'json' : null;
  if (!format) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'format', raison: 'markdown ou json' }] });
  const d = await lireProjetDetailPour(ctx, e.projectId, { ...o, versionId: e.versionId });
  if (!d.ok) return d;
  const { detail } = d;
  if (!detail.brief) {
    return erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, targetIds: [detail.projet.id], message: detail.briefIllisible ? 'Le brief de cette version est illisible · ouvre une autre version.' : 'Ce projet n’a pas encore de brief à exporter.' });
  }
  const sources: SourceReferenceStudio[] = detail.sources.map(({ apercu: _a, lienSource: _l, ...s }) => { void _a; void _l; return s; });
  const r = exporterBriefNoyau(detail.brief, {
    titre: detail.projet.title, marque: detail.projet.marque, type: detail.projet.kind, versionN: detail.version.n, versionId: detail.version.id,
    exporteLe: o.maintenant.toISOString(), sources, produit: detail.produit,
  }, format);
  return { ok: true, ...r };
}
