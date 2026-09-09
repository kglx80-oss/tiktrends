import type { InspoAd } from '@tiktrends/integrations';

/**
 * Cache mémoire des recherches de veille · une même recherche ne repaie pas
 * Trendtrack pendant quelques minutes.
 *
 * ── Pourquoi en mémoire, et pas en base ──────────────────────────────────────
 *
 * « Ce qui scale » se cache en base (`veille-cache`) · une seule requête curée
 * par (pays, niche), partagée, qui vaut de survivre à un redémarrage. La
 * recherche LIBRE, elle, a un espace de clés immense (requête × plateforme ×
 * huit filtres × page) · la persister ferait grossir `app_settings` sans fin.
 *
 * Le vrai motif à couvrir est le RÉPÉTÉ court · paginer, revenir sur la page 1,
 * rebasculer un filtre puis l'annuler · tout ça dans la même minute. Un cache
 * mémoire, à durée courte et taille bornée, l'attrape exactement · il se vide au
 * redéploiement, ce qui n'est pas un problème pour une optimisation. Le VPS
 * tourne en process unique (Next standalone) · l'état de module y persiste d'une
 * requête à l'autre.
 *
 * ── Ce qu'on ne cache pas ────────────────────────────────────────────────────
 *
 * Seulement la LISTE de créas rendue par Trendtrack. Les pastilles « sauvegardé
 * / suivi » sont calculées à part, à chaque requête · le cache ne les fige donc
 * jamais. La fraîcheur des NOUVELLES pubs concurrentes est le travail du tracker
 * et du radar, pas de la recherche.
 */

export interface ResultatRecherche { ads: InspoAd[]; total: number }

/** Court · on attrape le répété d'une session, pas la veille d'hier. */
export const RECHERCHE_TTL_MS = 15 * 60_000;
/** Borné · au-delà, on jette la plus ancienne · un cache mémoire n'est pas un stockage. */
export const RECHERCHE_MAX = 200;

interface Entree { at: number; val: ResultatRecherche }
const cache = new Map<string, Entree>();

/** La clé d'une recherche · toutes les entrées qui changent le résultat, dans l'ordre. */
export function cleRecherche(parts: Array<string | number | boolean | null | undefined>): string {
  return parts.map((p) => (p ?? '')).join('|');
}

/**
 * Lit le cache · `undefined` si absent OU périmé (et purge l'entrée périmée).
 * Une lecture réussie rafraîchit la récence · c'est ce qui rend l'éviction LRU.
 */
export function lireRecherche(cle: string, maintenant = Date.now()): ResultatRecherche | undefined {
  const e = cache.get(cle);
  if (!e) return undefined;
  if (maintenant - e.at > RECHERCHE_TTL_MS) { cache.delete(cle); return undefined; }
  cache.delete(cle); cache.set(cle, e); // remonte en tête · plus récemment utilisée
  return e.val;
}

/** Écrit le cache · borne la taille en jetant les entrées les moins récentes. */
export function ecrireRecherche(cle: string, val: ResultatRecherche, maintenant = Date.now()): void {
  cache.delete(cle);
  cache.set(cle, { at: maintenant, val });
  while (cache.size > RECHERCHE_MAX) {
    const plusAncienne = cache.keys().next().value;
    if (plusAncienne === undefined) break;
    cache.delete(plusAncienne);
  }
}

/** Vide tout · réservé aux tests, pour partir d'un cache propre. */
export function _viderRecherche(): void { cache.clear(); }
