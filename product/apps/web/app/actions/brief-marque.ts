'use server';

import { getSession } from '../../lib/auth';
import { canAccess, FEATURES } from '../../lib/rbac';
import { effectiveAccess } from '../../lib/access';
import { ttSearchAds, ttSearchTikTok } from '@tiktrends/integrations';
import { briefConcurrent, cleBrief, type BriefConcurrent } from '@tiktrends/core';
import { lireBrief, ecrireBrief, reserverAppelBrief } from '../../lib/brief-marque-cache';

/**
 * Le brief d'une marque suivie, à la demande · SANS IA, donc sans dépense.
 *
 * On lit les pubs de l'annonceur (recherche par marque) et on en tire la forme
 * de son compte via `briefConcurrent` · rien ne passe par le modèle, donc rien
 * ne touche la barrière de dépense · seule la recherche Trendtrack est appelée.
 */
export async function briefMarqueAction(input: { platform: string; name: string }): Promise<{ brief?: BriefConcurrent; error?: string }> {
  const s = await getSession();
  if (!s) return { error: 'Non connecté.' };
  if (!canAccess(effectiveAccess(s), FEATURES.find((f) => f.key === 'inspo')!)) return { error: 'Accès Veille requis.' };

  const apiKey = process.env.TRENDTRACK_API_KEY;
  if (!apiKey) return { error: 'Source de données non configurée.' };

  const name = input.name.trim();
  if (!name) return { error: 'Marque inconnue.' };

  // Une seule forme canonique de la plateforme · la clé de cache la normalise
  // déjà, donc la branche de fetch doit partir de la MÊME valeur, sinon un
  // « TikTok » (casse brute) irait chercher du Meta et le servirait sous une clé
  // TikTok. On canonise ici, une fois, pour la clé ET la branche.
  const platform = (input.platform || '').trim().toLowerCase();

  // Cache court d'abord · le brief est déterministe et non personnalisé, deux
  // demandes rapprochées sur la même marque ne repaient pas la source. Un hit ne
  // consomme pas le throttle (aucun appel réel).
  const cle = cleBrief(platform, name);
  const enCache = lireBrief(cle);
  if (enCache) return { brief: enCache };

  // Sur un MISS seulement · plafonner les appels RÉELS à la clé Trendtrack
  // partagée, par utilisateur, pour qu'un compte ne puisse pas épuiser le quota
  // commun. Usage humain (parcourir ses marques) largement sous le plafond.
  if (!reserverAppelBrief(s.user.id)) {
    return { error: 'Trop d’analyses en peu de temps · patiente une minute puis réessaie.' };
  }

  try {
    const r = platform === 'tiktok'
      ? await ttSearchTikTok({ apiKey }, { search: name, type: 'ad', sortBy: 'longestRunning', limit: 24 })
      : await ttSearchAds({ apiKey }, { search: name, searchIn: 'brand', status: 'all', sortBy: 'longestRunning', limit: 24 });
    if (r.ads.length === 0) return { error: 'Aucune pub trouvée pour cette marque.' };
    const brief = briefConcurrent(r.ads);
    ecrireBrief(cle, brief);
    return { brief };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
