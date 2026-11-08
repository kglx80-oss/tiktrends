import 'server-only';
import { and, asc, count, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { collectionsDeSauvegarde, ecritureCollections, rattacherTags, trierTags, type TagVeille } from '@tiktrends/core';

/**
 * Lot 6 V5 · lectures et écritures des TAGS, de la NOTE et des COLLECTIONS
 * d'une sauvegarde (0070). Hors d'un fichier `'use server'` · rien ici n'est
 * appelable depuis le client. Les GARDES (rôle, offre, espace, marque) sont
 * celles des actions de `app/actions/inspo.ts`, qui seules appellent ces
 * écritures · les règles (normalisation, bornes, doublons) sont au noyau
 * (`tags-veille`) et arrivent ici déjà validées.
 */

/** Le vocabulaire d'une marque (ou des sauvegardes sans marque · `brandId` null), borné à l'espace. */
const portee = (workspaceId: string, brandId: string | null) => and(
  eq(schema.veilleTags.workspaceId, workspaceId),
  brandId ? eq(schema.veilleTags.brandId, brandId) : isNull(schema.veilleTags.brandId),
);

/** Au plus 500 tags lus d'un vocabulaire · une saisie à la main n'en produit pas autant. */
const VOCABULAIRE_MAX = 500;

export async function lireVocabulaire(workspaceId: string, brandId: string | null): Promise<Array<TagVeille & { id: string }>> {
  if (!db) return [];
  const l = await db.select({ id: schema.veilleTags.id, cle: schema.veilleTags.nameKey, nom: schema.veilleTags.name })
    .from(schema.veilleTags).where(portee(workspaceId, brandId)).orderBy(asc(schema.veilleTags.name)).limit(VOCABULAIRE_MAX);
  return trierTags(l);
}

/** Le vocabulaire avec, pour chaque tag, le nombre de sauvegardes qu'il porte (`/tags`, TG02). */
export async function lireVocabulaireCompte(workspaceId: string, brandId: string | null): Promise<Array<TagVeille & { id: string; n: number }>> {
  if (!db) return [];
  const l = await db.select({ id: schema.veilleTags.id, cle: schema.veilleTags.nameKey, nom: schema.veilleTags.name, n: count(schema.veilleTagsSauvegardes.savedAdId) })
    .from(schema.veilleTags)
    .leftJoin(schema.veilleTagsSauvegardes, and(eq(schema.veilleTagsSauvegardes.tagId, schema.veilleTags.id), eq(schema.veilleTagsSauvegardes.workspaceId, workspaceId)))
    .where(portee(workspaceId, brandId))
    .groupBy(schema.veilleTags.id, schema.veilleTags.nameKey, schema.veilleTags.name)
    .limit(VOCABULAIRE_MAX);
  return trierTags(l.map((t) => ({ ...t, n: Number(t.n) })));
}

/** Les tags et collections de CES sauvegardes de l'espace · une entrée par sauvegarde lue. */
export async function lireMetaSauvegardes(workspaceId: string, ids: readonly string[]): Promise<Map<string, { tags: TagVeille[]; collections: string[] }>> {
  const out = new Map<string, { tags: TagVeille[]; collections: string[] }>();
  if (!db || ids.length === 0) return out;
  const liste = [...new Set(ids)];
  const [tags, colls] = await Promise.all([
    db.select({ id: schema.veilleTagsSauvegardes.savedAdId, cle: schema.veilleTags.nameKey, nom: schema.veilleTags.name })
      .from(schema.veilleTagsSauvegardes)
      .innerJoin(schema.veilleTags, and(eq(schema.veilleTags.id, schema.veilleTagsSauvegardes.tagId), eq(schema.veilleTags.workspaceId, workspaceId)))
      .where(and(eq(schema.veilleTagsSauvegardes.workspaceId, workspaceId), inArray(schema.veilleTagsSauvegardes.savedAdId, liste))),
    db.select({ id: schema.savedAdCollections.savedAdId, nom: schema.savedAdCollections.name })
      .from(schema.savedAdCollections)
      .where(and(eq(schema.savedAdCollections.workspaceId, workspaceId), inArray(schema.savedAdCollections.savedAdId, liste)))
      .orderBy(asc(schema.savedAdCollections.addedAt), asc(schema.savedAdCollections.name)),
  ]);
  const ligne = (id: string) => { let x = out.get(id); if (!x) { x = { tags: [], collections: [] }; out.set(id, x); } return x; };
  for (const t of tags) ligne(t.id).tags.push({ cle: t.cle, nom: t.nom });
  for (const c of colls) ligne(c.id).collections.push(c.nom);
  for (const x of out.values()) x.tags = trierTags(x.tags);
  return out;
}

/** Les noms de collection en usage dans ce périmètre de sauvegardes (dossiers + liens 0070). */
export async function lireCollectionsDisponibles(workspaceId: string, brandId: string | null): Promise<string[]> {
  if (!db) return [];
  const ici = brandId ? and(eq(schema.savedAds.workspaceId, workspaceId), eq(schema.savedAds.brandId, brandId)) : eq(schema.savedAds.workspaceId, workspaceId);
  const [dossiers, liens] = await Promise.all([
    db.selectDistinct({ nom: schema.savedAds.folder }).from(schema.savedAds).where(and(ici, sql`${schema.savedAds.folder} IS NOT NULL`)).limit(200),
    db.selectDistinct({ nom: schema.savedAdCollections.name }).from(schema.savedAdCollections)
      .innerJoin(schema.savedAds, eq(schema.savedAds.id, schema.savedAdCollections.savedAdId)).where(ici).limit(200),
  ]);
  return [...new Set([...dossiers, ...liens].map((d) => d.nom?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'fr'));
}

export interface MetaValidee { tags?: TagVeille[]; note?: string | null; collections?: string[] }
export interface MetaRelue { tags: TagVeille[]; note: string | null; collections: string[] }

/**
 * Écrit ce qui est DEMANDÉ (un champ absent n'est pas touché) sur UNE
 * sauvegarde déjà retrouvée dans le périmètre de l'appelant, en une
 * transaction, puis relit l'état réel.
 *  · `note` · `saved_ads.note` ;
 *  · `collections` · le dossier (= la première) et les liens 0070 ;
 *  · `tags` · réemploie le vocabulaire de la marque de la sauvegarde (même
 *    clé = même tag), crée ce qui manque, retire les liens des tags décochés ·
 *    jamais la sauvegarde, jamais la note, jamais un tag du vocabulaire.
 */
export async function ecrireMetaSauvegarde(cible: { savedAdId: string; workspaceId: string; brandId: string | null; userId: string }, meta: MetaValidee): Promise<MetaRelue> {
  const base = db!;
  await base.transaction(async (tx) => {
    if (meta.note !== undefined) {
      await tx.update(schema.savedAds).set({ note: meta.note }).where(and(eq(schema.savedAds.id, cible.savedAdId), eq(schema.savedAds.workspaceId, cible.workspaceId)));
    }
    if (meta.collections !== undefined) {
      const e = ecritureCollections(meta.collections);
      await tx.update(schema.savedAds).set({ folder: e.folder }).where(and(eq(schema.savedAds.id, cible.savedAdId), eq(schema.savedAds.workspaceId, cible.workspaceId)));
      // Seules les collections DÉCOCHÉES perdent leur lien · les autres gardent leur date.
      await tx.delete(schema.savedAdCollections).where(and(
        eq(schema.savedAdCollections.savedAdId, cible.savedAdId),
        eq(schema.savedAdCollections.workspaceId, cible.workspaceId),
        ...(e.liens.length ? [notInArray(schema.savedAdCollections.name, e.liens)] : []),
      ));
      if (e.liens.length) {
        await tx.insert(schema.savedAdCollections).values(e.liens.map((name) => ({ savedAdId: cible.savedAdId, name, workspaceId: cible.workspaceId }))).onConflictDoNothing();
      }
    }
    if (meta.tags !== undefined) {
      const voc = await tx.select({ id: schema.veilleTags.id, cle: schema.veilleTags.nameKey, nom: schema.veilleTags.name })
        .from(schema.veilleTags).where(portee(cible.workspaceId, cible.brandId));
      const r = rattacherTags(voc, meta.tags);
      if (r.aCreer.length) {
        // Une création concurrente du même tag heurte l'index unique · rien n'est doublé, on relit.
        await tx.insert(schema.veilleTags).values(r.aCreer.map((t) => ({ workspaceId: cible.workspaceId, brandId: cible.brandId, name: t.nom, nameKey: t.cle, createdBy: cible.userId }))).onConflictDoNothing();
      }
      const cles = meta.tags.map((t) => t.cle);
      const voulus = cles.length
        ? (await tx.select({ id: schema.veilleTags.id }).from(schema.veilleTags).where(and(portee(cible.workspaceId, cible.brandId), inArray(schema.veilleTags.nameKey, cles)))).map((t) => t.id)
        : [];
      await tx.delete(schema.veilleTagsSauvegardes).where(and(
        eq(schema.veilleTagsSauvegardes.savedAdId, cible.savedAdId),
        eq(schema.veilleTagsSauvegardes.workspaceId, cible.workspaceId),
        ...(voulus.length ? [notInArray(schema.veilleTagsSauvegardes.tagId, voulus)] : []),
      ));
      if (voulus.length) {
        await tx.insert(schema.veilleTagsSauvegardes).values(voulus.map((tagId) => ({ savedAdId: cible.savedAdId, tagId, workspaceId: cible.workspaceId, addedBy: cible.userId }))).onConflictDoNothing();
      }
    }
  });
  return relireMeta(cible.workspaceId, cible.savedAdId);
}

/** L'état réel d'une sauvegarde de l'espace · ce que l'écran affiche après le oui. */
export async function relireMeta(workspaceId: string, savedAdId: string): Promise<MetaRelue> {
  const [ligne] = await db!.select({ note: schema.savedAds.note, folder: schema.savedAds.folder }).from(schema.savedAds)
    .where(and(eq(schema.savedAds.id, savedAdId), eq(schema.savedAds.workspaceId, workspaceId))).limit(1);
  const m = (await lireMetaSauvegardes(workspaceId, [savedAdId])).get(savedAdId);
  return { tags: m?.tags ?? [], note: ligne?.note ?? null, collections: collectionsDeSauvegarde(ligne?.folder ?? null, m?.collections) };
}

/** `setSavedAdFolder` range dans UN dossier · les liens de collections multiples cèdent la place à ce dossier. */
export async function oublierCollectionsMultiples(workspaceId: string, savedAdIds: readonly string[]): Promise<void> {
  if (!db || savedAdIds.length === 0) return;
  await db.delete(schema.savedAdCollections).where(and(eq(schema.savedAdCollections.workspaceId, workspaceId), inArray(schema.savedAdCollections.savedAdId, [...savedAdIds])));
}

/** Les tags d'un vocabulaire · `porteeTag` pour les actions de `/tags`. */
export const porteeTag = portee;
