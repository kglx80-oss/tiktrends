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
 */
export function studioDepuisVeille(ad: InspoAd): string {
  const brief = briefDepuisVeille({ body: ad.body, callToAction: ad.callToAction, daysRunning: ad.daysRunning });
  return brief ? `/studio/ads?angle=${encodeURIComponent(brief.angle)}` : '/studio/ads';
}
