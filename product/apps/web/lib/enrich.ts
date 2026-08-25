/**
 * Enrichissement AUTOMATIQUE de la marque (sans bouton) : DA, produits Shopify, photos.
 * Idempotent et auto-limité : ne fait du réseau que si quelque chose manque, puis persiste.
 * Appelé au chargement des pages (marque, Pubs IA) — best-effort, jamais bloquant en cas d'échec.
 */

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { extractBrandDA } from './brand-da';
import { resolveProductImage } from './product-image';
import { discoverShopify } from './shopify';

const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** S'assure que la marque a sa DA, ses produits et leurs photos. Silencieux. */
export async function ensureBrandEnriched(brandId: string): Promise<void> {
  if (!db) return;
  try {
    const [b] = await db.select({
      url: schema.brands.url, shopifyDomain: schema.brands.shopifyDomain,
      logoUrl: schema.brands.logoUrl, colors: schema.brands.colors, fonts: schema.brands.fonts,
    }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
    if (!b) return;
    const site = b.url || (b.shopifyDomain ? `https://${b.shopifyDomain}` : '');
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
    const missing = products.filter((p) => !p.imageUrl);
    if (missing.length) {
      await Promise.all(missing.map(async (p) => {
        const img = await resolveProductImage({ productName: p.name, productUrl: p.url, siteUrl: b.url || (b.shopifyDomain ? `https://${b.shopifyDomain}` : null) });
        if (img) { try { await db!.update(schema.products).set({ imageUrl: img }).where(and(eq(schema.products.id, p.id), eq(schema.products.brandId, brandId))); } catch { /* ignore */ } }
      }));
    }
  } catch { /* enrichissement best-effort : on n'interrompt jamais le rendu */ }
}
