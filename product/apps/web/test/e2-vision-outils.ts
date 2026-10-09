import { createHash, randomUUID } from 'node:crypto';
import {
  imageVide, borneControleVisionParImageMicros, OPERATION_CONTROLE_VISION, PROFIL_CONTROLE_VISION,
  type LigneDevis, type SnapshotJob,
} from '@tiktrends/core';
import { schema, eq } from '@tiktrends/db';
import { encoder } from '../lib/studios/benchmark/jeu-synthetique';
import { epinglerProduitPour } from '../lib/studios/produit/commandes';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import type { IdsStudios } from './studios-semis';
import { ctxDe } from './l4a-outils';
import { projetStatique, type Catalogue } from './l5c-outils';
import type { BaseStudio } from '../lib/studios/execution/types';

/**
 * E2 · outils partagés des gardes du contrôle visuel (pglite ET Postgres réel) :
 * un job image TERMINÉ, son média stocké (octets relus par le résolveur), son
 * instantané de devis approuvé avec ou sans la ligne « contrôle visuel ».
 */

export const MODELE = 'claude-sonnet-5';
export const O = { veilleOuverte: true, maintenant: new Date('2026-10-09T10:00:00Z') };
const sha = (o: Uint8Array) => createHash('sha256').update(o).digest('hex');

export const LIGNE_IMAGE: LigneDevis = { operation: 'keyframe:s_image', nature: 'generation', profil: 'image_generation', unites: 1, credits: 4, usdMicros: 80_000, inclus: false, natureCout: 'borne', motifEstimation: null };
export const ligneVision = (usdMicros = borneControleVisionParImageMicros(MODELE)): LigneDevis => ({ operation: OPERATION_CONTROLE_VISION, nature: 'generation', profil: PROFIL_CONTROLE_VISION, unites: 1, credits: 0, usdMicros, inclus: true, natureCout: 'borne', motifEstimation: null });
const snapshot = (versionId: string, lignes: LigneDevis[]): SnapshotJob => ({
  v: 1, quoteId: randomUUID(), projectVersionId: versionId, contentHash: '', impactPlanHash: '', pricingVersion: 'v', lignes, epinglage: null,
  reserve: { credits: 4, usdMicros: lignes.reduce((s, l) => s + l.usdMicros * l.unites, 0) }, parametres: {},
});

/** Stockage en mémoire des médias livrés · lu par `resolveurMediasStudio(lecteur)`. */
export const stockage = new Map<string, Uint8Array>();
export const lecteur = { async lire(m: { storageKey: string }) { return stockage.get(m.storageKey) ?? null; } };

/** Un job image TERMINÉ, média stocké, qualité `pending`, instantané approuvé avec `lignes`. */
export async function jobLivre(db: BaseStudio, ids: IdsStudios, cat: Catalogue, lignes: LigneDevis[] = [LIGNE_IMAGE, ligneVision()]): Promise<{ jobId: string; sortieId: string }> {
  const { projectId } = await projetStatique(db, ids, cat);
  const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), projectId, O);
  if (!c.ok) throw new Error(c.code);
  const photo5 = c.catalogue.produits.find((p) => p.produit.id === cat.produit.id)!.photos[4]!.assetId;
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const e = await epinglerProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: p!.currentVersionId, productId: cat.produit.id, photoId: photo5, composants: ['lunettes'] }, O);
  if (!e.ok) throw new Error(JSON.stringify(e));
  const octets = new Uint8Array(await encoder(imageVide(8, 6, [150, 110, 60, 255])));
  const assetId = randomUUID();
  const cle = `studios/${ids.wsA}/${assetId}.png`;
  await db.insert(schema.studioAssets).values({ id: assetId, workspaceId: ids.wsA, brandId: ids.brandA1, projectId, storageKey: cle, mime: 'image/png', bytes: octets.length, width: 8, height: 6, sha256: sha(octets), origin: 'generated', storageState: 'stored' });
  stockage.set(cle, octets);
  const [j] = await db.insert(schema.studioJobs).values({
    workspaceId: ids.wsA, brandId: ids.brandA1, projectId, projectVersionId: e.version.id, operation: 'image_generate', state: 'completed',
    idempotencyKey: `e2-${randomUUID()}`, inputHash: 'a'.repeat(64), snapshot: snapshot(e.version.id, lignes), result: { assets: { 'keyframe:s_image': assetId } },
  }).returning();
  return { jobId: j!.id, sortieId: `sta_${assetId}` };
}

/** La sortie validée de `quality.visual` · verdict « passed », composant confirmé. */
export const sortieVision = (sortieId: string) => JSON.stringify({
  status: 'ready', questions: [], warnings: [], evidenceIds: [],
  result: { verdict: 'passed', issues: [], unverifiable: [], summary: 'Lunettes visibles' },
  sortieId,
});
