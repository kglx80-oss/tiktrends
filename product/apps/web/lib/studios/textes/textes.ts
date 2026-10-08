import 'server-only';
import { db, schema, eq, and } from '@tiktrends/db';
import {
  lireTextesBrief, validerSaisieTexte, changementsTextes, exporterTextes, calquesTexte, injectionDansCalque, hypotheseDuBrief,
  erreurStudio, aPermissionEspace, validerFormeBrief,
  LIMITE_CARACTERES, LIMITE_MESUREE, TYPES_TEXTE, LIBELLES_TYPE_TEXTE,
  type BriefCanonique, type ContenuVersion, type ErreurStudio, type TexteStudio, type TypeTexte, type CalqueTexteResume,
  type DisponibiliteTextes, type FormatExportTextes,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { enregistrerVersion, lireVersion, estUuid, type VersionStudio } from '../depot';
import type { BaseStudio } from '../execution/types';
import { creerPropositionManuelle } from '../propositions/proposer';
import type { ResultatProposer } from '../propositions/types';
import { projetEtBrief, conflitDeBase } from './ecrire';

/**
 * Textes retenus d'un projet · lecture, enregistrement (nouvelle version,
 * 409 respecté), export SANS média (FLOW-10), injection EXPLICITE dans un
 * calque texte choisi, par une proposition (chemin commun L4-A).
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

export interface FaitVue { id: string; claim: string; kind: string }

export interface VueTextes {
  projet: { id: string; title: string; marque: string };
  version: { id: string; n: number };
  brief: {
    objectif: string; audience: string; hypothese: string | null; variable: string; faits: FaitVue[]; invariants: string[]; exclusions: string[];
  } | null;
  briefIllisible: boolean;
  textes: TexteStudio[];
  calques: CalqueTexteResume[];
  limites: Array<{ type: TypeTexte; libelle: string; max: number; mesuree: boolean }>;
  disponibilite: DisponibiliteTextes;
  peutEcrire: boolean;
  peutExporter: boolean;
}

export async function lireVueTextesPour(ctx: ContexteStudio, projectId: unknown, disponibilite: (briefPresent: boolean) => Promise<DisponibiliteTextes>): Promise<Resultat<{ vue: VueTextes }>> {
  const pb = await projetEtBrief(ctx, projectId);
  if (!pb.ok) return pb;
  const [m] = await db.select({ nom: schema.brands.name }).from(schema.brands).where(and(eq(schema.brands.id, pb.projet.brandId), eq(schema.brands.workspaceId, ctx.workspaceId))).limit(1);
  const b = pb.brief;
  const h = b ? hypotheseDuBrief(b) : null;
  return {
    ok: true,
    vue: {
      projet: { id: pb.projet.id, title: pb.projet.title, marque: m?.nom ?? '' },
      version: { id: pb.version.id, n: pb.version.n },
      brief: b ? {
        objectif: b.objective, audience: b.audience, hypothese: h?.statement ?? null, variable: b.testedVariable,
        faits: b.facts.map((f) => ({ id: f.id, claim: f.claim, kind: f.kind })), invariants: b.invariants, exclusions: b.exclusions,
      } : null,
      briefIllisible: pb.briefIllisible,
      textes: lireTextesBrief(b),
      calques: calquesTexte(pb.version.content as ContenuVersion),
      limites: TYPES_TEXTE.map((t) => ({ type: t, libelle: LIBELLES_TYPE_TEXTE[t], max: LIMITE_CARACTERES[t], mesuree: LIMITE_MESUREE[t] })),
      disponibilite: await disponibilite(!!b),
      peutEcrire: aPermissionEspace(ctx.permissions, 'studio.propose'),
      peutExporter: aPermissionEspace(ctx.permissions, 'studio.export'),
    },
  };
}

/**
 * Enregistre la liste ENTIÈRE des textes retenus · chaque texte revalidé
 * contre le brief courant (allégations = faits du brief), puis une nouvelle
 * version par la commande L1 (base obligatoire, 409, audit).
 */
export async function enregistrerTextesPour(ctx: ContexteStudio, e: { projectId: unknown; baseVersionId: unknown; textes: unknown; raison?: unknown }): Promise<Resultat<{ version: VersionStudio; inchange: boolean; textes: TexteStudio[] }>> {
  if (!estUuid(e.projectId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const pb = await projetEtBrief(ctx, e.projectId);
  if (!pb.ok) return pb;
  if (!pb.brief) return erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, targetIds: [pb.projet.id], message: 'Ce projet n’a pas de brief lisible · les textes s’y rangent.' });
  if (!Array.isArray(e.textes) || e.textes.length > 100) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'textes', raison: 'liste de 100 textes au plus attendue' }] });
  const textes: TexteStudio[] = [];
  const violations: Array<{ chemin: string; raison: string }> = [];
  e.textes.forEach((t, i) => {
    const o = (typeof t === 'object' && t !== null ? t : {}) as { type?: unknown; langue?: unknown; texte?: unknown; sources?: unknown };
    if (o.type === 'libre' && typeof o.texte === 'string' && o.texte.trim()) { textes.push({ id: '', type: 'libre', langue: '', texte: o.texte.trim().slice(0, 12_000), sources: [] }); return; }
    const v = validerSaisieTexte({ type: o.type, langue: o.langue, texte: o.texte, sources: o.sources }, pb.brief!, `textes/${i}`);
    if (v.ok) textes.push(v.texte); else violations.push(...v.violations);
  });
  if (violations.length) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations });
  const raison = typeof e.raison === 'string' && e.raison.trim() ? e.raison.trim().slice(0, 200) : `Textes retenus (${textes.length})`;
  const r = await enregistrerVersion(ctx, { projectId: pb.projet.id, baseVersionId: e.baseVersionId, changes: changementsTextes(textes, raison), allowedPaths: ['/brief/texts'], raison });
  if (!r.ok) return r;
  const brief = (r.version.content as { brief?: unknown }).brief;
  return { ...r, textes: brief && validerFormeBrief(brief).length === 0 ? lireTextesBrief(brief as BriefCanonique) : [] };
}

