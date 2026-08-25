/**
 * Récupération de la DA d'une marque depuis son site : logo, couleurs, polices.
 * Heuristique (best-effort) sur le HTML de la page d'accueil.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface BrandDA { logoUrl: string | null; colors: string[]; fonts: string[] }

function abs(u: string, base: string): string | null { try { return new URL(u, base).toString(); } catch { return null; } }

async function getHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function findLogo(html: string, base: string): string | null {
  const pick = (re: RegExp) => { const m = re.exec(html); return m?.[1]?.trim(); };
  const cand =
    // JSON-LD Organization.logo
    pick(/"logo"\s*:\s*"([^"]+)"/i) ||
    pick(/<meta[^>]+property=["']og:logo["'][^>]+content=["']([^"']+)["']/i) ||
    // <img> dont l'attribut évoque un logo
    pick(/<img[^>]+(?:class|id|alt|src)=["'][^"']*logo[^"']*["'][^>]*\bsrc=["']([^"']+)["']/i) ||
    pick(/<img[^>]+\bsrc=["']([^"']+)["'][^>]*(?:class|id|alt)=["'][^"']*logo[^"']*["']/i) ||
    pick(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i);
  return cand ? abs(cand, base) : null;
}

function findColors(html: string): string[] {
  const counts = new Map<string, number>();
  const add = (hex: string, w = 1) => {
    let h = hex.toLowerCase().replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/.test(h)) return;
    counts.set('#' + h, (counts.get('#' + h) ?? 0) + w);
  };
  // theme-color = signal fort
  const tc = /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (tc?.[1]) add(tc[1], 8);
  // variables CSS de couleur (poids fort)
  for (const m of html.matchAll(/--[\w-]*colou?r[\w-]*\s*:\s*(#[0-9a-fA-F]{3,6})/gi)) add(m[1]!, 4);
  // toutes les valeurs hex rencontrées
  for (const m of html.matchAll(/#([0-9a-fA-F]{6})\b/g)) add('#' + m[1]!, 1);

  const isNeutral = (h: string) => {
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return (max - min) < 18 || lum > 0.94 || lum < 0.05; // gris/quasi blanc/quasi noir
  };
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const vivid = ranked.filter((h) => !isNeutral(h));
  const out = [...vivid, ...ranked.filter((h) => isNeutral(h))]; // couleurs vives d'abord, neutres ensuite
  return Array.from(new Set(out)).slice(0, 5);
}

function findFonts(html: string): string[] {
  const fonts = new Set<string>();
  // Google Fonts
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?[^"']*family=([^"'&]+)/gi)) {
    const fam = decodeURIComponent(m[1]!).replace(/\+/g, ' ').split(':')[0]!.trim();
    if (fam) fonts.add(fam);
  }
  // font-family déclarées (on prend la 1re police nommée)
  for (const m of html.matchAll(/font-family\s*:\s*([^;{}"']+)/gi)) {
    const first = m[1]!.split(',')[0]!.replace(/["']/g, '').trim();
    if (first && !/^(inherit|initial|unset|sans-serif|serif|monospace|system-ui|-apple-system)$/i.test(first) && first.length < 40) fonts.add(first);
  }
  return Array.from(fonts).slice(0, 3);
}

/** Analyse la DA d'un site : logo, couleurs, polices. */
export async function extractBrandDA(siteUrl: string): Promise<BrandDA> {
  const html = await getHtml(siteUrl);
  if (!html) return { logoUrl: null, colors: [], fonts: [] };
  return { logoUrl: findLogo(html, siteUrl), colors: findColors(html), fonts: findFonts(html) };
}
