'use server';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  validerNomDossier, peutDeplacerDossier, estDroitAsset, type DossierPlat, type DroitAsset,
} from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { GUARD } from '../../lib/guard-error';
import { refusEcritureBibliotheque, TEXTE_REFUS_BIBLIOTHEQUE } from '../../lib/bibliotheque-acces';

/**
 * Bibliothèque V5 · actions des DOSSIERS et des DROITS (fondation PR-1, sans UI).
 *
 * MÊME garde que le reste de la Bibliothèque · `refusEcritureBibliotheque`
 * (rôle ET offre, `lib/bibliotheque-acces.ts`), appliquée AVANT toute lecture ou
 * écriture : une action serveur reste appelable directement, l'écran caché ne
 * protège rien. Refus neutre, qui ne dépend jamais de l'objet visé.
 *
 * Portée · `workspaceId` est la frontière DURE : tout filtre et tout write la
 * porte. Un dossier `locked` (système, ex. « Photos produit ») est refusé au
 * renommage et à la suppression. Aucune dépense IA ici.
 *
 * Les RÈGLES (nom valide, cycle d'arbre, droit valide) vivent au noyau
 * (`bibliotheque-dossiers.ts`), testées à part · jamais réécrites ici.
 *
 * Le test `securite-bibliotheque-dossiers` énumère les exports de ce fichier et
 * refuse tout export qui n'est pas une action gardée · un oubli le fait tomber.
 */

type SessionBiblio = NonNullable<Awaited<ReturnType<typeof getSession>>>;

async function gardeEcriture(): Promise<{ s: SessionBiblio } | { error: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const refus = refusEcritureBibliotheque(s);
  if (refus) return { error: TEXTE_REFUS_BIBLIOTHEQUE[refus] };
  return { s };
}

/** Les dossiers VIVANTS de l'espace (corbeille exclue), en forme plate pour le noyau. */
async function dossiersVivants(workspaceId: string): Promise<DossierPlat[]> {
  if (!db) return [];
  const rows = await db.select({
    id: schema.libraryFolders.id, parentId: schema.libraryFolders.parentId,
    name: schema.libraryFolders.name, brandId: schema.libraryFolders.brandId,
    locked: schema.libraryFolders.locked,
  }).from(schema.libraryFolders)
    .where(and(eq(schema.libraryFolders.workspaceId, workspaceId), isNull(schema.libraryFolders.deletedAt)));
  return rows;
}

/** Un dossier vivant de l'espace, par id · null si absent, d'un autre espace ou en corbeille. */
async function lireDossier(workspaceId: string, id: unknown) {
  if (!db || typeof id !== 'string' || !id) return null;
  const [row] = await db.select().from(schema.libraryFolders)
    .where(and(eq(schema.libraryFolders.id, id), eq(schema.libraryFolders.workspaceId, workspaceId), isNull(schema.libraryFolders.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Les ids du sous-arbre VIVANT à partir de `racine` (racine comprise). */
function sousArbre(dossiers: ReadonlyArray<{ id: string; parentId: string | null }>, racine: string): string[] {
  const enfantsPar = new Map<string | null, string[]>();
  for (const d of dossiers) {
    const l = enfantsPar.get(d.parentId) ?? [];
    l.push(d.id);
    enfantsPar.set(d.parentId, l);
  }
  const out: string[] = [];
  const pile = [racine];
  const vus = new Set<string>();
  while (pile.length) {
    const id = pile.pop()!;
    if (vus.has(id)) continue; // garde-fou (données incohérentes) · pas de boucle
    vus.add(id);
    out.push(id);
    for (const e of enfantsPar.get(id) ?? []) pile.push(e);
  }
  return out;
}

/** Crée un dossier (racine, ou sous un parent vivant). Sous un parent, hérite de sa marque. */
export async function creerDossierAction(input: { nom: string; parentId?: string | null; brandId?: string | null }): Promise<{ ok?: true; id?: string; error?: string }> {
  const g = await gardeEcriture();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };

  const nomV = validerNomDossier(input?.nom);
  if (!nomV.ok) return { error: nomV.raison };

  // Marque : sous un parent, on hérite de SA marque (un sous-arbre reste dans
  // une seule marque). À la racine, marque explicite (validée dans l'espace) ou
  // null (commun à l'espace, comme `assets.brandId`).
  let brandId: string | null = null;
  if (input?.parentId != null) {
    const parent = await lireDossier(s.workspaceId, input.parentId);
    if (!parent) return { error: 'Dossier parent introuvable.' };
    brandId = parent.brandId;
  } else if (input?.brandId != null) {
    const [b] = await db.select({ id: schema.brands.id }).from(schema.brands)
      .where(and(eq(schema.brands.id, input.brandId), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
    if (!b) return { error: 'Marque introuvable dans cet espace.' };
    brandId = input.brandId;
  }

  const [row] = await db.insert(schema.libraryFolders).values({
    workspaceId: s.workspaceId, brandId, parentId: input?.parentId ?? null, name: nomV.nom,
  }).returning({ id: schema.libraryFolders.id });
  return { ok: true, id: row!.id };
}

/** Renomme un dossier. Refuse un dossier système (verrouillé). */
export async function renommerDossierAction(input: { id: string; nom: string }): Promise<{ ok?: true; error?: string }> {
  const g = await gardeEcriture();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };

  const nomV = validerNomDossier(input?.nom);
  if (!nomV.ok) return { error: nomV.raison };
  const dossier = await lireDossier(s.workspaceId, input?.id);
  if (!dossier) return { error: 'Dossier introuvable.' };
  if (dossier.locked) return { error: 'Ce dossier système ne peut pas être renommé.' };

  await db.update(schema.libraryFolders).set({ name: nomV.nom, updatedAt: new Date() })
    .where(and(eq(schema.libraryFolders.id, dossier.id), eq(schema.libraryFolders.workspaceId, s.workspaceId)));
  return { ok: true };
}

/** Déplace un dossier sous un nouveau parent (ou à la racine). Refuse un cycle. */
export async function deplacerDossierAction(input: { id: string; parentId: string | null }): Promise<{ ok?: true; error?: string }> {
  const g = await gardeEcriture();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };

  const dossier = await lireDossier(s.workspaceId, input?.id);
  if (!dossier) return { error: 'Dossier introuvable.' };
  const nouveauParent = input?.parentId ?? null;

  const liste = await dossiersVivants(s.workspaceId);
  const dep = peutDeplacerDossier(liste, dossier.id, nouveauParent);
  if (!dep.ok) return { error: dep.raison };

  // Un sous-arbre reste dans une seule marque · la destination doit partager la
  // marque du dossier (la racine, elle, accepte tout). On ne reclasse pas le
  // sous-arbre d'une marque à l'autre dans la fondation.
  if (nouveauParent != null) {
    const parent = liste.find((d) => d.id === nouveauParent)!;
    if (parent.brandId !== dossier.brandId) return { error: 'Le dossier de destination appartient à une autre marque.' };
  }

  await db.update(schema.libraryFolders).set({ parentId: nouveauParent, updatedAt: new Date() })
    .where(and(eq(schema.libraryFolders.id, dossier.id), eq(schema.libraryFolders.workspaceId, s.workspaceId)));
  return { ok: true };
}

/** Met un dossier et son sous-arbre à la CORBEILLE (réversible). Refuse un dossier système. */
export async function supprimerDossierAction(input: { id: string }): Promise<{ ok?: true; error?: string }> {
  const g = await gardeEcriture();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };

  const dossier = await lireDossier(s.workspaceId, input?.id);
  if (!dossier) return { error: 'Dossier introuvable.' };
  if (dossier.locked) return { error: 'Ce dossier système ne peut pas être supprimé.' };

  const liste = await dossiersVivants(s.workspaceId);
  const ids = sousArbre(liste, dossier.id);
  await db.update(schema.libraryFolders).set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.libraryFolders.workspaceId, s.workspaceId), inArray(schema.libraryFolders.id, ids)));
  return { ok: true };
}

