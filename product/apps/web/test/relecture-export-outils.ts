import { POINTS_RELECTURE_EXPORT } from '@tiktrends/core';
import type { ContexteStudio } from '../lib/studios/garde';
import { validerRelecturePour } from '../lib/studios/export/relecture';

/**
 * Lot 8 · les tests du CHEMIN d'export (rendu, fichier, archive, droits)
 * partent d'une version RELUE · la relecture humaine est validée par la
 * vraie commande (les cinq points, audit `project.export.review`), comme une
 * personne le ferait à l'écran. Ce qu'elle garde est éprouvé par
 * `lot8-studios-db.test.tsx`.
 */
export const TOUS_LES_POINTS = POINTS_RELECTURE_EXPORT.map((p) => p.cle);

export async function relire(ctx: ContexteStudio, projectId: string, versionId?: string): Promise<void> {
  const r = await validerRelecturePour(ctx, { projectId, versionId, points: TOUS_LES_POINTS });
  if (!r.ok) throw new Error(`relecture refusée · ${r.code} · ${r.message}`);
}
