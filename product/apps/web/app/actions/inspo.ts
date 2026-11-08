'use server';

import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  enregistrementFormat, mediaAnnonce, sansFormatCreatif, validerChoixFormat, validerCollections, validerNote, validerRenommage, validerTag, validerTags,
  type FormatCreatifId, type TagVeille,
} from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { FEATURES, denyReason } from '../../lib/rbac';
import { effectiveAccess } from '../../lib/access';
import { gardeVeille } from '../../lib/veille-garde';
import type { InspoAd } from '@tiktrends/integrations';
import {
  ecrireMetaSauvegarde, lireCollectionsDisponibles, lireVocabulaire, oublierCollectionsMultiples, porteeTag, relireMeta,
  type MetaRelue, type MetaValidee,
} from '../../lib/veille-tags';

/* Appels directs (depuis des boutons client via useTransition) · pas de redirection,
   donc pas de rechargement de page ni de nouvelle recherche Trendtrack. */

// La garde de la Veille (rôle ET offre de `inspo`) vit dans `lib/veille-garde`,
// partagée avec les vues enregistrées · même contrôle que la page `/veille`.
const Veille = FEATURES.find((f) => f.key === 'inspo')!;

/**
 * Lot 6 V5 · ce que la pop-up « Sauvegarder » ajoute à la sauvegarde · tags,
 * note, collections. Un champ ABSENT n'est pas touché (une pub gardée d'un clic
 * ailleurs garde sa note et ses tags) · présent, il est validé au noyau
 * (`tags-veille`) AVANT toute écriture, et un refus n'écrit rien.
 */
export interface MetaSaisie { tags?: unknown; note?: unknown; collections?: unknown }

function validerMeta(input: MetaSaisie): { ok: true; meta: MetaValidee } | { ok: false; error: string } {
  const meta: MetaValidee = {};
  if (input.tags !== undefined) { const v = validerTags(input.tags); if (!v.ok) return { ok: false, error: v.raison }; meta.tags = v.tags; }
  if (input.note !== undefined) { const v = validerNote(input.note); if (!v.ok) return { ok: false, error: v.raison }; meta.note = v.note; }
  if (input.collections !== undefined) { const v = validerCollections(input.collections); if (!v.ok) return { ok: false, error: v.raison }; meta.collections = v.collections; }
  return { ok: true, meta };
}
const metaDemandee = (m: MetaValidee) => m.tags !== undefined || m.note !== undefined || m.collections !== undefined;

export type ResultatSauvegarde = { ok: boolean; error?: string; sauvegarde?: MetaRelue };

export async function saveAd(input: { platform: string; externalId: string; snapshot: InspoAd } & MetaSaisie): Promise<ResultatSauvegarde> {
  const g = await gardeVeille();
  if ('error' in g) return { ok: false, error: g.error };
  const { s } = g;
  const m = validerMeta(input);
  if (!m.ok) return { ok: false, error: m.error };
  const brand = await getActiveBrand(s.workspaceId);
  // Un classement ne voyage jamais avec la sauvegarde · il s'écrit par
  // `classerFormatSauvegarde` (validé, daté, signé), pas depuis le client.
  const ecrite = await db!.insert(schema.savedAds)
    .values({ workspaceId: s.workspaceId, userId: s.user.id, brandId: brand?.id ?? null, platform: input.platform, externalId: input.externalId, snapshot: sansFormatCreatif(input.snapshot) })
    .onConflictDoNothing()
    .returning({ id: schema.savedAds.id });
  // Message 55 · c · la clé unique est (espace, plateforme, external_id) · une
  // annonce déjà gardée pour une AUTRE marque n'est pas réécrite, et elle reste
  // invisible dans les sauvegardes de la marque active · répondre « oui » serait
  // un faux succès (★ plein ici, absente de Sauvegardes et de Formats).
  if (ecrite.length === 0 && brand) {
    const [deja] = await db!.select({ brandId: schema.savedAds.brandId }).from(schema.savedAds).where(and(
      eq(schema.savedAds.workspaceId, s.workspaceId),
      eq(schema.savedAds.platform, input.platform),
      eq(schema.savedAds.externalId, input.externalId),
    )).limit(1);
    if (deja && deja.brandId !== brand.id) {
      return { ok: false, error: 'Annonce déjà sauvegardée pour une autre marque de l’espace · elle n’apparaît pas dans les sauvegardes de cette marque.' };
    }
  }
  if (!metaDemandee(m.meta)) return { ok: true };
  // Nouvelle ou déjà gardée ICI · la même ligne reçoit tags, note et collections (« Sauvegarder » ou « Mettre à jour »).
  const [ligne] = ecrite.length
    ? [{ id: ecrite[0]!.id, brandId: brand?.id ?? null }]
    : await db!.select({ id: schema.savedAds.id, brandId: schema.savedAds.brandId }).from(schema.savedAds).where(and(
      eq(schema.savedAds.workspaceId, s.workspaceId),
      eq(schema.savedAds.platform, input.platform),
      eq(schema.savedAds.externalId, input.externalId),
      ...(brand ? [eq(schema.savedAds.brandId, brand.id)] : []),
    )).limit(1);
  if (!ligne) return { ok: false, error: 'Annonce introuvable dans tes sauvegardes · recharge la page.' };
  const sauvegarde = await ecrireMetaSauvegarde({ savedAdId: ligne.id, workspaceId: s.workspaceId, brandId: ligne.brandId, userId: s.user.id }, m.meta);
  return { ok: true, sauvegarde };
}

