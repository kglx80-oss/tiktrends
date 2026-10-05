'use server';

import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { enregistrementFormat, mediaAnnonce, sansFormatCreatif, validerChoixFormat, type FormatCreatifId } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { FEATURES, canAccess, denyReason } from '../../lib/rbac';
import { effectiveAccess } from '../../lib/access';
import type { InspoAd } from '@tiktrends/integrations';

/* Appels directs (depuis des boutons client via useTransition) · pas de redirection,
   donc pas de rechargement de page ni de nouvelle recherche Trendtrack. */

/**
 * La Veille (offre Core) · même contrôle que la page `/veille` (lot 19C).
 * Cacher l'écran ne protège rien · une action serveur reste appelable
 * directement. `saveAd` ne vérifiait que la session.
 */
const Veille = FEATURES.find((f) => f.key === 'inspo')!;
type SessionVeille = NonNullable<Awaited<ReturnType<typeof getSession>>>;

async function gardeVeille(): Promise<{ s: SessionVeille } | { error: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée · reconnecte-toi puis réessaie.' };
  const a = effectiveAccess(s);
  if (!canAccess(a, Veille)) {
    return {
      error: denyReason(a, Veille) === 'plan'
        ? 'La Veille est incluse dès l’offre Core · un propriétaire de l’espace peut changer d’offre dans Réglages.'
        : 'Ton rôle ne permet pas d’utiliser la Veille · demande à un administrateur de l’espace.',
    };
  }
  return { s };
}

export async function saveAd(input: { platform: string; externalId: string; snapshot: InspoAd }): Promise<{ ok: boolean; error?: string }> {
  const g = await gardeVeille();
  if ('error' in g) return { ok: false, error: g.error };
  const { s } = g;
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
  return { ok: true };
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
  if (!s || !db) return { error: 'Session expirée · reconnecte-toi puis réessaie.' } as const;
  if (denyReason(effectiveAccess(s), Veille) === 'role') {
    return { error: 'Ton rôle ne permet pas d’utiliser la Veille · demande à un administrateur de l’espace.' } as const;
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
  return { s, marque, espace, ici, introuvable } as const;
}

/** Range une créa sauvegardée dans un board/dossier (null = « Sans dossier »). */
export async function setSavedAdFolder(input: { platform: string; externalId: string; folder: string | null }): Promise<ResultatEcriture> {
  const g = await gardeEcritureSauvegarde(input);
  if ('error' in g) return { ok: false, error: g.error };
  const folder = input.folder?.trim().slice(0, 60) || null;
  const maj = await db!.update(schema.savedAds).set({ folder }).where(g.ici).returning({ id: schema.savedAds.id });
  return maj.length ? { ok: true } : { ok: false, error: g.introuvable };
}

export async function unsaveAd(input: { platform: string; externalId: string }): Promise<ResultatEcriture> {
  const g = await gardeEcritureSauvegarde(input);
  if ('error' in g) return { ok: false, error: g.error };
  const retirees = await db!.delete(schema.savedAds).where(g.ici).returning({ id: schema.savedAds.id });
  if (retirees.length === 0 && g.marque) {
    // Rien dans CETTE marque · si l'espace la garde pour une autre marque, on le
    // dit au lieu de répondre « retirée ». Absente partout · déjà retirée, oui.
    const [ailleurs] = await db!.select({ id: schema.savedAds.id }).from(schema.savedAds).where(g.espace).limit(1);
    if (ailleurs) return { ok: false, error: g.introuvable };
  }
  return { ok: true };
}

export async function followBrand(input: { platform: string; name: string; externalId?: string; logoUrl?: string; domain?: string }): Promise<void> {
  const s = await getSession();
  if (!s || !db || !input.name) return;
  const brand = await getActiveBrand(s.workspaceId);
  // On capte le domaine de la créa qui a servi à suivre · c'est ce qui offre le
  // lien « site » sur la puce, sans nouvelle recherche.
  const domain = input.domain?.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').trim() || null;
  await db.insert(schema.followedBrands)
    .values({ workspaceId: s.workspaceId, brandId: brand?.id ?? null, platform: input.platform, name: input.name, externalId: input.externalId || null, logoUrl: input.logoUrl || null, domain })
    .onConflictDoNothing();
}

export async function unfollowBrand(input: { platform: string; name: string }): Promise<void> {
  const s = await getSession();
  if (!s || !db) return;
  await db.delete(schema.followedBrands).where(and(
    eq(schema.followedBrands.workspaceId, s.workspaceId),
    eq(schema.followedBrands.platform, input.platform),
    eq(schema.followedBrands.name, input.name),
  ));
}
