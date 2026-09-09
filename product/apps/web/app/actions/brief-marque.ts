'use server';

import { getSession } from '../../lib/auth';
import { canAccess, FEATURES } from '../../lib/rbac';
import { effectiveAccess } from '../../lib/access';
import { ttSearchAds, ttSearchTikTok } from '@tiktrends/integrations';
import { briefConcurrent, type BriefConcurrent } from '@tiktrends/core';

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

  try {
    const r = input.platform === 'tiktok'
      ? await ttSearchTikTok({ apiKey }, { search: name, type: 'ad', sortBy: 'longestRunning', limit: 24 })
      : await ttSearchAds({ apiKey }, { search: name, searchIn: 'brand', status: 'all', sortBy: 'longestRunning', limit: 24 });
    if (r.ads.length === 0) return { error: 'Aucune pub trouvée pour cette marque.' };
    return { brief: briefConcurrent(r.ads) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
