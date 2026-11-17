import type { BriefCanonique, ReferenceBrief } from '../src/studios/brief';
import {
  epinglerProduit, associationProduit, controlerAvantCompilation, entreeCompilation, photosDuProduit, VARIANTE_UNIQUE,
  type FichierCatalogue, type ReferenceProduitEpinglee,
} from '../src/studios/produit';
import type { ProduitMarque } from '../src/studios/sources/produit';
import { T0, ID_PRODUIT, produit, photos, brief, catalogue, hacher, dataUri, fichierConcurrent, fichierLogo, fichierBib } from './l5c-fixtures';

/**
 * Scénarios « produit préparé » · les MÊMES entrées servent à capturer le
 * contexte de `image.compile` sur main (avant la fiche et les vues) et à le
 * comparer après. Trois catalogues : une seule photo, sept photos épinglées
 * en 5, sept photos épinglées en 1 avec logo et bibliothèque.
 */

export const ID_SEUL = '44444444-4444-4444-8444-444444444444';
export const produitSeul: ProduitMarque = { id: ID_SEUL, name: 'Sérum Éclat', description: 'Sérum visage', usp: null, price: 29, url: null, imageUrl: dataUri(90), imageUrls: [dataUri(90)] };
export const photosSeul = () => photosDuProduit({ id: produitSeul.id, name: produitSeul.name, imageUrl: produitSeul.imageUrl, imageUrls: produitSeul.imageUrls }, hacher);

const refDe = (f: FichierCatalogue, role: ReferenceBrief['role'], scope: ReferenceBrief['scope']): ReferenceBrief => ({ assetId: f.assetId, assetVersion: f.assetVersion, sha256: f.sha256, role, scope, allowedChanges: [], requiredComponents: [] });

export interface ScenarioCompilation {
  nom: string;
  produit: ReferenceProduitEpinglee;
  brief: BriefCanonique;
  fichiers: Map<string, FichierCatalogue>;
}

function epingle(p: ProduitMarque, ph: FichierCatalogue[], position: number, composants: string[]): ReferenceProduitEpinglee {
  const r = epinglerProduit({ productId: p.id, photoId: ph[position - 1]!.assetId, composants }, { produit: p, photos: ph, variante: VARIANTE_UNIQUE }, T0);
  if (!r.ok) throw new Error(JSON.stringify(r.violations));
  return r.reference;
}

export function scenarios(): ScenarioCompilation[] {
  const seul = epingle(produitSeul, photosSeul(), 1, ['flacon']);
  const cinq = epingle(produit, photos(), 5, ['lunettes', 'bandeau']);
  const un = epingle(produit, photos(), 1, []);
  const tous = new Map([...catalogue(), ...photosSeul().map((f) => [f.assetId, f] as const)]);
  return [
    { nom: 'une-photo', produit: seul, brief: { ...brief(), references: [associationProduit(seul)] }, fichiers: tous },
    { nom: 'sept-photos-epinglee-5-concurrent', produit: cinq, brief: { ...brief(), references: [associationProduit(cinq), refDe(fichierConcurrent, 'style', 'background')] }, fichiers: tous },
    { nom: 'sept-photos-epinglee-1-logo-bib', produit: un, brief: { ...brief(), references: [associationProduit(un), refDe(fichierLogo, 'logo', 'global'), refDe(fichierBib, 'composition', 'global')] }, fichiers: tous },
  ];
}

export const ID_PRODUIT_SEPT = ID_PRODUIT;

/** Le contexte complet que `image.compile` reçoit · préparation et entrée. */
export function contexteCompilation(s: ScenarioCompilation) {
  const prep = controlerAvantCompilation({ mode: 'generative_scene', brief: s.brief, produit: s.produit, fichiers: s.fichiers });
  const entree = entreeCompilation({ prep, brief: s.brief, versionId: 'ver_produit_prepare', mode: 'generative_scene', largeur: 1080, hauteur: 1350 });
  return { prep, entree };
}
