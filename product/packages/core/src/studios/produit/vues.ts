/**
 * Studios · les VUES du produit envoyées au modèle d'images · jusqu'à trois
 * photos du MÊME produit par génération (référence concurrente : « tu choisis
 * jusqu'à 3 photos de référence par créa »).
 *
 * Pur. Avant : une seule photo partait (l'épinglée) · le dos, le côté ou le
 * gros plan de l'étiquette restaient au catalogue. Maintenant :
 *
 *  1. la photo épinglée, toujours la première ;
 *  2. puis jusqu'à DEUX autres vues, dans cet ordre de priorité :
 *     · celles que la personne a choisies sur la fiche (`vuesChoisies`,
 *       liste vide permise = la photo épinglée seule) ;
 *     · sinon les associations « Produit » déjà posées dans le brief vers
 *       d'autres photos du produit (le geste « Associer un fichier ») ;
 *     · sinon, par défaut, les photos SUIVANTES de la fiche (positions après
 *       l'épinglée, puis retour au début).
 *
 * Toutes passent par le chemin de références existant · association rôle
 * `product`, portée `product`, gestes permis et composants du produit
 * épinglé. Une vue n'est JAMAIS la photo d'un autre produit : provenance
 * `produit` et `productId` de l'épinglé, relus dans le catalogue serveur.
 *
 * ── La borne de l'appel ──────────────────────────────────────────────────────
 *
 * Le fournisseur reçoit au plus `REFERENCES_PAR_APPEL_MAX` (8) références.
 * Les autres références du brief (logo, style, composition…) comptent
 * d'abord · les vues en plus ne prennent que la place qui reste, et ce qui ne
 * part pas est dit (avertissement), jamais tu.
 */

import type { ReferenceBrief } from '../brief';
import { REFERENCES_PAR_APPEL_MAX } from '../fournisseurs/fal-image';
import type { FichierCatalogue } from './catalogue';
import { associationProduit, type ReferenceProduitEpinglee } from './epinglage';

export const VUES_PRODUIT_MAX = 3;
/** Les vues en plus de la photo épinglée. */
export const VUES_SUPPLEMENTAIRES_MAX = VUES_PRODUIT_MAX - 1;

export type OrigineVue = 'epinglee' | 'choisie' | 'defaut';

export const LIBELLES_ORIGINE_VUE: Readonly<Record<OrigineVue, string>> = {
  epinglee: 'photo épinglée',
  choisie: 'vue choisie',
  defaut: 'vue suivante, par défaut',
};

export interface VueEnvoyee { assetId: string; position: number | null; origine: OrigineVue }

export interface VuesProduit {
  /** Les associations Produit transmises, dans l'ordre d'envoi · l'épinglée d'abord. */
  references: ReferenceBrief[];
  vues: VueEnvoyee[];
  /** Ce qui ne part pas, et pourquoi. */
  avertissements: string[];
}

/** Une photo de CE produit, autre que l'épinglée ? */
function estVueDuProduit(f: FichierCatalogue | undefined, ref: ReferenceProduitEpinglee): f is FichierCatalogue {
  return !!f && f.provenance === 'produit' && f.productId === ref.productId && f.assetId !== ref.photo.assetId;
}

/** Les photos suivantes de la fiche · positions après l'épinglée, puis retour au début. */
export function vuesParDefaut(ref: ReferenceProduitEpinglee, fichiers: ReadonlyMap<string, FichierCatalogue>): string[] {
  const photos = [...fichiers.values()].filter((f) => estVueDuProduit(f, ref)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const p = ref.photo.position;
  return [...photos.filter((f) => (f.position ?? 0) > p), ...photos.filter((f) => (f.position ?? 0) <= p)].map((f) => f.assetId);
}

/** La liste des vues choisies stockée sur la référence · `null` = jamais choisie (défaut). */
export function lireVuesChoisies(ref: ReferenceProduitEpinglee): string[] | null {
  const x = (ref as { vuesChoisies?: unknown }).vuesChoisies;
  if (!Array.isArray(x)) return null;
  return [...new Set(x.filter((v): v is string => typeof v === 'string'))];
}

export function vuesProduit(e: {
  produit: ReferenceProduitEpinglee;
  references: readonly ReferenceBrief[];
  fichiers: ReadonlyMap<string, FichierCatalogue>;
}): VuesProduit {
  const ref = e.produit;
  const avertissements: string[] = [];
  const epinglee = e.references.find((r) => r.role === 'product' && r.assetId === ref.photo.assetId) ?? associationProduit(ref);

  let candidats: string[];
  let origine: OrigineVue;
  const choisies = lireVuesChoisies(ref);
  if (choisies) {
    origine = 'choisie';
    candidats = choisies.filter((id) => estVueDuProduit(e.fichiers.get(id), ref));
    const perdues = choisies.length - candidats.length;
    if (perdues > 0) avertissements.push(`${perdues} vue${perdues > 1 ? 's' : ''} choisie${perdues > 1 ? 's' : ''} absente${perdues > 1 ? 's' : ''} du catalogue de ce produit · non envoyée${perdues > 1 ? 's' : ''}, aucune autre photo ne la remplace.`);
  } else {
    const associees = [...new Set(e.references.filter((r) => r.role === 'product' && r.assetId !== ref.photo.assetId).map((r) => r.assetId))]
      .filter((id) => estVueDuProduit(e.fichiers.get(id), ref));
    origine = associees.length ? 'choisie' : 'defaut';
    candidats = associees.length ? associees : vuesParDefaut(ref, e.fichiers);
  }

  const autres = new Set(e.references.filter((r) => r.role !== 'product' && r.assetId !== ref.photo.assetId).map((r) => r.assetId)).size;
  const place = Math.max(0, Math.min(VUES_SUPPLEMENTAIRES_MAX, REFERENCES_PAR_APPEL_MAX - 1 - autres));
  if (origine === 'choisie' && candidats.length > VUES_SUPPLEMENTAIRES_MAX) {
    avertissements.push(`${candidats.length} vues choisies en plus de la photo épinglée · seules les ${VUES_SUPPLEMENTAIRES_MAX} premières partent (${VUES_PRODUIT_MAX} photos du produit au plus).`);
  }
  const retenues = candidats.slice(0, place);
  const coupees = Math.min(candidats.length, VUES_SUPPLEMENTAIRES_MAX) - retenues.length;
  if (coupees > 0) {
    avertissements.push(`Borne de ${REFERENCES_PAR_APPEL_MAX} références par appel · ${coupees} vue${coupees > 1 ? 's' : ''} du produit non envoyée${coupees > 1 ? 's' : ''} (${autres} autre${autres > 1 ? 's' : ''} référence${autres > 1 ? 's' : ''} du brief passe${autres > 1 ? 'nt' : ''} d’abord).`);
  }

  const references: ReferenceBrief[] = [epinglee];
  const vues: VueEnvoyee[] = [{ assetId: ref.photo.assetId, position: ref.photo.position, origine: 'epinglee' }];
  for (const id of retenues) {
    const f = e.fichiers.get(id)!;
    const deja = e.references.find((r) => r.role === 'product' && r.assetId === id);
    references.push(deja ?? {
      assetId: f.assetId, assetVersion: f.assetVersion, sha256: f.sha256, role: 'product', scope: 'product',
      allowedChanges: [...ref.transformationsAutorisees], requiredComponents: [...ref.composantsObligatoires],
    });
    vues.push({ assetId: id, position: f.position, origine });
  }
  return { references, vues, avertissements };
}
