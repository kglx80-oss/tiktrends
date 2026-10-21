import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema, depenseDepuis, depenseEspaceDepuis, budgetEssaiDe, VERROU_PLAFOND, type BaseDepense } from '@tiktrends/db';
import { erreurStudio, objetDansPortee, OPERATION_IMAGE, qualifierDevis, refusPlafondDollars, type ErreurStudio, type QualificationTotal } from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { estUuid } from '../depot';
import { ajouterAudit } from '../audit';
import { creerDevis, approuverEtMettreEnFile, type DevisPresente, type JobPresente, type Resultat, type OptionsApprobation } from '../execution/commandes';
import type { BaseStudio, ExecStudio } from '../execution/types';

/** N images indépendantes du MÊME instantané, pas N accroches ou formats. */
export interface VueLotImages {
  id: string; projectId: string; versionId: string; nombre: number; type: 'images-meme-consigne';
  devis: DevisPresente[]; totalCredits: number; totalUsdMicros: number;
  qualification: QualificationTotal; expiresAt: Date; empreinte: string;
}
export interface EntreeLotImages { projectId: unknown; nombre: unknown; controleVision?: unknown }
export interface ConfirmationLotImages { lotId: unknown; empreinte: unknown; creditsAnnonces: unknown; usdMicrosAnnonces: unknown; confirme: unknown }
const ACTION = 'image.batch.quote';
class Refus extends Error { constructor(readonly resultat: ErreurStudio) { super(resultat.code); } }
const refus = (ctx: ContexteStudio, code: ErreurStudio['code'], message?: string) => erreurStudio(code, { traceId: ctx.traceId, message });
function canonique(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(canonique);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b)).map(([k,x]) => [k,canonique(x)]));
  return v;
}
const empreinte = (v: Omit<VueLotImages, 'empreinte'>) => createHash('sha256').update(JSON.stringify(canonique(v))).digest('hex');

/** L'audit est append-only en base (0054), donc le manifeste ne peut pas être réécrit. */
async function manifeste(ctx: ContexteStudio, id: unknown, base: ExecStudio): Promise<VueLotImages | null> {
  if (!estUuid(id) || ctx.marques.length === 0) return null;
  const A = schema.studioAuditEvents;
  const [a] = await base.select().from(A).where(and(eq(A.action, ACTION), eq(A.targetId, id), eq(A.workspaceId, ctx.workspaceId), inArray(A.brandId, ctx.marques))).limit(1);
  if (!a?.brandId || !objetDansPortee(ctx, { workspaceId: a.workspaceId!, brandId: a.brandId })) return null;
  const brut = a.details as unknown as VueLotImages;
  if (!brut || brut.id !== id || brut.type !== 'images-meme-consigne') return null;
  const lot = { ...brut, expiresAt: new Date(brut.expiresAt) };
  const { empreinte: sig, ...contenu } = lot;
  return empreinte(contenu) === sig ? lot : null;
}
async function jobsDuLot(ctx: ContexteStudio, lot: VueLotImages, base: ExecStudio): Promise<JobPresente[]> {
  const J = schema.studioJobs;
  const lignes = await base.select().from(J).where(and(eq(J.workspaceId, ctx.workspaceId), inArray(J.brandId, ctx.marques), inArray(J.quoteId, lot.devis.map(q => q.id))));
  return lot.devis.flatMap(q => {
    const j = lignes.find(j => j.quoteId === q.id);
    return j ? [{ id: j.id, etat: j.state as JobPresente['etat'], quoteId: j.quoteId, idempotencyKey: j.idempotencyKey, brandId: j.brandId, projectId: j.projectId }] : [];
  });
}
export async function lireLotImagesPour(ctx: ContexteStudio, lotId: unknown, base: BaseStudio = db): Promise<Resultat<{lot: VueLotImages; jobs: JobPresente[]}>> {
  const lot = await manifeste(ctx, lotId, base);
  return lot ? { ok: true, lot, jobs: await jobsDuLot(ctx, lot, base) } : refus(ctx, 'NOT_FOUND');
}
export async function preparerLotImagesPour(ctx: ContexteStudio, e: EntreeLotImages, base: BaseStudio = db, maintenant = new Date()): Promise<Resultat<{lot: VueLotImages}>> {
  if (!estUuid(e.projectId) || !Number.isInteger(e.nombre) || Number(e.nombre) < 1 || Number(e.nombre) > 6) return refus(ctx, 'INVALID_SCHEMA');
  try {
    return await base.transaction(async tx => {
      const devis: DevisPresente[] = [];
      for (let i = 0; i < Number(e.nombre); i++) {
        const r = await creerDevis(ctx, { projectId: e.projectId, operations: [OPERATION_IMAGE], variante: true, controleVision: e.controleVision }, tx as unknown as BaseStudio, maintenant);
        if (!r.ok) throw new Refus(r);
        const premier = devis[0];
        if (premier && (premier.projectVersionId !== r.devis.projectVersionId || premier.inputHash !== r.devis.inputHash || premier.pricingVersion !== r.devis.pricingVersion || premier.promptReleaseId !== r.devis.promptReleaseId)) throw new Refus(refus(ctx, 'VERSION_CONFLICT'));
        devis.push(r.devis);
      }
      const q = devis[0]!;
      const [projet] = await tx.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, String(e.projectId))).limit(1);
      const contenu: Omit<VueLotImages, 'empreinte'> = { id: randomUUID(), projectId: String(e.projectId), versionId: q.projectVersionId, nombre: devis.length, type: 'images-meme-consigne', devis,
        totalCredits: devis.reduce((s,q) => s+q.maximumCredits,0), totalUsdMicros: devis.reduce((s,q) => s+q.maximumUsdMicros,0),
        qualification: qualifierDevis(devis.flatMap(q => q.lignes)), expiresAt: new Date(Math.min(...devis.map(q => new Date(q.expiresAt).getTime()))) };
      const lot = { ...contenu, empreinte: empreinte(contenu) };
      await ajouterAudit(tx, ctx, { action: ACTION, brandId: projet!.brandId, targetType: 'studio_image_batch', targetId: lot.id, versionAfter: lot.versionId, details: lot as unknown as Record<string, unknown> });
      return { ok: true as const, lot };
    });
  } catch (e) { return e instanceof Refus ? e.resultat : refus(ctx, 'PERSISTENCE_FAILED'); }
}

