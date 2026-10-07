'use server';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  saisieCompletude, adCompletable, STATUT_NON_COMPLETABLE,
  type AdType, type ProduitMarque, type SaisieCompletude,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { GUARD } from '../../lib/guard-error';

/**
 * ADSMAP · « Compléter le test » (lot 21 · rupture R1 de l'audit lot 20).
 *
 * Mesuré avant (bc33cec8) · aucune action n'écrivait hypothèse, variable, offre
 * ni page sur une ad existante, et `adsmap_offers` / `adsmap_landing_pages`
 * n'étaient lues ni écrites hors du schéma · une ad née dans l'outil ne
 * pouvait donc jamais passer « prête ».
 *
 * Ce fichier ne décide rien · la règle (champs manquants, validation, ce qui
 * part à l'écriture) vit au noyau (`saisieCompletude`). Il vérifie au serveur ce
 * que l'écran ne peut pas garantir · droits (même garde que la création d'une
 * suite, `adsmap-iterate.ts`), ad de la MARQUE ACTIVE (concept → angle → désir
 * → persona → marque), statut brouillon ou proposition, produit de la même
 * marque · puis écrit dans UNE transaction.
 *
 * Il n'écrit JAMAIS `status` · « Préparer » (`prepareBatchAction`) et
 * « Lancer » (`launchBatchAction`) restent les seules portes vers `ready` et
 * `live`. Il ne modifie aucun produit · il les lit.
 *
 * Recherche-ou-création · une offre identique (même marque, même produit, même
 * prix, sans remise ni garantie ni lot) ou une page de même adresse sont
 * réutilisées plutôt que dupliquées. La table n'a pas de contrainte d'unicité ·
 * deux écritures STRICTEMENT simultanées de deux utilisateurs pourraient encore
 * créer deux lignes identiques (sans effet sur la complétude) · le double clic
 * d'un même utilisateur, lui, est bloqué à l'écran et ne réécrit rien au serveur.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** L'ad passée « prête » (ou au-delà) entre la lecture et l'écriture · tout est annulé. */
class ConflitStatut extends Error {}

/** L'ad de la marque active, ou `null` (autre marque, autre espace, introuvable). */
async function adDeLaMarque(adId: string, workspaceId: string, brandId: string) {
  const [row] = await db!.select({
    id: schema.ads.id, status: schema.ads.status, adType: schema.ads.adType,
    hypothesis: schema.ads.hypothesis, testedVariable: schema.ads.testedVariable,
    offerId: schema.ads.offerId, landingPageId: schema.ads.landingPageId,
  })
    .from(schema.ads)
    .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
    .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .where(and(eq(schema.ads.id, adId), eq(schema.ads.workspaceId, workspaceId), eq(schema.personas.brandId, brandId)))
    .limit(1);
  return row ?? null;
}

/**
 * Les produits de la marque active, pour préremplir l'offre et la page du
 * formulaire · lecture seule. Refusé hors de la marque active, comme l'écriture.
 */
export async function produitsCompletionAction(adId: string): Promise<{ produits?: ProduitMarque[]; error?: string }> {
  const g = await adsmapGuard({ minRole: 'member' });
  if ('error' in g) return { error: g.error };
  if (!UUID.test(adId)) return { error: GUARD.notFound('cette ad') };
  try {
    const ad = await adDeLaMarque(adId, g.s.workspaceId, g.brand.id);
    if (!ad) return { error: GUARD.notFound('cette ad') };
    const rows = await db!.select({ id: schema.products.id, nom: schema.products.name, prix: schema.products.price, url: schema.products.url })
      .from(schema.products)
      .where(eq(schema.products.brandId, g.brand.id))
      .orderBy(asc(schema.products.name))
      .limit(200);
    return { produits: rows.map((p) => ({ id: p.id, nom: p.nom, prix: p.prix ?? null, url: p.url ?? null })) };
  } catch (e) {
    return { error: logAndTranslate('adsmap:completer-produits', e, { subject: 'la lecture des produits', workspaceId: g.s.workspaceId }) };
  }
}

export interface CompleterTestInput extends SaisieCompletude { adId: string }

/**
 * Complète une ad brouillon · hypothèse, variable, offre et page du produit
 * CONFIRMÉES à l'écran. Rend ce qui manque encore (même règle que la préparation).
 */
