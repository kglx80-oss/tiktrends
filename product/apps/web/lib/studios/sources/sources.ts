import 'server-only';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  annonceObservee, referenceSource, referenceCreation, apercuCreation, creationReutilisable, tombstoneSource, lienRetourVeille, lireFormatCreatif, formatCreatif, erreurStudio,
  SOURCES_MAX,
  type SourceReferenceStudio, type ErreurStudio, type FormatSource,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';

/**
 * Sources d'un projet · CHARGEMENT (à la préparation et à la création) et
 * ÉTAT VIVANT (à la lecture d'un projet).
 *
 * ── Ce qui est cru, ce qui ne l'est pas ──────────────────────────────────────
 *
 *  · Une SAUVEGARDE est désignée par son identifiant ; le snapshot est relu en
 *    base, dans l'espace de la session et une marque visible (ou sans marque).
 *    Hors portée ou inconnue : `NOT_FOUND`, la même réponse.
 *  · Une CRÉATION PRÉCÉDENTE (`generations`, Pubs IA / Image IA) est désignée
 *    par son identifiant ; elle est relue en base, rattachée à une marque de
 *    l'espace de la session ET visible (jointure `brands`). Hors portée,
 *    inconnue ou non réutilisable (`creationReutilisable`) : `NOT_FOUND`.
 *  · Une annonce de VEILLE n'existe pas en base : son snapshot vient du client,
 *    comme pour `saveAd` (même confiance, même garde Veille). Il est nettoyé
 *    par liste blanche (`annonceObservee`), le format créatif éventuel est
 *    retiré (il ne s'écrit que par l'action dédiée).
 *
 * Rien n'est écrit ici.
 */

export const REFUS_VEILLE = 'Ton accès ne comprend pas la Veille · une annonce de Veille ne peut pas servir de source. Pars d’une sauvegarde, ou demande l’accès à un administrateur de l’espace.';

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const estUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x);

/** Le contexte de retour vers la Veille, nettoyé · `null` s'il n'en reste rien. */
export function retourNettoye(rv: unknown): string | null {
  if (typeof rv !== 'string' || rv.length > 2000) return null;
  const lien = lienRetourVeille(rv);
  if (!lien) return null;
  const propre = lien.slice('/veille'.length).replace(/^\?/, '');
  return propre || null;
}

function formatDuSnapshot(snapshot: unknown): FormatSource | null {
  const f = lireFormatCreatif(snapshot);
  return f.etat === 'classe' && f.id ? { id: f.id, libelle: formatCreatif(f.id).libelle } : null;
}

/** Filtre de portée d'une sauvegarde · espace de la session ET marque visible (ou aucune). */
function porteeSauvegarde(ctx: ContexteStudio) {
  const t = schema.savedAds;
  const marques = ctx.marques.length ? or(isNull(t.brandId), inArray(t.brandId, ctx.marques)) : isNull(t.brandId);
  return and(eq(t.workspaceId, ctx.workspaceId), marques)!;
}

/** Filtre de portée d'une création · marque de l'espace de la session ET visible. */
function porteeCreation(ctx: ContexteStudio) {
  if (ctx.marques.length === 0) return sql`false`;
  return and(eq(schema.brands.workspaceId, ctx.workspaceId), inArray(schema.generations.brandId, ctx.marques))!;
}

/** Créations relues dans la portée · la marque vient de la jointure, jamais du client. */
async function creationsEnPortee(ctx: ContexteStudio, ids: string[]) {
  if (!ids.length) return [];
  const G = schema.generations;
  return db.select({
    id: G.id, brandId: G.brandId, kind: G.kind, status: G.status, assetUrls: G.assetUrls, input: G.input, createdAt: G.createdAt,
    workspaceId: schema.brands.workspaceId,
  }).from(G).innerJoin(schema.brands, eq(schema.brands.id, G.brandId)).where(and(inArray(G.id, ids), porteeCreation(ctx)));
}

/**
 * Charge et fige les sources demandées · `observeLe` = maintenant. Toute
 * source illisible ou hors portée fait échouer l'ensemble (tout ou rien).
 */