/** Aucun appel fournisseur : réservation/approbations/outbox dans UNE transaction. */
export async function approuverLotImagesPour(ctx: ContexteStudio, e: ConfirmationLotImages, o: OptionsApprobation & { fournisseurImage: boolean; verifierDevis?: (id: string) => Promise<ErreurStudio | null> }): Promise<Resultat<{jobs: JobPresente[]; deja: boolean}>> {
  const base = o.base ?? db;
  if (e.confirme !== true) return refus(ctx, 'INVALID_SCHEMA');
  try {
    return await base.transaction(async tx => {
      // Même verrou que la barrière fournisseur : sérialise les lots et leur budget.
      await tx.execute(sql`select pg_advisory_xact_lock(${VERROU_PLAFOND})`);
      const lot = await manifeste(ctx, e.lotId, tx);
      if (!lot) throw new Refus(refus(ctx, 'NOT_FOUND'));
      if (e.empreinte !== lot.empreinte || e.creditsAnnonces !== lot.totalCredits || e.usdMicrosAnnonces !== lot.totalUsdMicros) throw new Refus(refus(ctx, 'INVALID_SCHEMA', 'Le total confirmé ne correspond pas au devis du lot.'));
      const deja = await jobsDuLot(ctx, lot, tx);
      if (deja.length === lot.nombre) return { ok: true as const, jobs: deja, deja: true };
      if (deja.length) throw new Refus(refus(ctx, 'VERSION_CONFLICT', 'Ce lot comporte déjà une exécution partielle. Consulte son suivi avant toute nouvelle demande.'));
      if (!o.fournisseurImage) throw new Refus(refus(ctx, 'UNSUPPORTED_CAPABILITY'));
      // Réserve ouverte conservée, notamment pendant une réconciliation. Le double
      // comptage d'une requête en vol est conservateur, jamais un budget élargi.
      if (!o.plafond) throw new Refus(refus(ctx, 'BUDGET_EXCEEDED', 'Le plafond doit être vérifié avant ce lancement.'));
      const depense = await depenseDepuis(tx as unknown as BaseDepense, new Date((o.maintenant ?? new Date()).getTime() - 30 * 86400000));
      const L = schema.studioBudgetLedger;
      const [reste] = await tx.select({ total: sql<string>`coalesce(sum(case when ${L.kind} = 'reserve' then ${L.usdMicros} when ${L.kind} in ('settle','release') then -${L.usdMicros} else 0 end),0)` }).from(L);
      const depenseUsd = Math.max(depense, o.plafond.depenseUsd) + Math.max(0, Number(reste?.total ?? 0)) / 1e6;
      if (refusPlafondDollars({ ...o.plafond, depenseUsd, devisUsdMicros: lot.totalUsdMicros })) throw new Refus(refus(ctx, 'BUDGET_EXCEEDED'));
      // Le plafond d'essai est CUMULÉ depuis sa date fixe, jamais réinitialisé
      // par la fenêtre glissante du plafond global ni par un nouveau lot.
      const essai = await budgetEssaiDe(tx as unknown as BaseDepense, ctx.workspaceId);
      if (essai) {
        const engage = await depenseEspaceDepuis(tx as unknown as BaseDepense, ctx.workspaceId, essai.depuis);
        const [reserveEspace] = await tx.select({ total: sql<string>`coalesce(sum(case when ${L.kind} = 'reserve' then ${L.usdMicros} when ${L.kind} in ('settle','release') then -${L.usdMicros} else 0 end),0)` })
          .from(L).where(eq(L.workspaceId, ctx.workspaceId));
        const retenu = engage + Math.max(0, Number(reserveEspace?.total ?? 0)) / 1e6;
        if (refusPlafondDollars({ capUsd: essai.plafondUsd, depenseUsd: retenu, bloque: false, devisUsdMicros: lot.totalUsdMicros })) {
          throw new Refus(refus(ctx, 'BUDGET_EXCEEDED', 'Le budget total d’essai de cet espace ne permet pas ce lot.'));
        }
      }
      const jobs: JobPresente[] = [];
      for (const q of lot.devis) {
        const coupe = await o.verifierDevis?.(q.id);
        if (coupe) throw new Refus(coupe);
        const r = await approuverEtMettreEnFile(ctx, { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `lot:${lot.id}:${q.id}` }, { ...o, base: tx as unknown as BaseStudio, plafond: { ...o.plafond, depenseUsd } });
        if (!r.ok) throw new Refus(r);
        jobs.push(r.job);
      }
      return { ok: true as const, jobs, deja: false };
    });
  } catch (e) { return e instanceof Refus ? e.resultat : refus(ctx, 'PERSISTENCE_FAILED'); }
}