export async function completerTestAction(input: CompleterTestInput): Promise<{ ok?: true; manques?: string[]; dejaEnregistre?: boolean; error?: string }> {
  const g = await adsmapGuard({ minRole: 'member' });
  if ('error' in g) return { error: g.error };
  if (!input || typeof input.adId !== 'string' || !UUID.test(input.adId)) return { error: GUARD.notFound('cette ad') };

  try {
    const ad = await adDeLaMarque(input.adId, g.s.workspaceId, g.brand.id);
    if (!ad) return { error: GUARD.notFound('cette ad') };
    if (!adCompletable(ad.status)) return { error: STATUT_NON_COMPLETABLE };

    // Le produit n'est lu que dans la marque active · un identifiant d'une autre
    // marque ne rend rien, et le noyau refuse un produit absent de la liste.
    const produitId = typeof input.produitId === 'string' && UUID.test(input.produitId) ? input.produitId : null;
    const produits: ProduitMarque[] = produitId
      ? (await db!.select({ id: schema.products.id, nom: schema.products.name, prix: schema.products.price, url: schema.products.url })
          .from(schema.products)
          .where(and(eq(schema.products.id, produitId), eq(schema.products.brandId, g.brand.id)))
          .limit(1)).map((p) => ({ id: p.id, nom: p.nom, prix: p.prix ?? null, url: p.url ?? null }))
      : [];

    const r = saisieCompletude(
      { status: ad.status, adType: ad.adType as AdType, hypothesis: ad.hypothesis, testedVariable: ad.testedVariable, offerId: ad.offerId, landingPageId: ad.landingPageId },
      {
        hypothesis: input.hypothesis, testedVariable: input.testedVariable, variableValue: input.variableValue,
        produitId, offre: input.offre ?? null, page: input.page ?? null,
      },
      produits,
    );
    if (!r.ok) return { error: r.erreur };
    if (r.dejaEnregistre) return { ok: true, manques: r.manquesApres, dejaEnregistre: true };

    // Offre, page et ad tombent ensemble ou pas du tout · un échec (ad passée
    // « prête » entre-temps, contrainte, réseau) ne laisse ni offre ni page
    // orpheline, ni ad à moitié complétée.
    await db!.transaction(async (tx) => {
      let offerId: string | undefined;
      if (r.offre) {
        const [existante] = await tx.select({ id: schema.offers.id }).from(schema.offers)
          .where(and(
            eq(schema.offers.workspaceId, g.s.workspaceId), eq(schema.offers.brandId, g.brand.id),
            eq(schema.offers.label, r.offre.label),
            r.offre.price === null ? isNull(schema.offers.price) : eq(schema.offers.price, r.offre.price),
            isNull(schema.offers.discount), isNull(schema.offers.guarantee),
            eq(schema.offers.bundle, false), eq(schema.offers.active, true),
          ))
          .limit(1);
        offerId = existante?.id ?? (await tx.insert(schema.offers).values({
          workspaceId: g.s.workspaceId, brandId: g.brand.id, label: r.offre.label, price: r.offre.price,
        }).returning({ id: schema.offers.id }))[0]?.id;
        if (!offerId) throw new Error('offre non créée');
      }

      let landingPageId: string | undefined;
      if (r.page) {
        const [existante] = await tx.select({ id: schema.landingPages.id }).from(schema.landingPages)
          .where(and(
            eq(schema.landingPages.workspaceId, g.s.workspaceId), eq(schema.landingPages.brandId, g.brand.id),
            eq(schema.landingPages.url, r.page.url),
          ))
          .limit(1);
        landingPageId = existante?.id ?? (await tx.insert(schema.landingPages).values({
          workspaceId: g.s.workspaceId, brandId: g.brand.id, url: r.page.url, label: r.page.label, pageType: r.page.pageType,
        }).returning({ id: schema.landingPages.id }))[0]?.id;
        if (!landingPageId) throw new Error('page non créée');
      }

      // Jamais `status` · conditionnée au statut relu · une ad préparée entre
      // la lecture et ici n'est pas touchée, et tout ce qui précède est annulé.
      const maj = await tx.update(schema.ads)
        .set({
          ...(r.maj.hypothesis ? { hypothesis: r.maj.hypothesis } : {}),
          ...(r.maj.testedVariable ? { testedVariable: r.maj.testedVariable } : {}),
          ...(r.maj.variableValue ? { variableValue: r.maj.variableValue } : {}),
          ...(offerId ? { offerId } : {}),
          ...(landingPageId ? { landingPageId } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.ads.id, ad.id), inArray(schema.ads.status, ['draft', 'proposed'])))
        .returning({ id: schema.ads.id });
      if (!maj.length) throw new ConflitStatut();
    });

    return { ok: true, manques: r.manquesApres };
  } catch (e) {
    if (e instanceof ConflitStatut) return { error: STATUT_NON_COMPLETABLE };
    return { error: logAndTranslate('adsmap:completer', e, { subject: 'l’enregistrement du test', workspaceId: g.s.workspaceId }) };
  }
}
