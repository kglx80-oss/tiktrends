'use server';

import type { ErreurStudio, PreparationCompilation, StatutQualite, VerdictComposants } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { gardeSources } from '../../../lib/studios/sources/acces';
import { refusCapacite } from '../../../lib/studios/interrupteurs';
import type { VersionStudio } from '../../../lib/studios/depot';
import { lireVueProduitPour, type VueProduit } from '../../../lib/studios/produit/vue';
import { epinglerProduitPour, associerReferencePour, retirerReferencePour } from '../../../lib/studios/produit/commandes';
import { preparerCompilationPour } from '../../../lib/studios/produit/compilation';
import type { ResultatCompilationImage } from '../../../lib/studios/image/consigne';
import { trancherComposants as trancherComposantsLib } from '../../../lib/studios/produit/qualite';
import { compilerConsigneImage as compilerConsigneImageAttestee } from './image';

/**
 * Commandes « produit épinglé et références typées » (cahier §4.4 points 1, 2
 * et 5). Garde des sources (studio + accès Veille relu) : une source Veille
 * n'est associable que par quelqu'un qui peut encore la lire.
 *
 *  · lire, contrôler avant compilation · `studio.read`, lecture pure ;
 *  · épingler, associer, retirer · `studio.propose`, nouvelle version (409) ;
 *  · compiler la consigne image · `studio.generate` (appel texte payant,
 *    barrière de dépense), aucun média produit ; passe par le chemin ATTESTÉ
 *    du parcours image (F-B), seul dont le résultat peut être retenu ;
 *  · trancher les composants d'un média · `studio.propose` (relecteur).
 *
 * F1 · capacité « projets » pour l'écran produit ; la compilation passe par
 * l'action image (capacité « generation_image ») ; trancher un média déjà
 * livré n'est jamais coupé.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;
type Ecriture = Reponse<{ version: VersionStudio; inchange: boolean }>;

export async function lireProduitProjet(entree: { projectId: unknown }): Promise<Reponse<{ vue: VueProduit }>> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
  return lireVueProduitPour(g.ctx, entree?.projectId, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

export async function epinglerProduit(entree: { projectId: unknown; baseVersionId: unknown; productId: unknown; photoId: unknown; composants?: unknown; attributs?: unknown; transformations?: unknown }): Promise<Ecriture> {
  const g = await gardeSources('studio.propose');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
  return epinglerProduitPour(g.ctx, {
    projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, productId: entree?.productId, photoId: entree?.photoId,
    composants: entree?.composants, attributs: entree?.attributs, transformations: entree?.transformations,
  }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

export async function associerReference(entree: { projectId: unknown; baseVersionId: unknown; assetId: unknown; role: unknown; scope: unknown }): Promise<Ecriture> {
  const g = await gardeSources('studio.propose');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
  return associerReferencePour(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, assetId: entree?.assetId, role: entree?.role, scope: entree?.scope }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

export async function retirerReference(entree: { projectId: unknown; baseVersionId: unknown; assetId: unknown; role: unknown }): Promise<Ecriture> {
  const g = await gardeSources('studio.propose');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
  return retirerReferencePour(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, assetId: entree?.assetId, role: entree?.role }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

export async function controlerCompilation(entree: { projectId: unknown; mode: unknown }): Promise<Reponse<{ preparation: PreparationCompilation }>> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
  return preparerCompilationPour(g.ctx, { projectId: entree?.projectId, mode: entree?.mode }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

/**
 * G-A · cette action compilait « à nu » (`compilerConsigneImagePour`) : la
 * consigne rendue n'était pas attestée côté serveur, donc `retenirConsigneImage`
 * la refusait (MISSING_REFERENCE) · un appel texte payé pour rien. Elle passe
 * désormais par l'action du parcours image (`compilerEtAttesterPour`) : même
 * garde, même barrière de dépense, même attestation. Le format est relu dans le
 * contenu de la version par le serveur, jamais reçu du navigateur.
 */
export async function compilerConsigneImage(entree: { projectId: unknown; mode: unknown }): Promise<ResultatCompilationImage> {
  return compilerConsigneImageAttestee({ projectId: entree?.projectId, mode: entree?.mode });
}

export async function trancherComposants(entree: { jobId: unknown; constats: unknown }): Promise<Reponse<{ qualite: StatutQualite; verdict: VerdictComposants }>> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return trancherComposantsLib(g.ctx, { jobId: entree?.jobId, constats: entree?.constats });
}
