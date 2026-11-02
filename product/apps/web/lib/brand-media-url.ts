import 'server-only';
import { storageFromEnv, objectKeyFromUrl } from '@tiktrends/integrations';
/** Projection d'affichage seulement : ne remplace jamais l'adresse canonique sauvegardée. */
export function brandMediaPreview(brandId: string, url: string): string {
  const cfg = storageFromEnv();
  return cfg && objectKeyFromUrl(cfg, url) !== null
    ? `/api/brands/${encodeURIComponent(brandId)}/media?url=${encodeURIComponent(url)}`
    : url;
}

/** La clé d'objet du stockage configuré, ou `null` (adresse externe) · pour NOMMER un fichier, jamais pour le montrer. */
export function cleObjetStockage(url: string): string | null {
  const cfg = storageFromEnv();
  return cfg ? objectKeyFromUrl(cfg, url) : null;
}
