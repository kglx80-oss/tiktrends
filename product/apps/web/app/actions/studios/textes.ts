'use server';

import type { ErreurStudio, TexteStudio } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import type { VersionStudio } from '../../../lib/studios/depot';
import { ecrireTextesPour, type ResultatEcriture } from '../../../lib/studios/textes/ecrire';
import { lireVueTextesPour, enregistrerTextesPour, exporterTextesPour, injecterTextePour, type VueTextes } from '../../../lib/studios/textes/textes';
import { dependancesTextesProduction, disponibiliteTextesServeur } from '../../../lib/studios/textes/dependances';
import type { ResultatProposer } from '../../../lib/studios/propositions/types';

/**
 * Commandes « Textes IA » (cahier §4.7). Chacune : `gardeStudio(permission)`
 * (session relue, aucune portée prise du client), puis le serveur.
 *
 *  · lire · `studio.read` ;
 *  · écrire avec l'IA · `studio.propose`, coût maximal annoncé avant le clic,
 *    barrière de dépense, aucun crédit débité, rien d'écrit dans le projet ;
 *  · retenir / éditer · `studio.propose`, nouvelle version, 409 respecté ;
 *  · exporter · `studio.export`, aucune ligne, aucun média ;
 *  · injecter dans un calque · `studio.propose`, PROPOSITION seulement.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

export async function lireTextesProjet(entree: { projectId: unknown }): Promise<Reponse<{ vue: VueTextes }>> {
  const g = await gardeStudio('studio.read', 'textes');
  if (!g.ok) return g;
  return lireVueTextesPour(g.ctx, entree?.projectId, (b) => disponibiliteTextesServeur(g.ctx, b));
}

export async function ecrireTextes(entree: { projectId: unknown; baseVersionId: unknown; type: unknown; maxCaracteres?: unknown; nombre?: unknown; langue?: unknown }): Promise<ResultatEcriture> {
  const g = await gardeStudio('studio.propose', 'textes');
  if (!g.ok) return { ...g, saisieManuelle: true };
  return ecrireTextesPour(g.ctx, {
    projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, type: entree?.type,
    maxCaracteres: entree?.maxCaracteres, nombre: entree?.nombre, langue: entree?.langue,
  }, dependancesTextesProduction());
}

export async function enregistrerTextes(entree: { projectId: unknown; baseVersionId: unknown; textes: unknown; raison?: unknown }): Promise<Reponse<{ version: VersionStudio; inchange: boolean; textes: TexteStudio[] }>> {
  const g = await gardeStudio('studio.propose', 'textes');
  if (!g.ok) return g;
  return enregistrerTextesPour(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, textes: entree?.textes, raison: entree?.raison });
}

export async function exporterTextes(entree: { projectId: unknown; versionId?: unknown; format?: unknown }): Promise<Reponse<{ nomFichier: string; typeMime: string; contenu: string }>> {
  const g = await gardeStudio('studio.export', 'textes');
  if (!g.ok) return g;
  return exporterTextesPour(g.ctx, { projectId: entree?.projectId, versionId: entree?.versionId, format: entree?.format });
}

export async function injecterTexte(entree: { projectId: unknown; baseVersionId: unknown; layerId: unknown; texte: unknown }): Promise<Reponse<ResultatProposer>> {
  const g = await gardeStudio('studio.propose', 'textes');
  if (!g.ok) return g;
  return injecterTextePour(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, layerId: entree?.layerId, texte: entree?.texte });
}
