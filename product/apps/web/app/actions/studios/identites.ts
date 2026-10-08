'use server';

import type { ErreurStudio } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import type { VersionStudio } from '../../../lib/studios/depot';
import { lireVueIdentitesPour, enregistrerIdentitePour, lierIdentitePour, resoudreContradictionPour, type VueIdentites } from '../../../lib/studios/identites/commandes';
import { choisirModeParolePour } from '../../../lib/studios/voix/voix';

/**
 * Identités de personnages et voix d'un projet (cahier §4.5, §4.6 ; recettes
 * VIDEO-02, VIDEO-06, VIDEO-07).
 *
 *  · lire · `studio.read`, lecture pure (aucune écriture, aucun modèle) ;
 *  · fiche, liaison, résolution d'une contradiction, mode de parole ·
 *    `studio.propose`, nouvelle version (base obligatoire, 409). Aucun de ces
 *    gestes ne coûte : aucun appel modèle, aucun devis, aucun débit.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;
type Ecriture = Reponse<{ version: VersionStudio; inchange: boolean }>;

export async function lireIdentitesProjet(entree: { projectId: unknown }): Promise<Reponse<{ vue: VueIdentites }>> {
  const g = await gardeStudio('studio.read');
  if (!g.ok) return g;
  return lireVueIdentitesPour(g.ctx, entree?.projectId);
}

export async function enregistrerIdentite(entree: { projectId: unknown; baseVersionId: unknown; identityId?: unknown; nom: unknown; attributs: unknown; vues?: unknown; description?: unknown }): Promise<Ecriture> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return enregistrerIdentitePour(g.ctx, {
    projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, identityId: entree?.identityId,
    nom: entree?.nom, attributs: entree?.attributs, vues: entree?.vues, description: entree?.description,
  });
}

export async function lierIdentite(entree: { projectId: unknown; baseVersionId: unknown; identityId: unknown; shotIds: unknown }): Promise<Ecriture> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return lierIdentitePour(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, identityId: entree?.identityId, shotIds: entree?.shotIds });
}

export async function resoudreContradiction(entree: { projectId: unknown; baseVersionId: unknown; contradictionId: unknown; choix: unknown }): Promise<Ecriture> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return resoudreContradictionPour(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, contradictionId: entree?.contradictionId, choix: entree?.choix });
}

export async function choisirModeParole(entree: { projectId: unknown; baseVersionId: unknown; shotIds: unknown; mode: unknown }): Promise<Ecriture> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return choisirModeParolePour(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, shotIds: entree?.shotIds, mode: entree?.mode });
}
