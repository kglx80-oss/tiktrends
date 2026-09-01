/**
 * Enrichissement AUTOMATIQUE de la marque (sans bouton) : DA, produits Shopify, photos.
 *
 * ── Pourquoi « idempotent » ne suffisait pas ─────────────────────────────────
 *
 * Il ne faisait du réseau que si quelque chose manquait · ce qui semble prudent,
 * jusqu'à ce qu'on remarque que **ce qui manque continue de manquer**. Une photo
 * produit introuvable reste introuvable : elle était donc cherchée sur le site
 * de la boutique à chaque chargement de page, pour rien, pendant que la page
 * attendait. Une marque à trente produits sans photo, c'était trente requêtes
 * réseau devant l'utilisateur, à chaque visite, pour un résultat déjà connu.
 *
 * ── Ce qui change ────────────────────────────────────────────────────────────
 *
 * Une date d'enrichissement, posée **même quand on ne trouve rien** · c'est
 * précisément ce cas qu'il fallait cesser de rejouer. Et un plafond sur le
 * nombre de photos cherchées d'un coup : une marque à deux cent cinquante
 * produits ne doit pas ouvrir deux cent cinquante connexions parce que
 * quelqu'un a ouvert le studio.
 *
 * Appelé au chargement des pages (marque, Pubs IA) · best-effort, jamais bloquant en cas d'échec.
 */

/** Au-delà, on relit le site pour rien · ce qui manquait manque encore. */
const FRAICHEUR_MS = 6 * 60 * 60 * 1000;

/** Photos cherchées par passage · le reste attendra le prochain. */
const PHOTOS_PAR_PASSAGE = 12;

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { extractBrandDA } from './brand-da';
import { resolveProductImage } from './product-image';
import { discoverShopify } from './shopify';


/** S'assure que la marque a sa DA, ses produits et leurs photos. Silencieux. */
export async function ensureBrandEnriched(brandId: string): Promise<void> {
  if (!db) return;
  try {
    const [b] = await db.select({
      url: schema.brands.url, shopifyDomain: schema.brands.shopifyDomain,
      logoUrl: schema.brands.logoUrl, colors: schema.brands.colors, fonts: schema.brands.fonts,
      enrichedAt: schema.brands.enrichedAt,
    }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
    if (!b) return;

    // Déjà passé récemment · on ne refait pas le tour du site pour retrouver
    // exactement ce qu'on n'avait pas trouvé il y a dix minutes.
    if (b.enrichedAt && Date.now() - b.enrichedAt.getTime() < FRAICHEUR_MS) return;

    const site = b.url || (b.shopifyDomain ? `https://${b.shopifyDomain}` : '');
    // La date est posée dans tous les cas, y compris sans site · c'est ce qui
    // évite de repasser ici au prochain rendu.
    await db.update(schema.brands).set({ enrichedAt: new Date() }).where(eq(schema.brands.id, brandId));
    if (!site) return;

    // 1) DA : seulement si logo ET couleurs manquent (sinon on respecte l'existant).
    if (!b.logoUrl && !(b.colors && b.colors.length)) {
      const da = await extractBrandDA(site);
      if (da.logoUrl || da.colors.length || da.fonts.length) {
        await db.update(schema.brands).set({
          logoUrl: b.logoUrl || da.logoUrl || null,
          colors: (b.colors && b.colors.length) ? b.colors : da.colors,
          fonts: (b.fonts && b.fonts.length) ? b.fonts : da.fonts,
        }).where(eq(schema.brands.id, brandId));
      }
    }

    // 2) Produits : s'il n'y en a aucun et que la boutique Shopify est joignable, on importe.
    let products = await db.select({ id: schema.products.id, name: schema.products.name, url: schema.products.url, imageUrl: schema.products.imageUrl })
      .from(schema.products).where(eq(schema.products.brandId, brandId));

    if (products.length === 0) {
      const found = await discoverShopify(b.shopifyDomain || b.url || '');
      if (found && found.products.length) {
        if (!b.shopifyDomain) await db.update(schema.brands).set({ shopifyDomain: found.origin.replace('https://', '') }).where(eq(schema.brands.id, brandId));
        for (const p of found.products.slice(0, 250)) {
          try { await db.insert(schema.products).values({ brandId, name: p.title, description: p.description, price: p.price, url: p.url, imageUrl: p.imageUrl }); } catch { /* ignore */ }
        }
        products = await db.select({ id: schema.products.id, name: schema.products.name, url: schema.products.url, imageUrl: schema.products.imageUrl })
          .from(schema.products).where(eq(schema.products.brandId, brandId));
      }
    }

    // 3) Photos manquantes : on les résout depuis la fiche / le site.
    const missing = products.filter((p) => !p.imageUrl).slice(0, PHOTOS_PAR_PASSAGE);
    if (missing.length) {
      await Promise.all(missing.map(async (p) => {
        const img = await resolveProductImage({ productName: p.name, productUrl: p.url, siteUrl: b.url || (b.shopifyDomain ? `https://${b.shopifyDomain}` : null) });
        if (img) { try { await db!.update(schema.products).set({ imageUrl: img }).where(and(eq(schema.products.id, p.id), eq(schema.products.brandId, brandId))); } catch { /* ignore */ } }
      }));
    }
  } catch { /* enrichissement best-effort : on n'interrompt jamais le rendu */ }
}
