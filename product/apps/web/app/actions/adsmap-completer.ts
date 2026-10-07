'use server';

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  saisieCompletude, adCompletable, STATUT_NON_COMPLETABLE,
  type AdType, type ProduitMarque, type SaisieCompletude,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';

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
 * Recherche-ou-création · une offre de même marque, même LIBELLÉ et même prix
 * (sans remise ni garantie ni lot) ou une page de même adresse sont réutilisées
 * plutôt que dupliquées. L'offre ne garde aucun identifiant de produit · deux
 * produits homonymes à prix égal partagent donc la même ligne d'offre ; à prix
 * différents, deux offres (voir `reprise-adsmap.ts`, section « Identité »).
 *
 * Concurrence (deux onglets, deux personnes · recette lot 21, vraie base) ·
 * mesuré avant correction (d9613eee) · l'ad était lue HORS transaction · deux
 * envois simultanés calculaient chacun leurs champs sur un état périmé ·
 * l'hypothèse du premier était écrasée par celle du second et l'offre du
 * premier restait orpheline. Désormais, dans UNE transaction · verrou de la
 * ligne de l'ad (`FOR UPDATE`), relecture sous verrou, règle du noyau sur
 * l'état relu (un champ rempli entre-temps n'est plus écrit), puis verrou
 * consultatif par marque + libellé + prix (offre) et par marque + adresse
 * (page) autour de la recherche-ou-création · aucune contrainte d'unicité
 * ajoutée (aucune migration).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** L'ad passée « prête » (ou au-delà) entre la lecture et l'écriture · tout est annulé. */
class ConflitStatut extends Error {}
/** L'ad a disparu de la marque active entre la lecture et l'écriture. */
class Introuvable extends Error {}
/** Le noyau refuse la saisie relue sous verrou · rien n'est écrit. */
class Refus extends Error {}

/** Refus local, accordé (« cette ad … elle … supprimée ») · `GUARD.notFound` reste au masculin pour ses autres appelants. */
const AD_INTROUVABLE = 'Cette ad est introuvable · elle a peut-être été supprimée, ou elle appartient à une autre marque.';

type Lecteur = Pick<NonNullable<typeof db>, 'select'>;

/** L'ad de la marque active, ou `null` (autre marque, autre espace, introuvable). */
async function adDeLaMarque(lecteur: Lecteur, adId: string, workspaceId: string, brandId: string) {
  const [row] = await lecteur.select({
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
  if (!UUID.test(adId)) return { error: AD_INTROUVABLE };
  try {
    const ad = await adDeLaMarque(db!, adId, g.s.workspaceId, g.brand.id);
    if (!ad) return { error: AD_INTROUVABLE };
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
  if (!input || typeof input.adId !== 'string' || !UUID.test(input.adId)) return { error: AD_INTROUVABLE };

  try {
    // Lecture rapide, hors verrou · refuse tôt (autre marque, statut) sans
    // ouvrir de transaction. Tout est RELU sous verrou plus bas.
    const vue = await adDeLaMarque(db!, input.adId, g.s.workspaceId, g.brand.id);
    if (!vue) return { error: AD_INTROUVABLE };
    if (!adCompletable(vue.status)) return { error: STATUT_NON_COMPLETABLE };

    // Le produit n'est lu que dans la marque active · un identifiant d'une autre
    // marque ne rend rien, et le noyau refuse un produit absent de la liste.
    // (Le produit n'est jamais écrit.)
    const produitId = typeof input.produitId === 'string' && UUID.test(input.produitId) ? input.produitId : null;
    const produits: ProduitMarque[] = produitId
      ? (await db!.select({ id: schema.products.id, nom: schema.products.name, prix: schema.products.price, url: schema.products.url })
          .from(schema.products)
          .where(and(eq(schema.products.id, produitId), eq(schema.products.brandId, g.brand.id)))
          .limit(1)).map((p) => ({ id: p.id, nom: p.nom, prix: p.prix ?? null, url: p.url ?? null }))
      : [];
    const saisie = {
      hypothesis: input.hypothesis, testedVariable: input.testedVariable, variableValue: input.variableValue,
      produitId, offre: input.offre ?? null, page: input.page ?? null,
    };

    // Offre, page et ad tombent ensemble ou pas du tout · un échec (ad passée
    // « prête » entre-temps, contrainte, réseau) ne laisse ni offre ni page
    // orpheline, ni ad à moitié complétée.
    const resultat = await db!.transaction(async (tx) => {
      // 1 · verrou de la ligne de l'ad · un second envoi sur la même ad attend ici.
      const verrou = await tx.select({ id: schema.ads.id }).from(schema.ads)
        .where(and(eq(schema.ads.id, input.adId), eq(schema.ads.workspaceId, g.s.workspaceId)))
        .for('update');
      if (!verrou.length) throw new Introuvable();
      // 2 · relecture SOUS verrou · ce qu'un autre envoi vient d'écrire compte.
      const ad = await adDeLaMarque(tx, input.adId, g.s.workspaceId, g.brand.id);
      if (!ad) throw new Introuvable();
      if (!adCompletable(ad.status)) throw new ConflitStatut();
      const r = saisieCompletude(
        { status: ad.status, adType: ad.adType as AdType, hypothesis: ad.hypothesis, testedVariable: ad.testedVariable, offerId: ad.offerId, landingPageId: ad.landingPageId },
        saisie,
        produits,
      );
      if (!r.ok) throw new Refus(r.erreur);
      if (r.dejaEnregistre) return { manques: r.manquesApres, dejaEnregistre: true as const };

      let offerId: string | undefined;
      if (r.offre) {
        // 3 · une seule création par marque + libellé + prix, même entre deux ads.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`adsmap-offre|${g.brand.id}|${r.offre.label}|${r.offre.price ?? ''}`}, 0))`);
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
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`adsmap-page|${g.brand.id}|${r.page.url}`}, 0))`);
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

      // 4 · jamais `status` · seuls les champs saisis ET encore vides sous
      // verrou · conditionnée au statut relu (ceinture et bretelles).
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
      return { manques: r.manquesApres, dejaEnregistre: false as const };
    });

    return resultat.dejaEnregistre ? { ok: true, manques: resultat.manques, dejaEnregistre: true } : { ok: true, manques: resultat.manques };
  } catch (e) {
    if (e instanceof ConflitStatut) return { error: STATUT_NON_COMPLETABLE };
    if (e instanceof Introuvable) return { error: AD_INTROUVABLE };
    if (e instanceof Refus) return { error: e.message };
    return { error: logAndTranslate('adsmap:completer', e, { subject: 'l’enregistrement du test', workspaceId: g.s.workspaceId }) };
  }
}
