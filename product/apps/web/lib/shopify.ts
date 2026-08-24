/**
 * Import du catalogue public Shopify (/products.json) — sans OAuth.
 * La plupart des boutiques Shopify exposent ce point d'accès en lecture.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface ShopifyProductNorm {
  handle: string; title: string; description: string | null;
  price: number | null; url: string; imageUrl: string | null;
}

type RawProduct = {
  handle?: string; title?: string; body_html?: string;
  images?: { src?: string }[]; image?: { src?: string };
  variants?: { price?: string }[];
};

/** Normalise un domaine boutique en origine https (accepte URL complète, domaine nu, myshopify). */
export function normalizeShopDomain(input: string): string | null {
  let d = (input || '').trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\s+/g, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return null;
  return `https://${d}`;
}

function stripHtml(html?: string): string | null {
  if (!html) return null;
  const t = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 500) : null;
}

/** Récupère (et normalise) les produits du catalogue public Shopify. Renvoie null si indisponible. */
export async function fetchShopifyProducts(origin: string, max = 250): Promise<ShopifyProductNorm[] | null> {
  const out: ShopifyProductNorm[] = [];
  for (let page = 1; page <= 5 && out.length < max; page++) {
    let raw: RawProduct[] = [];
    try {
      const res = await fetch(`${origin}/products.json?limit=250&page=${page}`, {
        headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return page === 1 ? null : out;
      const data = JSON.parse(await res.text()) as { products?: RawProduct[] };
      raw = data.products ?? [];
    } catch { return page === 1 ? null : out; }
    if (!raw.length) break;
    for (const p of raw) {
      if (!p.handle || !p.title) continue;
      const priceStr = p.variants?.find((v) => v.price)?.price;
      const price = priceStr != null ? Number(priceStr) : null;
      out.push({
        handle: p.handle, title: p.title.trim(), description: stripHtml(p.body_html),
        price: price != null && !Number.isNaN(price) ? price : null,
        url: `${origin}/products/${p.handle}`,
        imageUrl: p.images?.find((i) => i.src)?.src || p.image?.src || null,
      });
    }
  }
  return out;
}
