/**
 * Récupération de la DA d'une marque depuis son site : logo, couleurs, polices.
 * Scanne le HTML d'accueil ET les feuilles CSS liées (les thèmes Shopify y mettent
 * couleurs et polices), plus les variables CSS, @font-face et Google Fonts.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface BrandDA { logoUrl: string | null; colors: string[]; fonts: string[] }

function abs(u: string, base: string): string | null { try { return new URL(u, base).toString(); } catch { return null; } }

async function get(url: string, cap = 500_000): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,text/css,*/*', 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const t = await res.text();
    return t.length > cap ? t.slice(0, cap) : t;
  } catch { return null; }
}

/** Récupère le HTML + le contenu des CSS liées (limité), pour un scan complet du style. */
async function collectStyleSources(html: string, base: string): Promise<string> {
  const inline = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)).map((m) => m[1] || '').join('\n');
  const hrefs = new Set<string>();
  for (const m of html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)) { const u = abs(m[1]!, base); if (u) hrefs.add(u); }
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["'][^>]*rel=["']stylesheet["']/gi)) { const u = abs(m[1]!, base); if (u) hrefs.add(u); }
  const css = (await Promise.all(Array.from(hrefs).slice(0, 4).map((u) => get(u, 400_000)))).filter(Boolean).join('\n');
  return `${inline}\n${css}`;
}

function findLogo(html: string, base: string): string | null {
  const pick = (re: RegExp) => { const m = re.exec(html); return m?.[1]?.trim(); };
  const cand =
    pick(/"logo"\s*:\s*"([^"]+)"/i) ||                                                              // JSON-LD Organization.logo
    pick(/<meta[^>]+property=["']og:logo["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<img[^>]+(?:class|id|alt)=["'][^"']*logo[^"']*["'][^>]*\b(?:src|data-src)=["']([^"']+)["']/i) ||
    pick(/<img[^>]+\b(?:src|data-src)=["']([^"']+)["'][^>]*(?:class|id|alt)=["'][^"']*logo[^"']*["']/i) ||
    pick(/<img[^>]+\bsrc=["']([^"']*logo[^"']+\.(?:png|jpe?g|webp|svg)[^"']*)["']/i) ||             // src contenant "logo"
    pick(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i) ||
    pick(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);                    // favicon en repli
  return cand ? abs(cand, base) : null;
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

function findColors(text: string): string[] {
  const counts = new Map<string, number>();
  const add = (hex: string, w = 1) => {
    let h = hex.toLowerCase().replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/.test(h)) return;
    counts.set('#' + h, (counts.get('#' + h) ?? 0) + w);
  };
  const tc = /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i.exec(text);
  if (tc?.[1]) add(tc[1], 12);
  // variables CSS de couleur (fort signal DA)
  for (const m of text.matchAll(/--[\w-]*colou?r[\w-]*\s*:\s*(#[0-9a-fA-F]{3,6})/gi)) add(m[1]!, 6);
  for (const m of text.matchAll(/--[\w-]*colou?r[\w-]*\s*:\s*rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)) add(toHex(+m[1]!, +m[2]!, +m[3]!), 6);
  // toutes les couleurs hex et rgb() rencontrées
  for (const m of text.matchAll(/#([0-9a-fA-F]{6})\b/g)) add('#' + m[1]!, 1);
  for (const m of text.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)) add(toHex(+m[1]!, +m[2]!, +m[3]!), 1);

  const isNeutral = (h: string) => {
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return (max - min) < 18 || lum > 0.94 || lum < 0.05;
  };
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const vivid = ranked.filter((h) => !isNeutral(h));
  return Array.from(new Set([...vivid, ...ranked.filter((h) => isNeutral(h))])).slice(0, 5);
}

function findFonts(text: string): string[] {
  const fonts = new Set<string>();
  const clean = (raw: string) => raw.replace(/["']/g, '').trim();
  const ok = (f: string) => f && f.length < 40 && !/^(inherit|initial|unset|sans-serif|serif|monospace|system-ui|-apple-system|blinkmacsystemfont|ui-sans-serif|arial|helvetica|roboto)$/i.test(f);
  for (const m of text.matchAll(/fonts\.googleapis\.com\/css2?\?[^"']*family=([^"'&]+)/gi)) { const f = decodeURIComponent(m[1]!).replace(/\+/g, ' ').split(':')[0]!.trim(); if (ok(f)) fonts.add(f); }
  for (const m of text.matchAll(/@font-face[^}]*font-family\s*:\s*([^;}\n]+)/gi)) { const f = clean(m[1]!.split(',')[0]!); if (ok(f)) fonts.add(f); }
  for (const m of text.matchAll(/font-family\s*:\s*([^;{}\n]+)/gi)) { const f = clean(m[1]!.split(',')[0]!); if (ok(f)) fonts.add(f); }
  return Array.from(fonts).slice(0, 3);
}

/** Analyse la DA d'un site : logo, couleurs, polices (HTML + CSS liées). */
export async function extractBrandDA(siteUrl: string): Promise<BrandDA> {
  const html = await get(siteUrl);
  if (!html) return { logoUrl: null, colors: [], fonts: [] };
  const style = await collectStyleSources(html, siteUrl);
  const combined = `${html}\n${style}`;
  return { logoUrl: findLogo(html, siteUrl), colors: findColors(combined), fonts: findFonts(combined) };
}