export type ResultatFormat = { ok: true; format: FormatCreatifId | null; date: string | null } | { ok: false; error: string };

/**
 * Formats créatifs v1 · qualification MANUELLE d'une annonce sauvegardée.
 *
 * Écrit `saved_ads.snapshot_json.formatCreatif` = `{ id, version, date, auteur }`
 * (aucune migration) · `non_classe` retire le classement. Identité = (espace de
 * la session, plateforme, `external_id`) · la clé unique de la table · plus la
 * marque active quand il y en a une · une annonce d'un autre espace ou d'une
 * autre marque n'est jamais atteinte (introuvable). La règle
 * (liste, média, validation) vit au noyau (`formats-creatifs.ts`).
 */
export async function classerFormatSauvegarde(input: { platform: string; externalId: string; format: string }): Promise<ResultatFormat> {
  const g = await gardeVeille();
  if ('error' in g) return { ok: false, error: g.error };
  const { s } = g;
  const platform = typeof input?.platform === 'string' ? input.platform.slice(0, 40) : '';
  const externalId = typeof input?.externalId === 'string' ? input.externalId.slice(0, 200) : '';
  if (!platform || !externalId) return { ok: false, error: 'Annonce introuvable dans ton espace · recharge la page.' };

  // Message 55 · c · le MÊME périmètre que `/veille/formats` et Sauvegardes ·
  // l'espace de la session ET, quand une marque est active, cette marque · une
  // sauvegarde d'une autre marque n'est ni lue ni écrite depuis celle-ci.
  const marque = await getActiveBrand(s.workspaceId);
  const introuvable = marque
    ? 'Annonce introuvable dans les sauvegardes de cette marque · recharge la page.'
    : 'Annonce introuvable dans ton espace · recharge la page.';
  const ici = and(
    eq(schema.savedAds.workspaceId, s.workspaceId),
    eq(schema.savedAds.platform, platform),
    eq(schema.savedAds.externalId, externalId),
    ...(marque ? [eq(schema.savedAds.brandId, marque.id)] : []),
  );
  const [ligne] = await db!.select({ snapshot: schema.savedAds.snapshot }).from(schema.savedAds).where(ici).limit(1);
  if (!ligne) return { ok: false, error: introuvable };

  const choix = validerChoixFormat(input.format, mediaAnnonce((ligne.snapshot as { mediaType?: unknown } | null)?.mediaType));
  if (!choix.ok) return { ok: false, error: choix.raison };

  const enr = choix.id ? enregistrementFormat(choix.id, s.user.id, new Date()) : null;
  const maj = await db!.update(schema.savedAds)
    .set({ snapshot: enr
      ? sql`jsonb_set(${schema.savedAds.snapshot}, '{formatCreatif}', ${JSON.stringify(enr)}::jsonb, true)`
      : sql`${schema.savedAds.snapshot} - 'formatCreatif'` })
    .where(ici)
    .returning({ id: schema.savedAds.id });
  if (maj.length === 0) return { ok: false, error: introuvable };
  return { ok: true, format: choix.id, date: enr?.date ?? null };
}

