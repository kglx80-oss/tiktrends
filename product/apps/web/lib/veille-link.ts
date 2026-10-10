import type { InspoAd } from '@tiktrends/integrations';
import { briefDepuisVeille, refSourceVeille, lienNouveauProjet } from '@tiktrends/core';

/**
 * La préparation d'un projet Studios, armée depuis une pub de veille
 * (anciennement les Pubs IA, retirées le 10/10 · `lienNouveauProjet`).
 *
 * Sert là où la carte n'est PAS une source accessible au panneau « Préparer
 * une création » (hors Veille et Sauvegardes) · l'angle distillé et la
 * provenance suivent le lien, la préparation dit que l'annonce elle-même
 * n'est pas jointe.
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
export function studioDepuisVeille(ad: InspoAd, opts?: { ref?: string | null;
  /**
   * Lot 18B · le contexte de la recherche de Veille (`contexteVeille`, ancre de
   * la carte comprise) · le Studio propose alors d'y revenir. Absent hors Veille.
   */
  retour?: string | null }): string {
  const brief = briefDepuisVeille({ body: ad.body, callToAction: ad.callToAction, daysRunning: ad.daysRunning });
  // CDC v8 · F07 · la PROVENANCE de la source suit le lien (clé plateforme:id et
  // annonceur) · la préparation la relit et dit qu'elle n'est pas jointe.
  const src = refSourceVeille(ad);
  return lienNouveauProjet({
    type: ad.mediaType === 'video' ? 'video' : 'ads',
    angle: brief?.angle ?? null, ref: opts?.ref ?? null,
    src: src?.cle ?? null, srcnom: src?.nom ?? null, retourVeille: opts?.retour ?? null,
  });
}
