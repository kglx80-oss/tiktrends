import type { InspoAd } from '@tiktrends/integrations';
import { briefDepuisVeille } from '@tiktrends/core';

/**
 * L'URL des Pubs IA, armée depuis une pub de veille.
 *
 * ── Pourquoi un fichier à part ───────────────────────────────────────────────
 *
 * Le bouton vit dans `AdCard`, qui traîne `server-only` par ses imports · on ne
 * peut donc pas le rendre dans un test. Ce constructeur d'URL, lui, est pur : il
 * n'importe que le noyau. Isolé ici, il se vérifie sans monter la carte — on lit
 * l'URL produite, pas qu'une fonction est appelée.
 *
 * Le studio lit `?angle=` et le passe à Jarvis · on y met le brief DISTILLÉ,
 * jamais la copy brute. Sans matière exploitable, on pointe quand même vers le
 * bon écran (les Pubs IA), à vide · un lien réparé vaut mieux que l'ancien, qui
 * visait le hub des hooks.
 *
 * ── L'angle, ou l'angle ET la structure ──────────────────────────────────────
 *
 * Sans référence, on porte l'ANGLE · le studio génère depuis ton produit, en
 * composé comme en entière. Avec une pub sauvegardée en référence (`ref` =
 * l'identifiant de la sauvegarde), on ouvre le mode CLONE, où le studio reprend
 * aussi la STRUCTURE visuelle · c'est le pas de plus vers le rendu d'agence, et
 * le clone remplace le produit par le tien. En clone, le champ `angle` sert de
 * consigne au clone · le brief y a donc toujours sa place.
 */
export function studioDepuisVeille(ad: InspoAd, opts?: { ref?: string | null }): string {
  const brief = briefDepuisVeille({ body: ad.body, callToAction: ad.callToAction, daysRunning: ad.daysRunning });
  const params = new URLSearchParams();
  if (opts?.ref) { params.set('mode', 'clone'); params.set('ref', opts.ref); }
  if (brief) params.set('angle', brief.angle);
  const q = params.toString();
  return q ? `/studio/ads?${q}` : '/studio/ads';
}