/** Restaure un dossier de la corbeille (et le sous-arbre mis en corbeille avec lui). */
export async function restaurerDossierAction(input: { id: string }): Promise<{ ok?: true; error?: string }> {
  const g = await gardeEcriture();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };

  if (typeof input?.id !== 'string' || !input.id) return { error: 'Dossier introuvable.' };
  // Dossier en corbeille de CET espace.
  const [dossier] = await db.select().from(schema.libraryFolders)
    .where(and(eq(schema.libraryFolders.id, input.id), eq(schema.libraryFolders.workspaceId, s.workspaceId))).limit(1);
  if (!dossier || dossier.deletedAt == null) return { error: 'Dossier introuvable dans la corbeille.' };

  // Restaure ce dossier et ses descendants en corbeille (chaîne par parentId).
  const tous = await db.select({ id: schema.libraryFolders.id, parentId: schema.libraryFolders.parentId })
    .from(schema.libraryFolders).where(eq(schema.libraryFolders.workspaceId, s.workspaceId));
  const ids = sousArbre(tous, dossier.id);
  await db.update(schema.libraryFolders).set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(schema.libraryFolders.workspaceId, s.workspaceId), inArray(schema.libraryFolders.id, ids)));
  return { ok: true };
}

/** Range un asset dans un dossier (ou l'en sort avec `folderId: null`). */
export async function affecterAssetDossierAction(input: { assetId: string; folderId: string | null }): Promise<{ ok?: true; error?: string }> {
  const g = await gardeEcriture();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };

  if (typeof input?.assetId !== 'string' || !input.assetId) return { error: 'Asset introuvable.' };
  const folderId = input?.folderId ?? null;
  if (folderId != null) {
    const dossier = await lireDossier(s.workspaceId, folderId);
    if (!dossier) return { error: 'Dossier de destination introuvable.' };
  }

  const maj = await db.update(schema.assets).set({ folderId })
    .where(and(eq(schema.assets.id, input.assetId), eq(schema.assets.workspaceId, s.workspaceId)))
    .returning({ id: schema.assets.id });
  if (!maj.length) return { error: 'Asset introuvable.' };
  return { ok: true };
}

/** Définit (ou efface avec `droit: null`) le droit d'usage d'un asset. */
export async function definirDroitsAssetAction(input: { assetId: string; droit: DroitAsset | null }): Promise<{ ok?: true; error?: string }> {
  const g = await gardeEcriture();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };

  if (typeof input?.assetId !== 'string' || !input.assetId) return { error: 'Asset introuvable.' };
  const droit = input?.droit ?? null;
  if (droit != null && !estDroitAsset(droit)) return { error: 'Droit d’usage inconnu.' };

  const maj = await db.update(schema.assets).set({ rights: droit })
    .where(and(eq(schema.assets.id, input.assetId), eq(schema.assets.workspaceId, s.workspaceId)))
    .returning({ id: schema.assets.id });
  if (!maj.length) return { error: 'Asset introuvable.' };
  return { ok: true };
}
