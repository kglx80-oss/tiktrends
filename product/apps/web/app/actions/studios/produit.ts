'use server';

import { erreurStudio, type ErreurStudio, type PreparationCompilation, type StatutQualite, type VerdictComposants } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { gardeSources } from '../../../lib/studios/sources/acces';
import type { VersionStudio } from '../../../lib/studios/depot';
import { lireVueProduitPour, type VueProduit } from '../../../lib/studios/produit/vue';
import { epinglerProduitPour, associerReferencePour, retirerReferencePour } from '../../../lib/studios/produit/commandes';
import { preparerCompilationPour, compilerConsigneImagePour, type ResultatCompilation } from '../../../lib/studios/produit/compilation';
import { trancherComposants as trancherComposantsLib } from '../../../lib/studios/produit/qualite';
import { dependancesTextesProduction } from '../../../lib/studios/textes/dependances';

/**
 * Commandes « produit épinglé et références typées » (cahier §4.4 points 1, 2
 * et 5). Garde des sources (studio + accès Veille relu) : une source Veille
 * n'est associable que par quelqu'un qui peut encore la lire.
 *
 *  · lire, contrôler avant compilation · `studio.read`, lecture pure ;
 *  · épingler, associer, retirer · `studio.propose`, nouvelle version (409) ;
 *  · compiler la consigne image · `studio.generate` (appel texte payant,
 *    barrière de dépense), aucun média produit ;
 *  · trancher les composants d'un média · `studio.propose` (relecteur).
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;
type Ecriture = Reponse<{ version: VersionStudio; inchange: boolean }>;

export async function lireProduitProjet(entree: { projectId: unknown }): Promise<Reponse<{ vue: VueProduit }>> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  return lireVueProduitPour(g.ctx, entree?.projectId, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

export async function epinglerProduit(entree: { projectId: unknown; baseVersionId: unknown; productId: unknown; photoId: unknown; composants?: unknown; attributs?: unknown; transformations?: unknown }): Promise<Ecriture> {
  const g = await gardeSources('studio.propose');
  if (!g.ok) return g;
  return epinglerProduitPour(g.ctx, {
    projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, productId: entree?.productId, photoId: entree?.photoId,
    composants: entree?.composants, attributs: entree?.attributs, transformations: entree?.transformations,
  }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

export async function associerReference(entree: { projectId: unknown; baseVersionId: unknown; assetId: unknown; role: unknown; scope: unknown }): Promise<Ecriture> {
  const g = await gardeSources('studio.propose');
  if (!g.ok) return g;
  return associerReferencePour(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, assetId: entree?.assetId, role: entree?.role, scope: entree?.scope }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

export async function retirerReference(entree: { projectId: unknown; baseVersionId: unknown; assetId: unknown; role: unknown }): Promise<Ecriture> {
  const g = await gardeSources('studio.propose');
  if (!g.ok) return g;
  return retirerReferencePour(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, assetId: entree?.assetId, role: entree?.role }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

export async function controlerCompilation(entree: { projectId: unknown; mode: unknown }): Promise<Reponse<{ preparation: PreparationCompilation }>> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  return preparerCompilationPour(g.ctx, { projectId: entree?.projectId, mode: entree?.mode }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

export async function compilerConsigneImage(entree: { projectId: unknown; mode: unknown; largeur?: unknown; hauteur?: unknown }): Promise<ResultatCompilation> {
  const g = await gardeSources('studio.generate');
  if (!g.ok) return g;
  const d = dependancesTextesProduction();
  if (await d.plafondAtteint()) return erreurStudio('BUDGET_EXCEEDED', { traceId: g.ctx.traceId });
  return compilerConsigneImagePour(g.ctx, { projectId: entree?.projectId, mode: entree?.mode, largeur: entree?.largeur, hauteur: entree?.hauteur }, {
    adaptateur: d.adaptateur, environnement: d.environnement, veilleOuverte: g.veilleOuverte, maintenant: new Date(),
  });
}

export async function trancherComposants(entree: { jobId: unknown; constats: unknown }): Promise<Reponse<{ qualite: StatutQualite; verdict: VerdictComposants }>> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return trancherComposantsLib(g.ctx, { jobId: entree?.jobId, constats: entree?.constats });
}
