'use server';

import type { ErreurStudio } from '@tiktrends/core';
import { gardeSources } from '../../../lib/studios/sources/acces';
import { refusCapacite } from '../../../lib/studios/interrupteurs';
import type { LigneeProjetLue } from '../../../lib/studios/lignee/lignee';

/**
 * Commande de la projection de lignée (V5, lecture seule).
 *
 * Lire n'écrit rien, ne génère rien, n'annonce aucune dépense. Permission
 * `studio.read` et capacité `canvas`, comme le canvas de production : qui peut
 * ouvrir le canvas voit sa lignée, sans rien proposer ni dépenser.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

export async function lireLigneeProjet(entree: { projectId: unknown }): Promise<Reponse<{ lignee: LigneeProjetLue }>> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  const refus = await refusCapacite(g.ctx, ['canvas']);
  if (refus) return refus;
  const { lireLigneeProjetPour } = await import('../../../lib/studios/lignee/lignee');
  return lireLigneeProjetPour(g.ctx, entree?.projectId, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}
