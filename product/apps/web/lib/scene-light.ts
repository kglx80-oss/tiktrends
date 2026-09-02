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
