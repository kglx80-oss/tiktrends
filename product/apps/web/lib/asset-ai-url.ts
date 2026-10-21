import 'server-only';
import { storageFromEnv, objectKeyFromUrl, privateObjectUrl } from '@tiktrends/integrations';
/** Appeler après recherche de l’asset dans l’espace autorisé ; ne jamais sauvegarder le résultat. */
export function assetAiUrl(url: string, workspaceId: string): string | null {
  const cfg = storageFromEnv();
  if (!cfg || objectKeyFromUrl(cfg, url) === null) return url;
  return privateObjectUrl(cfg, url, workspaceId);
}