export async function chargerSources(
  ctx: ContexteStudio,
  entrees: unknown,
  o: { veilleOuverte: boolean; maintenant: Date },
): Promise<Resultat<{ sources: SourceReferenceStudio[] }>> {
  if (!Array.isArray(entrees) || entrees.length === 0 || entrees.length > SOURCES_MAX) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'sources', raison: `de 1 à ${SOURCES_MAX} sources` }] });
  }
  const sources: SourceReferenceStudio[] = [];
  const idsSauvegardes = entrees
    .filter((e): e is { type: 'sauvegarde'; id: unknown } => typeof e === 'object' && e !== null && (e as { type?: unknown }).type === 'sauvegarde')
    .map((e) => e.id);
  if (!idsSauvegardes.every(estUuid)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const lignes = idsSauvegardes.length
    ? await db.select({
      id: schema.savedAds.id, workspaceId: schema.savedAds.workspaceId, brandId: schema.savedAds.brandId,
      platform: schema.savedAds.platform, externalId: schema.savedAds.externalId, snapshot: schema.savedAds.snapshot,
    }).from(schema.savedAds).where(and(inArray(schema.savedAds.id, idsSauvegardes as string[]), porteeSauvegarde(ctx)))
    : [];
  const parId = new Map(lignes.map((l) => [l.id, l]));
  const idsCreations = entrees
    .filter((e): e is { type: 'creation'; id: unknown } => typeof e === 'object' && e !== null && (e as { type?: unknown }).type === 'creation')
    .map((e) => e.id);
  if (!idsCreations.every(estUuid)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const creations = new Map((await creationsEnPortee(ctx, idsCreations as string[])).map((l) => [l.id, l]));

  for (const [i, e] of entrees.entries()) {
    if (typeof e !== 'object' || e === null) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: `sources/${i}`, raison: 'source attendue' }] });
    const brut = e as { type?: unknown; id?: unknown; annonce?: unknown; retour?: unknown };
    const retourVeille = retourNettoye(brut.retour);
    if (brut.type === 'sauvegarde') {
      const l = parId.get(brut.id as string);
      // Revérification pure en plus du filtre SQL · deux gardes valent mieux qu'une.
      if (!l || l.workspaceId !== ctx.workspaceId || (l.brandId !== null && !ctx.marques.includes(l.brandId))) {
        return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
      }
      const annonce = annonceObservee({ ...(l.snapshot as Record<string, unknown>), id: l.externalId, platform: l.platform });
      if (!annonce) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: `sources/${i}`, raison: 'sauvegarde illisible' }] });
      sources.push(referenceSource({
        type: 'saved_ad', annonce, savedAdId: l.id, portee: { workspaceId: ctx.workspaceId, brandId: l.brandId },
        observeLe: o.maintenant, format: formatDuSnapshot(l.snapshot), retourVeille,
      }));
    } else if (brut.type === 'creation') {
      const l = creations.get(brut.id as string);
      // Revérification pure en plus du filtre SQL, comme pour une sauvegarde.
      if (!l || l.workspaceId !== ctx.workspaceId || !ctx.marques.includes(l.brandId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
      const ref = referenceCreation(l, { workspaceId: ctx.workspaceId, observeLe: o.maintenant });
      if (!ref) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
      sources.push(ref);
    } else if (brut.type === 'veille') {
      if (!o.veilleOuverte) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId, message: REFUS_VEILLE });
      const annonce = annonceObservee(brut.annonce);
      if (!annonce) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: `sources/${i}/annonce`, raison: 'annonce illisible (identifiant requis)' }] });
      sources.push(referenceSource({
        type: 'veille_ad', annonce, savedAdId: null, portee: { workspaceId: ctx.workspaceId, brandId: null },
        observeLe: o.maintenant, format: null, retourVeille,
      }));
    } else {
      return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: `sources/${i}/type`, raison: 'type veille, sauvegarde ou creation' }] });
    }
  }
  const uniques = new Map(sources.map((s) => [s.sourceId, s]));
  return { ok: true, sources: [...uniques.values()] };
}

/** Une source telle qu'on la MONTRE · état vivant, aperçu seulement si elle est lisible. */
export interface VueSource extends SourceReferenceStudio {
  apercu: string | null;
  lienSource: string | null;
}

/**
 * État VIVANT des sources d'un projet · lecture pure, aucune écriture. Une
 * sauvegarde retirée (ou hors portée désormais) devient un tombstone
 * `supprimee` ; une source Veille sans accès Veille devient `revoquee`. Le
 * tombstone garde les observations autorisées, jamais l'annonce elle-même.
 */
export async function etatSources(
  ctx: ContexteStudio,
  refs: readonly SourceReferenceStudio[],
  o: { veilleOuverte: boolean; maintenant: Date },
): Promise<VueSource[]> {
  const ids = refs.map((r) => r.savedAdId).filter(estUuid);
  const vivantes = ids.length
    ? await db.select({ id: schema.savedAds.id, workspaceId: schema.savedAds.workspaceId, brandId: schema.savedAds.brandId, snapshot: schema.savedAds.snapshot })
      .from(schema.savedAds).where(and(inArray(schema.savedAds.id, ids), porteeSauvegarde(ctx)))
    : [];
  const parId = new Map(vivantes.filter((l) => l.workspaceId === ctx.workspaceId).map((l) => [l.id, l]));
  const creations = new Map((await creationsEnPortee(ctx, refs.map((r) => r.generationId).filter(estUuid)))
    .filter((l) => l.workspaceId === ctx.workspaceId && creationReutilisable(l)).map((l) => [l.id, l]));
  return refs.map((r): VueSource => {
    if (r.statut !== 'active') return { ...r, apercu: null, lienSource: null };
    if (r.type === 'creation') {
      // Supprimée, archivée, ou sa marque n'est plus visible · tombstone, comme une sauvegarde retirée.
      const l = r.generationId ? creations.get(r.generationId) : undefined;
      if (!l) return { ...tombstoneSource(r, 'supprimee', o.maintenant), apercu: null, lienSource: null };
      return { ...r, apercu: apercuCreation(l), lienSource: null };
    }
    if (r.type === 'saved_ad') {
      const l = r.savedAdId ? parId.get(r.savedAdId) : undefined;
      if (!l) return { ...tombstoneSource(r, 'supprimee', o.maintenant), apercu: null, lienSource: null };
      const snap = (l.snapshot ?? {}) as { thumbnailUrl?: unknown };
      const apercu = typeof snap.thumbnailUrl === 'string' && /^https:\/\//.test(snap.thumbnailUrl) ? snap.thumbnailUrl : null;
      return { ...r, apercu, lienSource: r.retourVeille ? lienRetourVeille(r.retourVeille) : (r.format ? '/veille/formats' : '/saved') };
    }
    if (!o.veilleOuverte) return { ...tombstoneSource(r, 'revoquee', o.maintenant), apercu: null, lienSource: null };
    return { ...r, apercu: null, lienSource: lienRetourVeille(r.retourVeille ?? '') };
  });
}
