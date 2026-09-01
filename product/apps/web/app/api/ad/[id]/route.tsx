import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { renderAdPng, type AdRecipe } from '../../../../lib/ad-render';
import { renduConnu, rangerRendu } from '../../../../lib/ad-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ratios proposés -> dimensions de rendu (base 1080 de large).
const RATIO_SIZE: Record<string, { width: number; height: number }> = {
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
};

/**
 * La vignette · deux cinquièmes de la largeur d'impression.
 *
 * La grille affichait des cartes de deux cent quarante pixels de large, et on
 * lui servait des images de mille quatre-vingts · composées à la demande par
 * satori, à chaque fois, pour être réduites par le navigateur juste après.
 *
 * Le coût d'une composition suit la SURFACE : 432 × 540 fait six fois moins de
 * pixels que 1080 × 1350. Treize pubs à l'écran, c'était donc treize rendus
 * pleine résolution avant la première image visible.
 *
 * Le plein format reste servi tel quel · l'aperçu et le téléchargement le
 * demandent, et eux le méritent : on les regarde un par un.
 */
const ECHELLE_VIGNETTE = 0.4;

// Cache mémoire des PNG rendus (le rendu satori est coûteux). Clé = id:ratio:hash(texte+scène).
// Borné en OCTETS, pas en nombre d'entrées : un 9:16 pèse plusieurs Mo, donc 300
// entrées suffisaient à faire tomber le process. Éviction LRU (Map = ordre d'insertion,
// et on réinsère à chaque lecture).
const RENDER_CACHE = new Map<string, ArrayBuffer>();
const CACHE_MAX_BYTES = 128 * 1024 * 1024; // 128 Mo
let cacheBytes = 0;

/**
 * L'adresse porte l'empreinte de la recette (`?v=`) · retoucher le texte d'une
 * pub change son adresse. Le navigateur peut donc garder l'image sans jamais
 * revenir demander si elle a bougé, ce que `max-age` seul ne lui disait pas.
 */
const CACHE = 'private, max-age=31536000, immutable';

function cachePut(key: string, png: ArrayBuffer): void {
  if (png.byteLength > CACHE_MAX_BYTES) return; // trop gros pour être mis en cache
  const prev = RENDER_CACHE.get(key);
  if (prev) cacheBytes -= prev.byteLength;
  RENDER_CACHE.set(key, png);
  cacheBytes += png.byteLength;
  while (cacheBytes > CACHE_MAX_BYTES) {
    const oldest = RENDER_CACHE.keys().next();
    if (oldest.done) break;
    const victim = RENDER_CACHE.get(oldest.value)!;
    RENDER_CACHE.delete(oldest.value);
    cacheBytes -= victim.byteLength;
  }
}
function recipeHash(r: AdRecipe): string {
  const t = `${r.headline}|${r.subhead ?? ''}|${r.cta}|${r.kicker ?? ''}|${r.badge ?? ''}|${r.sceneUrl}`;
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Rend la publicité composée (scène IA + couche design) en PNG, à la demande. Ratio via ?r=. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || !db) return new Response('Non autorisé', { status: 401 });
  const q = new URL(req.url).searchParams;
  const r = q.get('r') || '';
  const vignette = q.get('t') === '1';
  const size = RATIO_SIZE[r];

  const [g] = await db
    .select({ input: schema.generations.input, output: schema.generations.output, workspaceId: schema.brands.workspaceId, kind: schema.generations.kind })
    .from(schema.generations)
    .leftJoin(schema.brands, eq(schema.generations.brandId, schema.brands.id))
    .where(eq(schema.generations.id, id))
    .limit(1);

  if (!g || g.kind !== 'ad' || g.workspaceId !== s.workspaceId) return new Response('Introuvable', { status: 404 });
  const base = g.input as unknown as AdRecipe;
  if (!base?.sceneUrl) return new Response('Recette invalide', { status: 422 });
  const plein = size ?? { width: base.width ?? 1080, height: base.height ?? 1350 };
  const dims = vignette
    ? { width: Math.round(plein.width * ECHELLE_VIGNETTE), height: Math.round(plein.height * ECHELLE_VIGNETTE) }
    : plein;
  const recipe: AdRecipe = { ...base, width: dims.width, height: dims.height };
  const cacheKey = `${id}:${r || '4:5'}:${vignette ? 't' : 'f'}:${recipeHash(recipe)}`;

  const cached = RENDER_CACHE.get(cacheKey);
  if (cached) {
    RENDER_CACHE.delete(cacheKey); RENDER_CACHE.set(cacheKey, cached); // remonte en tête (LRU)
    return new Response(cached, { headers: { 'content-type': 'image/png', 'cache-control': CACHE, 'x-cache': 'HIT' } });
  }

  // Déjà rangé dans le bucket lors d'un passage précédent · c'est ce qui rend la
  // composition définitivement gratuite. Le cache mémoire, lui, repart à zéro à
  // chaque déploiement : la première personne à ouvrir le studio après une mise
  // en ligne repayait la composition de toutes ses pubs, une par une.
  const range = renduConnu(g.output, cacheKey);
  if (range) return Response.redirect(range, 302);

  try {
    const png = await renderAdPng(recipe);
    cachePut(cacheKey, png);
    // On répond d'abord · faire attendre un aller-retour S3 rendrait le premier
    // affichage plus lent pour accélérer les suivants. Échec silencieux : un
    // cache qui tombe doit se contenter de ne pas accélérer.
    void rangerRendu(id, cacheKey, png).catch(() => { /* le cache mémoire reste */ });
    return new Response(png, {
      headers: { 'content-type': 'image/png', 'cache-control': CACHE, 'x-cache': 'MISS' },
    });
  } catch {
    // Repli : si la composition échoue, on affiche au moins la scène (sans la couche texte).
    if (recipe.sceneUrl) return Response.redirect(recipe.sceneUrl, 302);
    return new Response('Composition impossible', { status: 500 });
  }
}