export type ResultatEcriture = { ok: true } | { ok: false; error: string };

/**
 * Message 56 · garde des écritures sur une sauvegarde existante (ranger,
 * retirer). Même matrice que `saveAd` et `classerFormatSauvegarde` pour le
 * RÔLE de la Veille (un lecteur client, que `/saved` renvoie à l'accueil,
 * supprimait et déplaçait les sauvegardes de l'espace en appelant l'action) et
 * pour le périmètre (espace + marque active). L'OFFRE n'est pas exigée ici ·
 * un espace Starter garde `/saved` comme aujourd'hui (dette connue, rapportée ·
 * la fermer changerait ce qu'il voit).
 */
async function gardeEcritureSauvegarde(input: { platform: unknown; externalId: unknown }) {
  const s = await getSession();
  if (!s || !db) return { ok: false, error: 'Session expirée · reconnecte-toi puis réessaie.' } as const;
  if (denyReason(effectiveAccess(s), Veille) === 'role') {
    return { ok: false, error: 'Ton rôle ne permet pas d’utiliser la Veille · demande à un administrateur de l’espace.' } as const;
  }
  const marque = await getActiveBrand(s.workspaceId);
  const platform = typeof input.platform === 'string' ? input.platform : '';
  const externalId = typeof input.externalId === 'string' ? input.externalId : '';
  const espace = and(
    eq(schema.savedAds.workspaceId, s.workspaceId),
    eq(schema.savedAds.platform, platform),
    eq(schema.savedAds.externalId, externalId),
  );
  const ici = marque ? and(espace, eq(schema.savedAds.brandId, marque.id)) : espace;
  const introuvable = marque
    ? 'Annonce introuvable dans les sauvegardes de cette marque · recharge la page.'
    : 'Annonce introuvable dans ton espace · recharge la page.';
  return { ok: true, s, marque, espace, ici, introuvable } as const;
}

/** Range une créa sauvegardée dans un board/dossier (null = « Sans dossier »). */
export async function setSavedAdFolder(input: { platform: string; externalId: string; folder: string | null }): Promise<ResultatEcriture> {
  const g = await gardeEcritureSauvegarde(input);
  if (!g.ok) return { ok: false, error: g.error };
  const folder = input.folder?.trim().slice(0, 60) || null;
  const maj = await db!.update(schema.savedAds).set({ folder }).where(g.ici).returning({ id: schema.savedAds.id });
  // Lot 6 · ranger dans UN dossier · ses éventuelles collections multiples (0070) cèdent la place à ce dossier.
  await oublierCollectionsMultiples(g.s.workspaceId, maj.map((x) => x.id));
  return maj.length ? { ok: true } : { ok: false, error: g.introuvable };
}

/**
 * Lot 6 V5 · « Mettre à jour » une sauvegarde EXISTANTE · tags, note,
 * collections (un champ absent n'est pas touché · retirer un tag n'efface ni
 * la sauvegarde ni la note). Même garde que ranger et retirer
 * (`gardeEcritureSauvegarde` · rôle de la Veille, espace et marque active).
 */
export async function majSauvegarde(input: { platform: string; externalId: string } & MetaSaisie): Promise<ResultatSauvegarde> {
  const g = await gardeEcritureSauvegarde(input);
  if (!g.ok) return { ok: false, error: g.error };
  const m = validerMeta(input);
  if (!m.ok) return { ok: false, error: m.error };
  const [ligne] = await db!.select({ id: schema.savedAds.id, brandId: schema.savedAds.brandId }).from(schema.savedAds).where(g.ici).limit(1);
  if (!ligne) return { ok: false, error: g.introuvable };
  if (!metaDemandee(m.meta)) return { ok: true, sauvegarde: await relireMeta(g.s.workspaceId, ligne.id) };
  const sauvegarde = await ecrireMetaSauvegarde({ savedAdId: ligne.id, workspaceId: g.s.workspaceId, brandId: ligne.brandId, userId: g.s.user.id }, m.meta);
  return { ok: true, sauvegarde };
}

