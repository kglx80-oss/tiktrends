/**
 * URL d'aperçu des médias posés dans l'éditeur de calques.
 *
 * La route qui sert un média studio (`/api/studios/media/<id>`) appartient au
 * lot L5-A. Tant qu'elle n'est pas raccordée, aucune URL n'est promise :
 * l'éditeur montre alors un cadre aux bonnes proportions avec le nom du calque,
 * jamais une image cassée. L'intégrateur remplace `ROUTE_APERCU_MEDIA` par
 * `(id) => \`/api/studios/media/${id}\`` une fois la route fusionnée.
 */
export const ROUTE_APERCU_MEDIA: ((assetId: string) => string) | null = null;

export function urlsApercu(assetIds: readonly string[]): Record<string, string> {
  const route = ROUTE_APERCU_MEDIA;
  if (!route) return {};
  const out: Record<string, string> = {};
  for (const id of new Set(assetIds)) out[id] = route(id);
  return out;
}
