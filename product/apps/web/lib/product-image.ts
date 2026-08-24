/**
 * Résolution de l'image principale d'un produit depuis le site de la marque.
 * Multi-stratégies (dans l'ordre) :
 *   1. JSON Shopify de la fiche produit    (<url>.json -> product.images[].src)
 *   2. Métadonnées de la page              (og:image / twitter:image / JSON-LD / image_src)
 *   3. Catalogue Shopify du site            (<site>/products.json, correspondance par nom)
 * Utilitaire serveur partagé (import produits + récupération groupée + par produit).
 */

const UA = 'Mozilla/5.0 (compatible; TikTrendsBot/1.0; +https://tiktrends.co)';
const IMG_EXT = /\.(?:jpe?g|png|webp|avif|gif)(?:[?#]|$)/i;

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/json,*/*' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function abs(u: string, base: string): string | null {
  try { return new URL(u, base).toString(); } catch { return null; }
}

/** Normalisation pour comparer des noms de produits (minuscules, sans accents/ponctuation). */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function tokens(s: string): string[] {
  const stop = new Set(['cure', 'mois', 'pack', 'lot', 'the', 'les', 'de', 'la', 'le', 'pour', 'and', 'et']);
  return norm(s).split(' ').filter((t) => t.length >= 3 && !stop.has(t));
}

type ShopifyProduct = { title?: string; handle?: string; images?: { src?: string }[]; image?: { src?: string } };

function imageFromShopifyProduct(p: ShopifyProduct): string | undefined {
  return p.images?.find((i) => i.src)?.src || p.image?.src || undefined;
}

/** Stratégie 1 : JSON Shopify d'une fiche produit. */
async function fromShopifyProductJson(productUrl: string): Promise<string | null> {
  const clean = productUrl.split(/[?#]/)[0]!.replace(/\/$/, '');
  const txt = await getText(`${clean}.json`);
  if (!txt) return null;
  try {
    const data = JSON.parse(txt) as { product?: ShopifyProduct };
    const src = data.product ? imageFromShopifyProduct(data.product) : undefined;
    return src ? abs(src, productUrl) : null;
  } catch { return null; }
}

/** Stratégie 2 : métadonnées d'une page HTML. */
function imageFromHtml(html: string, base: string): string | null {
  const pick = (re: RegExp) => { const m = re.exec(html); return m?.[1]?.trim(); };
  let img =
    pick(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i) ||
    pick(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
  // JSON-LD Product.image (chaîne ou tableau)
  if (!img) {
    const ld = /"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/i.exec(html);
    img = ld?.[1] || ld?.[2];
  }
  return img ? abs(img, base) : null;
}

/** Stratégie 3 : catalogue Shopify du site, correspondance par nom. */
async function fromSiteCatalog(siteUrl: string, productName: string): Promise<string | null> {
  const origin = (() => { try { return new URL(siteUrl).origin; } catch { return null; } })();
  if (!origin) return null;
  const txt = await getText(`${origin}/products.json?limit=250`);
  if (!txt) return null;
  let list: ShopifyProduct[] = [];
  try { list = (JSON.parse(txt) as { products?: ShopifyProduct[] }).products ?? []; } catch { return null; }
  if (!list.length) return null;

  const want = tokens(productName);
  if (!want.length) return null;
  let best: { score: number; src?: string } = { score: 0 };
  for (const p of list) {
    if (!p.title) continue;
    const have = new Set(tokens(p.title));
    const score = want.filter((t) => have.has(t)).length;
    if (score > best.score) best = { score, src: imageFromShopifyProduct(p) };
  }
  return best.score > 0 && best.src ? abs(best.src, origin) : null;
}

async function looksLikeImage(url: string): Promise<boolean> {
  if (IMG_EXT.test(url)) return true; // extension explicite -> on fait confiance (Fal gère les erreurs)
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(12000) });
    return r.ok && /^image\//.test(r.headers.get('content-type') || '');
  } catch { return false; }
}

/** Résout l'URL d'image produit en essayant toutes les stratégies. */
export async function resolveProductImage(input: { productName: string; productUrl?: string | null; siteUrl?: string | null }): Promise<string | null> {
  const { productName, productUrl, siteUrl } = input;

  if (productUrl) {
    const viaJson = await fromShopifyProductJson(productUrl);
    if (viaJson && (await looksLikeImage(viaJson))) return viaJson;
    const html = await getText(productUrl);
    if (html) { const viaHtml = imageFromHtml(html, productUrl); if (viaHtml && (await looksLikeImage(viaHtml))) return viaHtml; }
  }

  if (siteUrl) {
    const viaCatalog = await fromSiteCatalog(siteUrl, productName);
    if (viaCatalog && (await looksLikeImage(viaCatalog))) return viaCatalog;
  }
  return null;
}

/** Rétro-compat : extraction depuis une URL de page (og:image + validation). */
export async function extractProductImageUrl(pageUrl: string, opts: { validate?: boolean } = {}): Promise<string | null> {
  const html = await getText(pageUrl);
  if (!html) return null;
  const img = imageFromHtml(html, pageUrl);
  if (!img) return null;
  if (opts.validate && !(await looksLikeImage(img))) return null;
  return img;
}