export type LectureSauvegarde =
  | { ok: true; sauvee: boolean; sauvegarde: MetaRelue; vocabulaire: TagVeille[]; collections: string[] }
  | { ok: false; error: string };

/**
 * Lot 6 V5 · ce que la pop-up « Sauvegarder » lit à l'ouverture · la
 * sauvegarde de CETTE pub ici (ou rien), le vocabulaire de tags de sa marque
 * et les collections en usage. Lecture seule, même garde que les écritures
 * sur une sauvegarde · une pub d'une autre marque ou d'un autre espace n'est
 * jamais lue (« pas encore gardée », sans rien de l'autre marque).
 */
export async function lireSauvegardeVeille(input: { platform: string; externalId: string }): Promise<LectureSauvegarde> {
  const g = await gardeEcritureSauvegarde(input);
  if (!g.ok) return { ok: false, error: g.error };
  const [ligne] = await db!.select({ id: schema.savedAds.id, brandId: schema.savedAds.brandId }).from(schema.savedAds).where(g.ici).limit(1);
  const brandId = ligne ? ligne.brandId : g.marque?.id ?? null;
  const [vocabulaire, collections, sauvegarde] = await Promise.all([
    lireVocabulaire(g.s.workspaceId, brandId),
    lireCollectionsDisponibles(g.s.workspaceId, brandId),
    ligne ? relireMeta(g.s.workspaceId, ligne.id) : Promise.resolve<MetaRelue>({ tags: [], note: null, collections: [] }),
  ]);
  return { ok: true, sauvee: !!ligne, sauvegarde, vocabulaire: vocabulaire.map(({ cle, nom }) => ({ cle, nom })), collections };
}

/* ───────────────────────── /tags · le vocabulaire (TG01, TG04) ───────────────────────── */

export type ResultatTag = { ok: true; tag: { id: string } & TagVeille } | { ok: false; error: string };

/** Le vocabulaire de la marque active (ou des sauvegardes sans marque) · même garde que les écritures sur une sauvegarde. */
async function gardeTags() {
  const g = await gardeEcritureSauvegarde({ platform: '', externalId: '' });
  if (!g.ok) return g;
  return { ...g, brandId: g.marque?.id ?? null };
}

/** « + Ajouter un tag » (TG01) · un tag vide de toute sauvegarde, dans le vocabulaire de la marque active. */
export async function creerTagVeille(input: { nom: unknown }): Promise<ResultatTag> {
  const g = await gardeTags();
  if (!g.ok) return { ok: false, error: g.error };
  const v = validerTag(input?.nom);
  if (!v.ok) return { ok: false, error: v.raison };
  const [deja] = await db!.select({ nom: schema.veilleTags.name }).from(schema.veilleTags)
    .where(and(porteeTag(g.s.workspaceId, g.brandId), eq(schema.veilleTags.nameKey, v.tag.cle))).limit(1);
  if (deja) return { ok: false, error: `Le tag « ${deja.nom} » existe déjà.` };
  const [cree] = await db!.insert(schema.veilleTags)
    .values({ workspaceId: g.s.workspaceId, brandId: g.brandId, name: v.tag.nom, nameKey: v.tag.cle, createdBy: g.s.user.id })
    .onConflictDoNothing().returning({ id: schema.veilleTags.id });
  if (!cree) return { ok: false, error: `Le tag « ${v.tag.nom} » existe déjà.` };
  return { ok: true, tag: { id: cree.id, ...v.tag } };
}

