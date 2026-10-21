import 'server-only';
import { storageFromEnv, objectKeyFromUrl } from '@tiktrends/integrations';
/** Projection d'affichage seulement : ne remplace jamais l'adresse canonique sauvegardée. */
export function brandMediaPreview(brandId: string, url: string): string {
  const cfg = storageFromEnv();
  return cfg && objectKeyFromUrl(cfg, url) !== null
    ? `/api/brands/${encodeURIComponent(brandId)}/media?url=${encodeURIComponent(url)}`
    : url;
}
