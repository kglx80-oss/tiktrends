import { PARAM_TEST_ADSMAP, PARAM_DEPUIS } from './passage-studio';

/**
 * Adsmap · le bouton Retour du navigateur referme la fiche, il ne quitte pas
 * l'écran (recette #106b).
 *
 * ── Le défaut mesuré ─────────────────────────────────────────────────────────
 *
 * Une fiche ouverte depuis la liste (À décider, Table, Carte) n'existait pas
 * dans l'historique · Retour, fiche ouverte, QUITTAIT Adsmap (mesuré · retour
 * sur /dashboard) et la vue choisie (Table, Carte) n'était pas dans l'URL.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 *  · La VUE vit dans l'URL (`?vue=table|carte`, « À décider » par défaut, donc
 *    absente) · elle REMPLACE l'entrée courante (changer d'onglet n'empile rien).
 *  · Une fiche ouverte depuis la liste EMPILE une entrée (`?ad=<id>`, la vue et
 *    les autres paramètres conservés) · Retour dépile cette entrée, la fiche se
 *    ferme, la liste reste montée avec sa vue et ses filtres. Fermer la fiche à
 *    la main consomme l'entrée, pour qu'Avant ne rouvre rien de fantôme.
 *  · Une fiche ouverte par LIEN PROFOND (carte du Studio · I1) n'empile rien ·
 *    son entrée existe déjà, et Retour doit ramener d'où l'on vient (le Studio).
 *
 * Pur · ni navigateur ni réseau. Le client applique ces décisions.
 */
export type VueAdsmap = 'decider' | 'table' | 'carte';
export const PARAM_VUE_ADSMAP = 'vue';
export const VUE_ADSMAP_DEFAUT: VueAdsmap = 'decider';

/** La vue demandée par l'URL · toute valeur inconnue retombe sur « À décider ». */
export function lireVueAdsmap(v: string | null | undefined): VueAdsmap {
  return v === 'table' || v === 'carte' ? v : VUE_ADSMAP_DEFAUT;
}

/**
 * La recherche d'URL (`?…`, ou chaîne vide) après un changement de vue et/ou de
 * fiche · les autres paramètres sont conservés, dans leur ordre.
 */
export function rechercheAdsmap(recherche: string, changement: { vue?: VueAdsmap; fiche?: string | null }): string {
  const p = new URLSearchParams(recherche.startsWith('?') ? recherche.slice(1) : recherche);
  if (changement.vue !== undefined) {
    if (changement.vue === VUE_ADSMAP_DEFAUT) p.delete(PARAM_VUE_ADSMAP);
    else p.set(PARAM_VUE_ADSMAP, changement.vue);
  }
  if (changement.fiche !== undefined) {
    // Une fiche ouverte à la main n'est pas « venue du Studio ».
    p.delete(PARAM_DEPUIS);
    if (changement.fiche) p.set(PARAM_TEST_ADSMAP, changement.fiche);
    else p.delete(PARAM_TEST_ADSMAP);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** D'où la fiche a été ouverte. */
export type OrigineFiche = 'liste' | 'lien-profond';

/** La fiche empile-t-elle une entrée d'historique ? · oui depuis la liste, non par lien profond. */
export function ficheEmpileHistorique(origine: OrigineFiche): boolean {
  return origine === 'liste';
}
