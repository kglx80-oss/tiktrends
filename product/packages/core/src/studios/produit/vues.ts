/**
 * Studios · les VUES du produit envoyées au modèle d'images · jusqu'à trois
 * photos du MÊME produit par génération (référence concurrente : « tu choisis
 * jusqu'à 3 photos de référence par créa »).
 *
 * Pur. Avant : une seule photo partait (l'épinglée) · le dos, le côté ou le
 * gros plan de l'étiquette restaient au catalogue. Maintenant :
 *
 *  1. la photo épinglée, toujours la première ;
 *  2. puis jusqu'à DEUX autres vues, CHOISIES par la personne :
 *     · celles de la fiche (`vuesChoisies`, liste vide permise = la photo
 *       épinglée seule) ;
 *     · sinon les associations « Produit » déjà posées dans le brief vers
 *       d'autres photos du produit (le geste « Associer un fichier »).
 *
 * ── Pourquoi le défaut reste « l'épinglée seule » ───────────────────────────
 *
 * Les photos d'un catalogue ne sont pas toutes des vues du produit : une
 * fiche Shopify importée mêle ambiances (le produit posé parmi d'autres
 * objets), guide des tailles, tableau d'ingrédients, autres coloris du même
 * article. Envoyées sans regard, elles apprennent au modèle un AUTRE produit.
 * Tant que le propriétaire n'a pas comparé 1 vue et 3 vues sur un vrai
 * produit, rien ne part sans un choix : les photos SUIVANTES de la fiche
 * (positions après l'épinglée, puis retour au début) sont PROPOSÉES à
 * l'écran (`proposees`), un clic les ajoute.
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
import { REFERENCES_PAR_APPEL_MAX, familleModele } from '../fournisseurs/fal-image';
import { MODELE_FAL_EDITION_DEFAUT } from '../fournisseurs/choix';
import type { FichierCatalogue } from './catalogue';
import { associationProduit, type ReferenceProduitEpinglee } from './epinglage';

export const VUES_PRODUIT_MAX = 3;
/** Les vues en plus de la photo épinglée. */
export const VUES_SUPPLEMENTAIRES_MAX = VUES_PRODUIT_MAX - 1;

export type OrigineVue = 'epinglee' | 'choisie' | 'defaut';

export const LIBELLES_ORIGINE_VUE: Readonly<Record<OrigineVue, string>> = {
  epinglee: 'photo épinglée',
  choisie: 'vue choisie',
  defaut: 'vue suivante, proposée',
};

export interface VueEnvoyee { assetId: string; position: number | null; origine: OrigineVue }

export interface VuesProduit {
  /** Les associations Produit transmises, dans l'ordre d'envoi · l'épinglée d'abord. */
  references: ReferenceBrief[];
  vues: VueEnvoyee[];
  /** Les vues suivantes proposées quand rien n'est choisi · jamais envoyées sans un clic. */
  proposees: VueEnvoyee[];
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

/**
 * La phrase qui dit au modèle que les N photos sont UN article · invariant du
 * contexte et contrainte de la consigne finale (`compilation.ts`), dès qu'il
 * part plus d'une vue (risque : trois flacons à l'image).
 */
export function phraseUnSeulArticle(n: number): string {
  return `Les photos produit 1 à ${n} sont des vues du même article · un seul exemplaire à l’image, sauf le contenu d’achat déclaré.`;
}

/**
 * Le modèle d'édition routé n'accepte-t-il qu'une image de départ (Flux,
 * Kontext · `familleModele`) ? Même choix que `decisionFournisseurStudio`.
 */
export function editionAReferenceUnique(env: Readonly<Record<string, string | undefined>>): boolean {
  return familleModele(env.FAL_IMAGE_MODEL_EDIT || MODELE_FAL_EDITION_DEFAUT) === 'reference_unique';
}

export function vuesProduit(e: {
  produit: ReferenceProduitEpinglee;
  references: readonly ReferenceBrief[];
  fichiers: ReadonlyMap<string, FichierCatalogue>;
  /** Le modèle routé ne reçoit qu'une image (`editionAReferenceUnique`) · l'épinglée seule part, c'est dit. */
  referenceUnique?: boolean;
}): VuesProduit {
  const ref = e.produit;
  const avertissements: string[] = [];
  const epinglee = e.references.find((r) => r.role === 'product' && r.assetId === ref.photo.assetId) ?? associationProduit(ref);

  const origine: OrigineVue = 'choisie';
  let candidats: string[];
  const choisies = lireVuesChoisies(ref);
  const associees = [...new Set(e.references.filter((r) => r.role === 'product' && r.assetId !== ref.photo.assetId).map((r) => r.assetId))]
    .filter((id) => estVueDuProduit(e.fichiers.get(id), ref));
  if (choisies) {
    candidats = choisies.filter((id) => estVueDuProduit(e.fichiers.get(id), ref));
    const perdues = choisies.length - candidats.length;
    if (perdues > 0) avertissements.push(`${perdues} vue${perdues > 1 ? 's' : ''} choisie${perdues > 1 ? 's' : ''} absente${perdues > 1 ? 's' : ''} du catalogue de ce produit · non envoyée${perdues > 1 ? 's' : ''}, aucune autre photo ne la remplace.`);
    // La fiche décide · une association Produit du brief qu'elle ne retient pas ne part pas, et c'est dit.
    const ecartees = associees.filter((id) => !candidats.includes(id)).length;
    if (ecartees > 0) avertissements.push(`${ecartees} photo${ecartees > 1 ? 's' : ''} associée${ecartees > 1 ? 's' : ''} au rôle Produit dans le brief ne ${ecartees > 1 ? 'partent' : 'part'} pas · la fiche choisit les vues envoyées.`);
  } else {
    candidats = associees;
  }

  const autres = new Set(e.references.filter((r) => r.role !== 'product' && r.assetId !== ref.photo.assetId).map((r) => r.assetId)).size;
  const libre = Math.max(0, Math.min(VUES_SUPPLEMENTAIRES_MAX, REFERENCES_PAR_APPEL_MAX - 1 - autres));
  const place = e.referenceUnique ? 0 : libre;
  if (e.referenceUnique && candidats.length > 0) {
    const n = Math.min(candidats.length, VUES_SUPPLEMENTAIRES_MAX);
    avertissements.push(`Le modèle d’images routé ne reçoit qu’une image de départ · seule la photo épinglée part, ${n > 1 ? `les ${n} autres vues attendent` : 'l’autre vue attend'} un modèle multi-références.`);
  }
  if (candidats.length > VUES_SUPPLEMENTAIRES_MAX) {
    avertissements.push(`${candidats.length} vues choisies en plus de la photo épinglée · seules les ${VUES_SUPPLEMENTAIRES_MAX} premières partent (${VUES_PRODUIT_MAX} photos du produit au plus).`);
  }
  const retenues = candidats.slice(0, place);
  const coupees = e.referenceUnique ? 0 : Math.min(candidats.length, VUES_SUPPLEMENTAIRES_MAX) - retenues.length;
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
  // Rien de choisi · les photos suivantes sont PROPOSÉES (jamais envoyées), dans la place que l'appel laisse.
  const proposees: VueEnvoyee[] = !choisies && associees.length === 0 && !e.referenceUnique
    ? vuesParDefaut(ref, e.fichiers).slice(0, libre).map((id) => ({ assetId: id, position: e.fichiers.get(id)!.position, origine: 'defaut' as const }))
    : [];
  return { references, vues, proposees, avertissements };
}
