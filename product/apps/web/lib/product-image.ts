/**
 * Extraction de l'image principale d'une fiche produit (og:image / twitter:image / image_src).
 * Utilitaire serveur partagé (import produits + récupération groupée).
 */

const UA = 'Mozilla/5.0 (compatible; TikTrendsBot/1.0)';

function firstMatch(html: string, res: RegExp[]): string | undefined {
  for (const re of res) { const m = re.exec(html); if (m?.[1]?.trim()) return m[1].trim(); }
  return undefined;
}

/** Renvoie l'URL absolue de l'image de fiche, ou null. `validate` fait un GET pour confirmer un content-type image. */
export async function extractProductImageUrl(pageUrl: string, opts: { validate?: boolean } = {}): Promise<string | null> {
  let html = '';
  try {
    const res = await fetch(pageUrl, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    html = await res.text();
  } catch { return null; }

  let img = firstMatch(html, [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  ]);
  if (!img) return null;

  try { img = new URL(img, pageUrl).toString(); } catch { return null; }

  if (opts.validate) {
    try {
      const r = await fetch(img, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
      const ct = r.headers.get('content-type') || '';
      if (!r.ok || !/^image\//.test(ct)) return null;
    } catch { return null; }
  }
  return img;
}
