import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import {
  composerBrief, referenceProduit, referenceSource, annonceObservee, empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU,
  type ContenuVersion, type SourceReferenceStudio, type HypotheseTest, type ProduitMarque,
} from '@tiktrends/core';
import type { IdsStudios } from './studios-semis';
import type { BaseStudio } from '../lib/studios/execution/types';
import { dataUri, PHOTOS } from '../../../packages/core/test/l5c-fixtures';

/**
 * Outils des tests L5-C · catalogue EXISTANT d'une marque (produit à sept
 * photos dont une distante, autre produit, logo, image de bibliothèque), une
 * annonce concurrente source du projet, un projet dont le brief est composé
 * par L4-B, et les COMPTES des tables qu'aucun geste de ce lot ne doit toucher.
 */

export const T0 = new Date('2026-10-08T09:00:00Z');
export { PHOTOS, dataUri };

export function sourceConcurrente(ids: IdsStudios): SourceReferenceStudio {
  const annonce = annonceObservee({
    id: '9001', platform: 'meta', daysRunning: 64, mediaType: 'image', thumbnailUrl: 'https://cdn.test/v.jpg',
    advertiserName: 'Lumière Botanique', body: 'Votre regard mérite mieux. Nos lunettes à verres miroir tiennent partout et pour toujours.',
    callToAction: 'Acheter', landingDomain: 'lbcosmetiques.fr',
  })!;
  return referenceSource({ type: 'veille_ad', annonce, savedAdId: null, portee: { workspaceId: ids.wsA, brandId: ids.brandA1 }, observeLe: T0, format: null, retourVeille: null });
}

export const HYPOTHESE: HypotheseTest = {
  id: 'hyp_1', statement: 'Une accroche sur la tenue en course augmente le taux de clic.', sourceIds: [], variable: 'Accroche',
  control: 'Accroche prix', treatment: 'Accroche tenue', invariants: ['Même visuel'], metric: 'Taux de clic (CTR)', decisionRule: '+15 % après 3 000 impressions', limitations: [],
};

export interface Catalogue { produit: ProduitMarque; autreMarque: string; logo: string; bibliotheque: string }

/** Le catalogue d'une marque, tel que les écrans existants l'écrivent (`products`, `brands.logo_url`, `assets`). */
export async function semerCatalogue(base: BaseStudio, ids: IdsStudios, brandId: string = ids.brandA1): Promise<Catalogue> {
  const [p] = await base.insert(schema.products).values({
    brandId, name: 'Lunettes Sport Bandeau', description: 'Lunettes de sport avec bandeau élastique', usp: 'Tiennent pendant la course', price: 49,
    url: 'https://boutique.test/lunettes', imageUrl: PHOTOS[0]!, imageUrls: PHOTOS,
  }).returning();
  await base.insert(schema.products).values({ brandId, name: 'Casquette', imageUrl: dataUri(40) });
  const [autre] = await base.insert(schema.products).values({ brandId: ids.brandA2, name: 'Produit de la marque A2', imageUrl: dataUri(50) }).returning();
  const logo = dataUri(60);
  await base.update(schema.brands).set({ logoUrl: logo }).where(eq(schema.brands.id, brandId));
  const [a] = await base.insert(schema.assets).values({ workspaceId: ids.wsA, brandId, name: 'Coureuse de face', kind: 'image', url: dataUri(70) }).returning();
  return {
    produit: { id: p!.id, name: p!.name, description: p!.description, usp: p!.usp, price: p!.price, url: p!.url, imageUrl: p!.imageUrl, imageUrls: p!.imageUrls },
    autreMarque: autre!.id, logo, bibliotheque: a!.id,
  };
}

/** Un projet « pub statique » de la marque, brief composé (source concurrente, hypothèse, produit sans photo épinglée). */
export async function projetStatique(base: BaseStudio, ids: IdsStudios, cat: Catalogue, o: { document?: ContenuVersion['document']; brandId?: string } = {}): Promise<{ projectId: string; versionId: string; source: SourceReferenceStudio }> {
  const brandId = o.brandId ?? ids.brandA1;
  const ws = brandId === ids.brandB1 ? ids.wsB : ids.wsA;
  const source = sourceConcurrente(ids);
  const produit = referenceProduit(cat.produit, T0);
  const brief = composerBrief({ sources: [source], hypothese: { ...HYPOTHESE, sourceIds: [source.sourceId] }, produit, audience: 'Coureurs 25-40 ans' });
  const contenu: ContenuVersion = { ...contenuVide(), brief: brief as unknown as Record<string, unknown>, productRef: produit as unknown as ContenuVersion['productRef'], document: o.document ?? null };
  const [p] = await base.insert(schema.studioProjects).values({ workspaceId: ws, brandId, kind: 'ads', title: `Lunettes · rentrée ${randomUUID().slice(0, 4)}`, ownerId: ids.ua, sourceRefs: [source] }).returning();
  const [v] = await base.insert(schema.studioProjectVersions).values({
    projectId: p!.id, workspaceId: ws, brandId, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: ids.ua, reason: 'test',
  }).returning();
  await base.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, p!.id));
  return { projectId: p!.id, versionId: v!.id, source };
}

const TABLES = {
  versions: 'studio_project_versions', propositions: 'studio_proposals', devis: 'studio_quotes', approbations: 'studio_approvals', jobs: 'studio_jobs',
  registre: 'studio_budget_ledger', outbox: 'studio_outbox', credits: 'credit_ledger', depenses: 'ai_spend', audit: 'studio_audit_events',
  runs: 'studio_prompt_runs', assets: 'studio_assets', produits: 'products', bibliotheque: 'assets',
} as const;
export type Comptes = Record<keyof typeof TABLES, number>;

export async function compter(base: BaseStudio): Promise<Comptes> {
  const out = {} as Comptes;
  for (const [k, t] of Object.entries(TABLES)) {
    const r = await base.execute(sql.raw(`select count(*)::int as n from ${t}`));
    const rows = (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Array<{ n: number }>;
    out[k as keyof Comptes] = Number(rows[0]!.n);
  }
  return out;
}

export function delta(avant: Comptes, apres: Comptes): Partial<Comptes> {
  const d: Partial<Comptes> = {};
  for (const k of Object.keys(avant) as Array<keyof Comptes>) if (apres[k] !== avant[k]) d[k] = apres[k] - avant[k];
  return d;
}

/** Aucun geste de ce lot ne produit de média, de devis, de job, de débit ni de seconde bibliothèque. */
export const JAMAIS_TOUCHE = ['devis', 'approbations', 'jobs', 'registre', 'outbox', 'credits', 'depenses', 'assets', 'produits', 'bibliotheque'] as const;
