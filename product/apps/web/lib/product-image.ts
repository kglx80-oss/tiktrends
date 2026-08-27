/**
 * Résolution de l'image principale d'un produit depuis le site de la marque.
 * Multi-stratégies (dans l'ordre) :
 *   1. JSON Shopify de la fiche produit    (<url>.json -> product.images[].src)
 *   2. Métadonnées de la page              (og:image / twitter:image / JSON-LD / image_src)
 *   3. Catalogue Shopify du site            (<site>/products.json, correspondance par nom)
 * Utilitaire serveur partagé (import produits + récupération groupée + par produit).
 */

// UA navigateur réel : beaucoup de sites renvoient un challenge/403 aux robots.
import { safeFetch } from '@tiktrends/integrations/src/safe-fetch';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const IMG_EXT = /\.(?:jpe?g|png|webp|avif|gif)(?:[?#]|$)/i;

// Les URLs viennent du site de la marque (champ libre) : safeFetch bloque les
// adresses internes et revalide chaque redirection.
async function getRaw(url: string): Promise<{ status: number | 'err'; ct: string; text: string }> {
  const res = await safeFetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/json,image/*,*/*', 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' },
    timeoutMs: 15_000, maxBytes: 4_000_000,
  });
  if (!res) return { status: 'err', ct: '', text: '' };
  return { status: 200, ct: res.contentType, text: res.body.toString('utf8') };
}

async function getText(url: string): Promise<string | null> {
  const r = await getRaw(url);
  return r.status !== 'err' && r.status < 400 ? r.text : null;
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
  // Préchargement d'image (souvent l'image produit principale).
  if (!img) img = pick(/<link[^>]+rel=["']preload["'][^>]+as=["']image["'][^>]+href=["']([^"']+)["']/i) || pick(/<link[^>]+as=["']image["'][^>]+href=["']([^"']+)["']/i);
  // Repli : première <img> qui ressemble à un média produit (cdn/uploads/media/products…).
  if (!img) {
    const re = /<img[^>]+(?:src|data-src|data-srcset|srcset)=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const cand = (m[1] || '').split(/\s+/)[0]!; // 1re URL d'un éventuel srcset
      if (/logo|icon|sprite|placeholder|flag|badge|payment|trustpilot|avatar/i.test(cand)) continue;
      if (IMG_EXT.test(cand) && /(cdn|uploads|media|content|product|images?|files|assets)/i.test(cand)) { img = cand; break; }
    }
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
  const r = await safeFetch(url, { headers: { 'user-agent': UA }, maxBytes: 2_000_000 });
  return !!r && /^image\//.test(r.contentType);
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

export interface ProbeResult {
  host?: string; pageStatus: number | 'err'; ct?: string;
  htmlOg: boolean; htmlImg: boolean; productJson: boolean; catalog: boolean;
  imageUrl: string | null;
}

/** Sonde diagnostique : indique quelle stratégie répond pour une fiche produit. */
export async function probeProductImage(input: { productName: string; productUrl?: string | null; siteUrl?: string | null }): Promise<ProbeResult> {
  const { productName, productUrl, siteUrl } = input;
  const out: ProbeResult = { pageStatus: 'err', htmlOg: false, htmlImg: false, productJson: false, catalog: false, imageUrl: null };
  const ref = productUrl || siteUrl || '';
  try { out.host = new URL(ref).host; } catch { /* rien */ }

  if (productUrl) {
    const clean = productUrl.split(/[?#]/)[0]!.replace(/\/$/, '');
    const j = await getRaw(`${clean}.json`);
    try { out.productJson = j.status !== 'err' && j.status < 400 && !!JSON.parse(j.text)?.product; } catch { /* pas du JSON */ }
    const page = await getRaw(productUrl);
    out.pageStatus = page.status; out.ct = page.ct.split(';')[0];
    if (page.text) { out.htmlOg = /property=["']og:image/i.test(page.text); out.htmlImg = !!imageFromHtml(page.text, productUrl); }
  }
  if (siteUrl) {
    const origin = (() => { try { return new URL(siteUrl).origin; } catch { return null; } })();
    if (origin) { const c = await getRaw(`${origin}/products.json?limit=1`); try { out.catalog = c.status !== 'err' && c.status < 400 && Array.isArray(JSON.parse(c.text)?.products); } catch { /* pas Shopify */ } }
  }
  out.imageUrl = await resolveProductImage({ productName, productUrl, siteUrl });
  return out;
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
