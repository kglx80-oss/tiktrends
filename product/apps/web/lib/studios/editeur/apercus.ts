import { estUuid } from '../depot';
import { estFichierCatalogue, urlApercuCatalogue } from '../rendu/catalogue-medias';

/**
 * URL d'aperçu des médias posés dans l'éditeur de calques.
 *
 * Raccord d'intégration L5 : un média studio (`studio_assets`, identifiant
 * UUID) est servi par la route L5-A `/api/studios/media/<id>` ; une photo ou un
 * logo du catalogue (`pph_…`, `logo_…`, L5-C) par la route d'aperçu du projet.
 * Toute autre forme d'identifiant n'a pas d'URL : l'éditeur montre alors un
 * cadre nommé aux bonnes proportions, jamais une image cassée.
 */
export const ROUTE_APERCU_MEDIA = (assetId: string): string => `/api/studios/media/${encodeURIComponent(assetId)}`;

export function urlsApercu(assetIds: readonly string[], projectId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of new Set(assetIds)) {
    if (estUuid(id)) out[id] = ROUTE_APERCU_MEDIA(id);
    else if (estFichierCatalogue(id)) out[id] = urlApercuCatalogue(projectId, id);
  }
  return out;
}