/** Export des textes d'une version · lecture pure, aucune ligne, aucun débit, aucun média. */
export async function exporterTextesPour(ctx: ContexteStudio, e: { projectId: unknown; versionId?: unknown; format?: unknown }): Promise<Resultat<{ nomFichier: string; typeMime: string; contenu: string }>> {
  const format: FormatExportTextes = e.format === 'csv' || e.format === 'json' ? e.format : 'markdown';
  const pb = await projetEtBrief(ctx, e.projectId);
  if (!pb.ok) return pb;
  let version = pb.version;
  if (e.versionId !== undefined && e.versionId !== null && e.versionId !== pb.version.id) {
    const v = await lireVersion(ctx, e.versionId);
    if (!v.ok || v.version.projectId !== pb.projet.id) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
    version = v.version;
  }
  const brut = (version.content as { brief?: unknown }).brief ?? null;
  if (!brut || validerFormeBrief(brut).length) return erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, targetIds: [pb.projet.id], message: 'Cette version n’a pas de brief lisible · rien à exporter.' });
  const brief = brut as BriefCanonique;
  const [m] = await db.select({ nom: schema.brands.name }).from(schema.brands).where(and(eq(schema.brands.id, pb.projet.brandId), eq(schema.brands.workspaceId, ctx.workspaceId))).limit(1);
  const r = exporterTextes(lireTextesBrief(brief), { titre: pb.projet.title, marque: m?.nom ?? '', versionN: version.n, versionId: version.id, exporteLe: new Date().toISOString(), brief }, format);
  return { ok: true, ...r };
}

/**
 * Injecte un texte dans UN calque texte choisi · par une PROPOSITION humaine
 * (`creerPropositionManuelle`, L4-A) : rien n'est appliqué ici, la version
 * ne change qu'à l'application (aperçu, 409, audit du chemin commun).
 */
export async function injecterTextePour(ctx: ContexteStudio, e: { projectId: unknown; baseVersionId: unknown; layerId: unknown; texte: unknown }, base: BaseStudio = db): Promise<Resultat<ResultatProposer>> {
  const pb = await projetEtBrief(ctx, e.projectId);
  if (!pb.ok) return pb;
  const conflit = await conflitDeBase(ctx, pb.version, e.baseVersionId);
  if (conflit) return conflit;
  const i = injectionDansCalque(pb.version.content as ContenuVersion, e.layerId, typeof e.texte === 'string' ? e.texte : '');
  if (!i.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: i.violations });
  return creerPropositionManuelle(ctx, { projectId: pb.projet.id, baseVersionId: e.baseVersionId, cible: i.cible, changes: i.changes, explication: i.explication, allowedPaths: i.allowedPaths }, base);
}