/** « Renommer » (TG04) · le libellé ET la clé · refusé si un autre tag du vocabulaire porte déjà cette clé. */
export async function renommerTagVeille(input: { id: unknown; nom: unknown }): Promise<ResultatTag> {
  const g = await gardeTags();
  if (!g.ok) return { ok: false, error: g.error };
  const id = typeof input?.id === 'string' && /^[0-9a-f-]{36}$/i.test(input.id) ? input.id : '';
  if (!id) return { ok: false, error: 'Tag introuvable · recharge la page.' };
  const voc = await lireVocabulaire(g.s.workspaceId, g.brandId);
  if (!voc.some((t) => t.id === id)) return { ok: false, error: 'Tag introuvable pour cette marque · recharge la page.' };
  const v = validerRenommage(id, input?.nom, voc);
  if (!v.ok) return { ok: false, error: v.raison };
  try {
    const maj = await db!.update(schema.veilleTags).set({ name: v.tag.nom, nameKey: v.tag.cle })
      .where(and(eq(schema.veilleTags.id, id), porteeTag(g.s.workspaceId, g.brandId))).returning({ id: schema.veilleTags.id });
    if (!maj.length) return { ok: false, error: 'Tag introuvable pour cette marque · recharge la page.' };
  } catch {
    return { ok: false, error: 'Un tag de ce nom existe déjà · choisis un autre nom.' };
  }
  return { ok: true, tag: { id, ...v.tag } };
}

export async function unsaveAd(input: { platform: string; externalId: string }): Promise<ResultatEcriture> {
  const g = await gardeEcritureSauvegarde(input);
  if (!g.ok) return { ok: false, error: g.error };
  const retirees = await db!.delete(schema.savedAds).where(g.ici).returning({ id: schema.savedAds.id });
  if (retirees.length === 0 && g.marque) {
    // Rien dans CETTE marque · si l'espace la garde pour une autre marque, on le
    // dit au lieu de répondre « retirée ». Absente partout · déjà retirée, oui.
    const [ailleurs] = await db!.select({ id: schema.savedAds.id }).from(schema.savedAds).where(g.espace).limit(1);
    if (ailleurs) return { ok: false, error: g.introuvable };
  }
  return { ok: true };
}

/**
 * Suivre un concurrent · un NOUVEL élément de Veille, comme `saveAd` · même
 * garde (`gardeVeille` · rôle ET offre de la feature `inspo`). Ne vérifiait que
 * la session · un lecteur client, ou un espace Starter, ajoutait des marques au
 * suivi en appelant l'action directement. Le refus se dit par une valeur, pas
 * par une exception · le bouton revient à « + Suivre » et l'annonce.
 */
export async function followBrand(input: { platform: string; name: string; externalId?: string; logoUrl?: string; domain?: string }): Promise<ResultatEcriture> {
  const g = await gardeVeille();
  if ('error' in g) return { ok: false, error: g.error };
  const { s } = g;
  if (!db || !input.name) return { ok: false, error: 'Marque introuvable · recharge la page.' };
  const brand = await getActiveBrand(s.workspaceId);
  // On capte le domaine de la créa qui a servi à suivre · c'est ce qui offre le
  // lien « site » sur la puce, sans nouvelle recherche.
  const domain = input.domain?.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').trim() || null;
  await db.insert(schema.followedBrands)
    .values({ workspaceId: s.workspaceId, brandId: brand?.id ?? null, platform: input.platform, name: input.name, externalId: input.externalId || null, logoUrl: input.logoUrl || null, domain })
    .onConflictDoNothing();
  return { ok: true };
}

/**
 * Ne plus suivre un concurrent · même matrice que les écritures sur une
 * sauvegarde existante (`gardeEcritureSauvegarde`) · le RÔLE de la Veille est
 * exigé (un lecteur client retirait les marques suivies de l'espace), l'OFFRE
 * ne l'est pas · un espace Starter garde `/saved` et son onglet « Concurrents »
 * (dette connue, même périmètre que ranger et retirer). Retirer ne dépense
 * rien, et refuser le retrait laisserait une marque suivie qu'on ne peut plus
 * arrêter de suivre.
 */
export async function unfollowBrand(input: { platform: string; name: string }): Promise<ResultatEcriture> {
  const s = await getSession();
  if (!s || !db) return { ok: false, error: 'Session expirée · reconnecte-toi puis réessaie.' };
  if (denyReason(effectiveAccess(s), Veille) === 'role') {
    return { ok: false, error: 'Ton rôle ne permet pas d’utiliser la Veille · demande à un administrateur de l’espace.' };
  }
  await db.delete(schema.followedBrands).where(and(
    eq(schema.followedBrands.workspaceId, s.workspaceId),
    eq(schema.followedBrands.platform, input.platform),
    eq(schema.followedBrands.name, input.name),
  ));
  return { ok: true };
}
