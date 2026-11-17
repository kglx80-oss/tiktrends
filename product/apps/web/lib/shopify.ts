/**
 * Import du catalogue public Shopify (/products.json) · sans OAuth.
 * La plupart des boutiques Shopify exposent ce point d'accès en lecture.
 */
import { safeFetch } from '@tiktrends/integrations/src/safe-fetch';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface ShopifyProductNorm {
  handle: string; title: string; description: string | null;
  price: number | null; url: string; imageUrl: string | null; vendor: string | null;
}

type RawProduct = {
  handle?: string; title?: string; body_html?: string; vendor?: string;
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

function normOne(p: RawProduct, origin: string): ShopifyProductNorm | null {
  if (!p.handle || !p.title) return null;
  const priceStr = p.variants?.find((v) => v.price)?.price;
  const price = priceStr != null ? Number(priceStr) : null;
  return {
    handle: p.handle, title: p.title.trim(), description: stripHtml(p.body_html),
    price: price != null && !Number.isNaN(price) ? price : null,
    url: `${origin}/products/${p.handle}`,
    imageUrl: p.images?.find((i) => i.src)?.src || p.image?.src || null,
    vendor: p.vendor?.trim() || null,
  };
}

/**
 * Taille maximale d'une page `/products.json` lue (250 produits au plus par
 * page, borne de Shopify). Le fetch d'avant n'avait AUCUNE borne · celle-ci ne
 * vise que le serveur hostile qui annonce 1 Ko et envoie 10 Go. Valeur non
 * mesurée (la session n'atteint aucune boutique réelle) · choisie très
 * au-dessus d'une page ordinaire (250 fiches dont la description HTML fait
 * rarement plus de quelques Ko, soit de l'ordre du Mo) pour ne refuser aucun
 * catalogue légitime.
 */
const OCTETS_MAX_PAGE = 32 * 1024 * 1024;

/**
 * Récupère les produits à un point d'accès JSON précis (paginé). null si indisponible/vide.
 *
 * Par `safeFetch` · adresse publique seulement (127.0.0.1, 169.254.169.254, un
 * nom résolu en adresse interne sont refusés), CHAQUE redirection revalidée. Le
 * `fetch` brut d'avant suivait un 302 d'une « boutique » vers le réseau interne
 * et en importait la réponse comme catalogue.
 */
async function fetchProductsAt(origin: string, path: string, max = 250): Promise<ShopifyProductNorm[] | null> {
  const out: ShopifyProductNorm[] = [];
  for (let page = 1; page <= 5 && out.length < max; page++) {
    let raw: RawProduct[] = [];
    try {
      const sep = path.includes('?') ? '&' : '?';
      const res = await safeFetch(`${origin}${path}${sep}limit=250&page=${page}`, {
        headers: { 'user-agent': UA, accept: 'application/json' }, timeoutMs: 15000, maxBytes: OCTETS_MAX_PAGE,
      });
      if (!res) return page === 1 ? null : out;
      const data = JSON.parse(res.body.toString('utf8')) as { products?: RawProduct[] };
      raw = data.products ?? [];
    } catch { return page === 1 ? null : out; }
    if (!raw.length) break;
    for (const p of raw) { const n = normOne(p, origin); if (n) out.push(n); }
  }
  return out.length ? out : null;
}

/** Essaie plusieurs variantes de domaine/chemin pour trouver le catalogue Shopify public. */
export async function discoverShopify(domainInput: string): Promise<{ origin: string; products: ShopifyProductNorm[] } | null> {
  const base = normalizeShopDomain(domainInput);
  if (!base) return null;
  const host = base.replace('https://', '');
  const hosts = Array.from(new Set([host, host.startsWith('www.') ? host.slice(4) : `www.${host}`]));
  const paths = ['/products.json', '/collections/all/products.json'];
  for (const h of hosts) {
    const origin = `https://${h}`;
    for (const path of paths) {
      const products = await fetchProductsAt(origin, path);
      if (products && products.length) return { origin, products };
    }
  }
  return null;
}
