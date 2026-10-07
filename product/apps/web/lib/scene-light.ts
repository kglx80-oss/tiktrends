import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { bandeDe, BANDE_BAS, BANDE_HAUT, type SceneLight } from '@tiktrends/core';
import { safeFetch } from '@tiktrends/integrations/src/safe-fetch';

/**
 * Regarder la scène qu'on vient de payer.
 *
 * ── Pourquoi une seule fois ──────────────────────────────────────────────────
 *
 * La mesure est rangée dans la recette. La composition, elle, tourne à chaque
 * affichage, en vignette comme en plein format · décoder l'image à chaque rendu
 * paierait cent fois une réponse qui ne change jamais.
 *
 * ── Pourquoi ça n'a pas le droit d'échouer bruyamment ────────────────────────
 *
 * Une scène non mesurée se rend avec les voiles d'avant. C'est moins bien, ce
 * n'est pas cassé. Faire échouer une génération de quatre publicités parce
 * qu'une image n'a pas pu être téléchargée coûterait quatre images pour rien.
 */

/** Taille de l'échantillon · assez pour un décile, assez petit pour être gratuit. */
const LARGEUR = 24;
const HAUTEUR = 30;

/**
 * Mesure les deux bandes d'une scène. `null` dès que quoi que ce soit résiste.
 *
 * `sharp` est chargé à la demande : c'est un module natif, et un binaire absent
 * doit dégrader le rendu, pas empêcher le serveur de démarrer.
 */
export async function mesurerScene(url: string, timeoutMs = 12_000): Promise<SceneLight | null> {
  try {
    // L'URL vient du fournisseur d'images, donc de l'extérieur · `safeFetch`
    // refuse les adresses internes et revalide chaque redirection.
    const res = await safeFetch(url, { timeoutMs, maxBytes: 12_000_000 });
    if (!res || !/^image\//.test(res.contentType)) return null;
    return await mesurerBuffer(res.body);
  } catch {
    return null;
  }
}

/** La partie qui décode · séparée pour être exercée sur une image fabriquée. */
export async function mesurerBuffer(buf: Buffer): Promise<SceneLight | null> {
  try {
    const { default: sharp } = await import('sharp');
    const { data, info } = await sharp(buf)
      // `fit: 'fill'` : on veut les proportions de la MAQUETTE, pas celles de
      // la source. Une scène en 4:5 et une scène carrée doivent rendre la même
      // bande basse, puisque la composition les recadre toutes deux en 4:5.
      .resize(LARGEUR, HAUTEUR, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width, h = info.height;
    if (!w || !h) return null;

    const hautJusque = Math.max(1, Math.round(h * BANDE_HAUT));
    const basDepuis = Math.min(h - 1, Math.round(h * (1 - BANDE_BAS)));

    const haut: number[] = [];
    const bas: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const g = data[y * w * info.channels + x * info.channels]! / 255;
        if (y < hautJusque) haut.push(g);
        if (y >= basDepuis) bas.push(g);
      }
    }
    if (!haut.length || !bas.length) return null;
    return { haut: bandeDe(haut), bas: bandeDe(bas) };
  } catch {
    return null;
  }
}

/**
 * Les publicités composées AVANT la mesure · celles dont la recette n'a pas de
 * clé `light` (une mesure ratée est consignée `null`, donc comptée comme faite).
 */
const SANS_MESURE = sql`not (coalesce(${schema.generations.input}, '{}'::jsonb) ? 'light')`;

/** Combien de publicités attendent leur mesure · à afficher AVANT de lancer le rattrapage. */
export async function compterMesuresManquantes(): Promise<number> {
  if (!db) return 0;
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.generations)
    .where(and(eq(schema.generations.kind, 'ad'), SANS_MESURE));
  return Number(r?.n ?? 0);
}

/**
 * COMMANDE explicite · mesure et range la clarté des scènes jamais mesurées.
 *
 * ── Pourquoi plus au GET (#125, chantier L0) ─────────────────────────────────
 *
 * Le rattrapage se faisait à l'affichage · `GET /api/ad/<id>` téléchargeait la
 * scène et RÉÉCRIVAIT la recette (`generations.input`) de toute pub d'avant la
 * mesure, au premier regard de n'importe quel membre, y compris un lecteur
 * client. La recette est l'objet métier que l'utilisateur retouche et que le
 * contrôle de copie relit · elle ne bouge plus qu'à un geste.
 *
 * En attendant ce geste, la pub se rend sans mesure, avec les voiles d'avant ·
 * exactement le rendu d'une mesure ratée, déjà prévu par la maquette.
 *
 * ── Idempotente et rejouable ─────────────────────────────────────────────────
 *
 * Ne vise que les recettes SANS clé `light`, et la condition est reposée dans
 * l'UPDATE lui-même · deux exécutions simultanées, ou une retouche faite
 * pendant la mesure, ne s'écrasent pas. Rejouée, elle ne trouve plus rien à
 * faire. La fusion se fait côté SQL (`||`) · le reste de la recette n'est pas
 * réécrit depuis un instantané.
 *
 * Aucun appel de modèle, rien de facturé · une lecture de pixels par scène.
 *
 * Lancée par le script `scripts/rattraper-mesures.ts` (comptage d'abord,
 * confirmation explicite, lot borné) · jamais par une consultation.
 */
export async function rattraperMesures(opts: { limite?: number; delaiMs?: number } = {}): Promise<{ candidates: number; mesurees: number; echecs: number }> {
  if (!db) return { candidates: 0, mesurees: 0, echecs: 0 };
  const limite = Math.max(1, Math.min(opts.limite ?? 200, 1_000));
  const lignes = await db.select({ id: schema.generations.id, input: schema.generations.input })
    .from(schema.generations)
    .where(and(eq(schema.generations.kind, 'ad'), SANS_MESURE))
    .limit(limite);

  let mesurees = 0, echecs = 0;
  for (const l of lignes) {
    const scene = (l.input as { sceneUrl?: unknown } | null)?.sceneUrl;
    const light = typeof scene === 'string' && scene ? await mesurerScene(scene, opts.delaiMs ?? 8_000) : null;
    const faites = await db.update(schema.generations)
      .set({ input: sql`coalesce(${schema.generations.input}, '{}'::jsonb) || ${JSON.stringify({ light })}::jsonb` })
      .where(and(eq(schema.generations.id, l.id), SANS_MESURE))
      .returning({ id: schema.generations.id });
    if (!faites.length) continue; // déjà rattrapée entre-temps
    if (light) mesurees++; else echecs++;
  }
  return { candidates: lignes.length, mesurees, echecs };
}
