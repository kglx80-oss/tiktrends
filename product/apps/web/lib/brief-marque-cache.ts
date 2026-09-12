import type { BriefConcurrent } from '@tiktrends/core';
import { briefFrais, appelsDansFenetre, briefSousLimite, BRIEF_MAX_PAR_FENETRE } from '@tiktrends/core';

/**
 * L'état (mémoire) du cache et du throttle des briefs concurrents · la décision
 * pure vit dans `@tiktrends/core` (brief-cache), ici seulement les Map.
 *
 * Même choix que le cache de recherche de veille : mémoire de process, borné,
 * vidé au redéploiement · le VPS tourne en Next standalone (process unique),
 * l'état de module y persiste d'une requête à l'autre. Un brief est déterministe
 * et non personnalisé · le partager entre utilisateurs est SÛR et voulu (c'est
 * ce qui amortit les rafales sans repayer la source).
 */

interface Entree { at: number; brief: BriefConcurrent }
const cache = new Map<string, Entree>();
const MAX_CACHE = 300;

/** Le brief en cache s'il est encore frais · sinon `undefined` (et purge). */
export function lireBrief(cle: string, maintenant = Date.now()): BriefConcurrent | undefined {
  const e = cache.get(cle);
  if (!e) return undefined;
  if (!briefFrais(e.at, maintenant)) { cache.delete(cle); return undefined; }
  cache.delete(cle); cache.set(cle, e); // LRU · remonte en tête
  return e.brief;
}

/** Écrit le brief · borne la taille en jetant les entrées les moins récentes. */
export function ecrireBrief(cle: string, brief: BriefConcurrent, maintenant = Date.now()): void {
  cache.delete(cle);
  cache.set(cle, { at: maintenant, brief });
  while (cache.size > MAX_CACHE) {
    const vieille = cache.keys().next().value;
    if (vieille === undefined) break;
    cache.delete(vieille);
  }
}

const appels = new Map<string, number[]>();
const MAX_USERS = 2000;

/**
 * Réserve un appel RÉEL à la source pour cet utilisateur · `true` s'il reste
 * sous le plafond de la fenêtre (et l'appel est enregistré), `false` sinon.
 * À n'appeler que sur un MISS de cache · un hit ne coûte rien à la source.
 */
export function reserverAppelBrief(userId: string, maintenant = Date.now()): boolean {
  const recents = appelsDansFenetre(appels.get(userId) ?? [], maintenant);
  if (!briefSousLimite(recents, maintenant)) {
    appels.set(userId, recents); // garde la fenêtre élaguée
    return false;
  }
  recents.push(maintenant);
  appels.set(userId, recents);
  // Borne le nombre d'utilisateurs suivis · on jette le plus anciennement vu.
  while (appels.size > MAX_USERS) {
    const vieux = appels.keys().next().value;
    if (vieux === undefined) break;
    appels.delete(vieux);
  }
  return true;
}

/** Le plafond, pour le message d'erreur. */
export { BRIEF_MAX_PAR_FENETRE };

/** Vide tout · réservé aux tests. */
export function _viderBriefCache(): void { cache.clear(); appels.clear(); }
