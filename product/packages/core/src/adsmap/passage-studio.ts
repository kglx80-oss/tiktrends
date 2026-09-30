/**
 * Le passage Studio → Adsmap · de la carte d'une créa au test qui la mesure.
 *
 * ── Ce qui manquait (audit lot I) ────────────────────────────────────────────
 *
 * Le Studio montrait le verdict sur la carte, mais aucun chemin ne menait au
 * test lui-même · résultats, arbitrage, apprentissage, itération vivent dans le
 * panneau d'un test Adsmap, qu'on n'ouvrait qu'en cherchant l'ad à la main dans
 * la file, la table ou la carte. La boucle « créer → mesurer → apprendre →
 * itérer » se cassait au premier pas.
 *
 * ── Ce que ce fichier décide ─────────────────────────────────────────────────
 *
 * 1. Quand une ad est LANCÉE (`adLancee`) · c'est ce qui sépare « à lancer »
 *    de « en mesure » sur la carte.
 * 2. Le lien de la carte vers le test (`lienAdsmapCarte`) · sa cible et son
 *    libellé, choisi d'après ce que la destination MONTRE vraiment · « Voir le
 *    verdict » seulement quand un verdict existe, « Ouvrir le test » sinon, et
 *    aucun lien vers un test introuvable ni sans accès à Adsmap.
 * 3. La lecture du lien profond côté Adsmap (`lireLienProfondAdsmap`) · un
 *    identifiant mal formé est ignoré plutôt que transmis.
 * 4. Le rangement d'un état de carte dans les filtres de la galerie
 *    (`bucketPerfCarte`) · « à lancer » n'est pas « en mesure ».
 *
 * Suivre le lien ne fait que LIRE · aucune écriture, aucune génération au clic.
 *
 * Pur : ni base, ni horloge, ni réseau.
 */

import type { EtatVerdictCarte } from './verdict-carte';

/** Statuts d'une ad Adsmap qui disent qu'elle a été diffusée. */
const STATUTS_LANCES = new Set(['live', 'paused', 'done']);

/**
 * L'ad a-t-elle été diffusée · une date de lancement, ou un statut qui ne se
 * prend qu'après diffusion. Un brouillon, une proposition, une ad « prête » ne
 * le sont pas.
 */
export function adLancee(a: { status: string | null | undefined; launchedAt: Date | string | null | undefined }): boolean {
  return !!a.launchedAt || STATUTS_LANCES.has(a.status ?? '');
}

/** Paramètres du lien profond vers le panneau d'un test. */
export const PARAM_TEST_ADSMAP = 'ad';
export const PARAM_DEPUIS = 'depuis';
export const DEPUIS_STUDIO = 'studio';

/** Le retour vers le Studio, offert au panneau ouvert depuis une carte. */
export const RETOUR_STUDIO = { href: '/studio/ads', libelle: 'Retour au Studio' } as const;

export interface LienAdsmapCarte {
  href: string;
  /** Libellé visible · dit ce que la destination montre. */
  libelle: string;
  /** Infobulle · précise l'état, sans promettre de résultat absent. */
  titre: string;
}

const AVEC_VERDICT: ReadonlySet<EtatVerdictCarte> = new Set([
  'gagnante', 'petite_gagnante', 'gagnante_relative', 'perdante', 'non_concluant', 'diffusion_faible',
]);
/** Gagnantes arbitrées et comparables · le panneau propose alors l'itération. */
const ITERABLES: ReadonlySet<EtatVerdictCarte> = new Set(['gagnante', 'petite_gagnante']);

/**
 * Le lien de la carte vers son test Adsmap, ou `null` quand il n'y a rien à
 * ouvrir · créa non suivie, test introuvable, accès Adsmap refusé.
 */
export function lienAdsmapCarte(o: { adsmapAdId: string | null | undefined; etat: EtatVerdictCarte | null | undefined; acces: boolean }): LienAdsmapCarte | null {
  if (!o.acces || !o.adsmapAdId || !o.etat || o.etat === 'introuvable') return null;
  const href = `/adsmap?${PARAM_TEST_ADSMAP}=${encodeURIComponent(o.adsmapAdId)}&${PARAM_DEPUIS}=${DEPUIS_STUDIO}`;
  if (ITERABLES.has(o.etat)) {
    return { href, libelle: 'Voir le verdict · itérer', titre: 'Résultats, verdict arbitré, apprentissage et prochaine itération dans Adsmap' };
  }
  if (AVEC_VERDICT.has(o.etat)) {
    return { href, libelle: 'Voir le verdict', titre: 'Résultats, verdict et apprentissage dans Adsmap' };
  }
  if (o.etat === 'a_lancer') {
    return { href, libelle: 'Ouvrir le test', titre: 'Test pas encore lancé · aucun chiffre · hypothèse et suite dans Adsmap' };
  }
  // en_mesure · lancée, pas de verdict arbitré.
  return { href, libelle: 'Ouvrir le test', titre: 'Test lancé · pas encore de verdict arbitré' };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const premier = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * Le lien profond lu côté Adsmap · l'identifiant n'est retenu que bien formé
 * (un identifiant d'ad est un UUID) · le reste est ignoré, jamais transmis.
 */
export function lireLienProfondAdsmap(sp: Record<string, string | string[] | undefined>): { adId: string | null; depuisStudio: boolean } {
  const brut = premier(sp[PARAM_TEST_ADSMAP])?.trim() ?? '';
  return {
    adId: UUID.test(brut) ? brut.toLowerCase() : null,
    depuisStudio: premier(sp[PARAM_DEPUIS]) === DEPUIS_STUDIO,
  };
}

/**
 * L'état d'une carte JUSTE après « Suivre dans Adsmap » · l'ad naît brouillon,
 * rien n'est lancé ni mesuré · « à lancer ». Un état déjà connu (verdict, lien
 * rompu) n'est pas écrasé par l'optimisme.
 */
export function etatApresSuivi(actuel: EtatVerdictCarte | null | undefined): EtatVerdictCarte {
  return actuel ?? 'a_lancer';
}

/** Le filtre de performance d'une carte de galerie. */
export type BucketPerfCarte = 'gagnante' | 'en_mesure' | 'a_lancer' | 'inconnue' | 'autre';

/**
 * Range un état de carte dans les filtres de la galerie · « à lancer » a son
 * propre filtre (une créa jamais diffusée n'est pas « en mesure »), un test
 * introuvable tombe dans « autre » (ni mesuré ni inconnu).
 */
export function bucketPerfCarte(v: EtatVerdictCarte | null | undefined): BucketPerfCarte {
  if (v == null) return 'inconnue';
  if (v === 'en_mesure') return 'en_mesure';
  if (v === 'a_lancer') return 'a_lancer';
  if (v === 'gagnante' || v === 'petite_gagnante') return 'gagnante';
  return 'autre';
}
