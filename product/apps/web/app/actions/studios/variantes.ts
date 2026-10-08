'use server';

import type { DonneesVariantes, ErreurStudio } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import {
  creerVariante as creerVarianteCmd, listerVariantes as listerVariantesCmd, filiationVariante as filiationCmd,
  type VariantePresentee, type MaillonFiliation,
} from '../../../lib/studios/variantes/variantes';
import { iterer as itererCmd, type ResultatIteration } from '../../../lib/studios/variantes/apprentissage';
import { accesAdsmap, etatRelecture } from '../../../lib/studios/variantes/acces';

/**
 * Variantes (cahier 01 §4.4 point 10, §7). Chaque commande : `gardeStudio`
 * (session relue, contexte serveur), puis la commande, qui filtre la portée
 * dans chaque requête. Hors portée ⇒ `NOT_FOUND` neutre.
 *
 *  · `listerVariantes`, `filiationVariante` · LECTURES PURES ;
 *  · `creerVariante` · idempotente, aucun coût, aucune génération ;
 *  · `iterer` · nouvelle version de brief enfant, aucune génération.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

export async function listerVariantes(entree: { projectId: unknown }): Promise<Reponse<{ donnees: DonneesVariantes }>> {
  const g = await gardeStudio('studio.read');
  if (!g.ok) return g;
  return listerVariantesCmd(g.ctx, { projectId: entree?.projectId }, { adsmapAcces: await accesAdsmap(), relecture: await etatRelecture() });
}

export async function filiationVariante(entree: { variantId: unknown }): Promise<Reponse<{ maillons: MaillonFiliation[]; sourcesProjet: unknown }>> {
  const g = await gardeStudio('studio.read');
  if (!g.ok) return g;
  return filiationCmd(g.ctx, { variantId: entree?.variantId });
}

export async function creerVariante(entree: { assetId: unknown; parentVariantId?: unknown }): Promise<Reponse<{ variante: VariantePresentee; deja: boolean }>> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return creerVarianteCmd(g.ctx, { assetId: entree?.assetId, parentVariantId: entree?.parentVariantId });
}

export async function iterer(entree: { variantId: unknown; baseVersionId: unknown; variable?: unknown; raison?: unknown }): Promise<Reponse<ResultatIteration>> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return itererCmd(g.ctx, { variantId: entree?.variantId, baseVersionId: entree?.baseVersionId, variable: entree?.variable, raison: entree?.raison });
}
