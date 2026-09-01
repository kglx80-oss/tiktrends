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

/*
 * ── La vignette a été retirée, et pourquoi ───────────────────────────────────
 *
 * On composait la grille à 40 % (432 × 540) pour économiser six fois moins de
 * pixels à rasteriser. L'idée était bonne, la mise en œuvre était fausse :
 * **toute la maquette est en pixels absolus calés sur une largeur de 1080**
 * (`fontSize: 74`, `padding: '150px 56px 56px'`, `top: 46`…). Réduire le
 * canevas sans redimensionner l'arbre donne une accroche de 74 px sur une
 * image large de 432 · c'est-à-dire un titre qui mange la moitié de la pub.
 *
 * Le gain qu'on cherchait est de toute façon devenu accessoire : depuis que le
 * PNG est rangé dans le bucket au premier rendu (D101), une pub n'est composée
 * qu'une seule fois dans sa vie. Ce qui restait était de la bande passante, et
 * la bande passante ne vaut pas une maquette cassée.
 *
 * Pour la faire revenir proprement il faudrait rendre la maquette
 * proportionnelle à sa largeur · c'est un vrai chantier sur les dix gabarits,
 * pas un paramètre.
 */

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
  const recipe: AdRecipe = size ? { ...base, width: size.width, height: size.height } : base;
  const cacheKey = `${id}:${r || '4:5'}:${recipeHash(recipe)}`;

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
