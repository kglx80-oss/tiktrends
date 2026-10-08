'use server';

import { gardeStudio } from '../garde';
import { lireEditeurPour } from './lecture';
import type { DocumentRelu, ReponseEditeur } from './types';

/**
 * Relit la version COURANTE du document d'un projet · lecture pure, sous
 * `studio.read`. Sert à l'éditeur après un 409 : montrer ce qui a changé et
 * proposer « recharger » ou « recharger et réappliquer ». N'écrit rien.
 *
 * L'enregistrement, lui, passe par l'action existante `enregistrerDocument`
 * (`app/actions/studios/projets.ts` · `studio.propose`, base obligatoire, 409).
 */
export async function relireDocumentEditeur(projectId: unknown): Promise<ReponseEditeur<DocumentRelu>> {
  const g = await gardeStudio('studio.read');
  if (!g.ok) return g;
  const r = await lireEditeurPour(g.ctx, projectId);
  if (!r.ok) return r;
  return { ok: true, version: r.donnees.version, document: r.donnees.document };
}
