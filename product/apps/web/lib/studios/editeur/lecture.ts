import 'server-only';
import { and, desc, eq, inArray, isNotNull, like, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  aPermissionEspace, erreurStudio, formatDepuisBrief, objetDansPortee, validerDocument,
  type ContenuVersion, type DocumentStudio, type ProduitInitial,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { lireAsset, lireProjet, lireVersion, estUuid } from '../depot';
import { estFichierCatalogue, lireFichierCatalogue } from '../rendu/catalogue-medias';
import type { DonneesEditeur, MediaEditeur, ReponseEditeur } from './types';

/**
 * Lecture PURE de ce qu'il faut à l'éditeur de calques · projet, marque,
 * version courante, document, format proposé, photo produit, médias du projet.
 * N'écrit rien (aucun brouillon, aucune version), ne prépare rien.
 *
 * Portée : `lireProjet` / `lireVersion` / `lireAsset` du dépôt L1 (filtre SQL
 * espace + marques visibles, puis revérification pure) ; la liste des médias
 * applique les deux mêmes gardes ici. Hors portée : `NOT_FOUND` neutre.
 */

const MEDIAS_MAX = 100;

const introuvable = (ctx: ContexteStudio) => erreurStudio('NOT_FOUND', { traceId: ctx.traceId });

function dimensions(a: { width: number | null; height: number | null }): { width: number; height: number } | null {
  return a.width && a.height && a.width > 0 && a.height > 0 ? { width: a.width, height: a.height } : null;
}

function nomMedia(a: { mime: string; origin: string; width: number; height: number }): string {
  const origine = { upload: 'Import', generated: 'Image produite', legacy: 'Ancien média', import: 'Import', render: 'Rendu' }[a.origin] ?? 'Média';
  return `${origine} · ${a.width} × ${a.height}`;
}

export async function lireEditeurPour(ctx: ContexteStudio, projectId: unknown): Promise<ReponseEditeur<{ donnees: DonneesEditeur }>> {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  const projet = p.projet;
  if (!projet.currentVersionId) return introuvable(ctx);
  const v = await lireVersion(ctx, projet.currentVersionId);
  if (!v.ok) return v;
  if (v.version.projectId !== projet.id) return introuvable(ctx);

  const contenu = v.version.content as ContenuVersion;
  const brut = contenu?.document ?? null;
  // Un document illisible n'est pas montré comme vide : on refuse de l'éditer.
  // L8-C · base = lui-même : OUVRIR un document n'est jamais refusé pour sa taille (limite de calques).
  if (brut !== null && validerDocument(brut, '/document', { base: brut }).length) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, message: 'Le document de cette version n’est pas lisible par l’éditeur · ouvre une autre version ou contacte le support.' });
  }
  const document = brut as DocumentStudio | null;

  const [marque] = await db.select({ name: schema.brands.name }).from(schema.brands)
    .where(and(eq(schema.brands.id, projet.brandId), eq(schema.brands.workspaceId, ctx.workspaceId))).limit(1);

  const brief = contenu?.brief as { formats?: unknown } | null;
  const formatPropose = formatDepuisBrief(Array.isArray(brief?.formats) ? brief!.formats : null);

  // Médias du projet · images stockées, dimensions connues · deux gardes de portée.
  const A = schema.studioAssets;
  const lignes = ctx.marques.length === 0 ? [] : await db.select().from(A).where(and(
    eq(A.workspaceId, ctx.workspaceId), inArray(A.brandId, ctx.marques), eq(A.projectId, projet.id),
    like(A.mime, 'image/%'), eq(A.storageState, 'stored'), isNotNull(A.width), isNotNull(A.height), sql`${A.width} > 0 AND ${A.height} > 0`,
  )).orderBy(desc(A.createdAt)).limit(MEDIAS_MAX);
  const medias: MediaEditeur[] = lignes
    .filter((a) => objetDansPortee({ workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque }, a))
    .flatMap((a) => {
      const d = dimensions(a);
      return d ? [{ assetId: a.id, mime: a.mime, width: d.width, height: d.height, nom: nomMedia({ mime: a.mime, origin: a.origin, ...d }) }] : [];
    });

  // Photo produit épinglée par le projet · seulement si on connaît ses dimensions.
  let produit: ProduitInitial | null = null;
  const assetProduit = contenu?.productRef?.assetId;
  if (estUuid(assetProduit)) {
    const a = await lireAsset(ctx, assetProduit);
    const d = a.ok && a.asset.mime.startsWith('image/') && a.asset.storageState === 'stored' ? dimensions(a.asset) : null;
    if (d) produit = { assetId: assetProduit, sourceWidth: d.width, sourceHeight: d.height, nom: 'Photo produit' };
  } else if (estFichierCatalogue(assetProduit)) {
    // Photo du catalogue épinglée par L5-C · dimensions relues dans ses octets (raccord d'intégration).
    const f = await lireFichierCatalogue(ctx, projet.id, assetProduit);
    if (f.ok) produit = { assetId: assetProduit, sourceWidth: f.largeur, sourceHeight: f.hauteur, nom: 'Photo produit' };
  }

  return {
    ok: true,
    donnees: {
      projet: { id: projet.id, titre: projet.title, marque: marque?.name ?? '' },
      version: { id: v.version.id, n: v.version.n },
      contenu,
      document,
      formatPropose,
      produit,
      medias,
      peutEnregistrer: aPermissionEspace(ctx.permissions, 'studio.propose'),
    },
  };
}
