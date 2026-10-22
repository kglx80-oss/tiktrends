'use server';
import type { ErreurStudio } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { supprimerProjetPour, restaurerProjetPour } from '../../../lib/studios/sources/archivage';

type Resultat = { ok: true } | ErreurStudio;

export async function supprimerProjet(entree: { projectId: unknown }): Promise<Resultat> {
  const g = await gardeStudio('studio.propose', 'projets');
  if (!g.ok) return g;
  const r = await supprimerProjetPour(g.ctx, entree?.projectId);
  return r;
}

export async function restaurerProjet(entree: { projectId: unknown }): Promise<Resultat> {
  const g = await gardeStudio('studio.propose', 'projets');
  if (!g.ok) return g;
  const r = await restaurerProjetPour(g.ctx, entree?.projectId);
  return r;
}
