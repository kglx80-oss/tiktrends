import { safeFetch } from '@tiktrends/integrations/src/safe-fetch';

/**
 * Préparer une image pour la faire regarder par un modèle.
 *
 * ── Pourquoi on réduit ───────────────────────────────────────────────────────
 *
 * Chaque pixel envoyé est facturé. Une publicité en 1080 px coûte environ trois
 * fois ce que coûte la même en 640 px, et rien de ce qu'on lui demande — relire
 * une accroche, comparer un packaging — n'a besoin des pixels supplémentaires.
 *
 * 640 px de large est la borne retenue : le texte d'une accroche y reste
 * parfaitement lisible, et une étiquette de produit reste identifiable.
 *
 * ── Pourquoi ça ne peut pas faire échouer l'appelant ─────────────────────────
 *
 * Une image qu'on n'a pas pu récupérer donne `null`, et le contrôle qui la
 * demandait ne s'exécute simplement pas. Faire échouer un lot de quatre
 * publicités parce qu'une vérification n'a pas pu télécharger son image
 * coûterait quatre images pour rien · c'est la même règle que la mesure de
 * scène, pour la même raison.
 */

/** Assez pour lire une accroche et reconnaître une étiquette, pas plus. */
const LARGEUR_MAX = 640;

export interface ImageJointe { mediaType: string; base64: string }

/**
 * Télécharge, réduit, encode. `null` dès que quoi que ce soit résiste.
 *
 * `sharp` est chargé à la demande · c'est un module natif, et un binaire absent
 * doit priver d'un contrôle, pas empêcher le serveur de démarrer.
 */
export async function imageJointe(url: string | null | undefined, timeoutMs = 12_000): Promise<ImageJointe | null> {
  if (!url) return null;
  try {
    // L'URL vient du fournisseur d'images ou de la fiche produit, donc de
    // l'extérieur · `safeFetch` refuse les adresses internes et revalide chaque
    // redirection.
    const res = await safeFetch(url, { timeoutMs, maxBytes: 12_000_000 });
    if (!res || !/^image\//.test(res.contentType)) return null;
    const { default: sharp } = await import('sharp');
    const buf = await sharp(res.body)
      // `withoutEnlargement` · une image déjà petite ne gagne rien à être
      // étirée, et l'agrandir coûterait des jetons pour des pixels inventés.
      .resize(LARGEUR_MAX, null, { withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return { mediaType: 'image/jpeg', base64: buf.toString('base64') };
  } catch {
    return null;
  }
}
