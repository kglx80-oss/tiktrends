/**
 * Studios · L5 · le PRODUIT ÉPINGLÉ (cahier 01 §4.4 point 1, §7
 * ProductReference ; recette IMG-01).
 *
 * Pur. Choisir la variante catalogue et UNE photo précise, visible avec ses
 * composants obligatoires. La référence écrite dans `productRef` porte :
 * produit, variante, photo (identifiant, version, empreinte et sa nature),
 * composants obligatoires (« lunettes », « bandeau »), attributs immuables,
 * transformations autorisées, provenance des faits.
 *
 * ── Compatibilité ────────────────────────────────────────────────────────────
 *
 * La référence PROLONGE l'instantané produit de L4-B (`ReferenceProduitStudio`
 * · nom, faits, manques, présence d'une photo) : la page projet, la complétude
 * et l'export du brief la lisent sans changement (`lireReferenceProduit`).
 * `assetId` désigne la photo épinglée · le graphe d'impact L1
 * (`dependDuProduit`) relie déjà un plan qui la cite au produit.
 */

import type { ViolationStudio, ContenuVersion } from '../document';
import type { ChangementPatch } from '../patch';
import type { BriefCanonique, FaitBrief, ReferenceBrief } from '../brief';
import { faitsProduit, idSourceProduit, type ProduitMarque, type FaitProduit, type ManqueProduit } from '../sources/produit';
import type { FichierCatalogue, NatureEmpreinte, VarianteCatalogue } from './catalogue';

/* ───────────────────────── Transformations ───────────────────────────────── */

/**
 * Ce que la génération ou la composition peut faire à la photo du produit.
 * Liste FERMÉE : un geste absent n'est pas autorisé. Par défaut le produit
 * reste photographique (cahier §4.4 point 3) · seul le décor change.
 */
export const TRANSFORMATIONS_PRODUIT = ['detourage', 'recadrage', 'echelle', 'rotation', 'ombre', 'decor', 'lumiere'] as const;
export type TransformationProduit = typeof TRANSFORMATIONS_PRODUIT[number];

export const LIBELLES_TRANSFORMATION: Readonly<Record<TransformationProduit, string>> = {
  detourage: 'Détourer le produit',
  recadrage: 'Recadrer',
  echelle: 'Changer l’échelle',
  rotation: 'Pivoter',
  ombre: 'Ajouter une ombre portée',
  decor: 'Changer le décor autour du produit',
  lumiere: 'Ajuster la lumière ambiante sur le produit',
};

export const TRANSFORMATIONS_PAR_DEFAUT: readonly TransformationProduit[] = ['detourage', 'recadrage', 'echelle', 'rotation', 'ombre', 'decor'];

/** Toujours interdit, quelle que soit la liste · dit à l'écran et transmis aux consignes. */
export const ATTRIBUTS_IMMUABLES_SOCLE: readonly string[] = [
  'Forme, couleurs, matières et étiquette du produit telles que sur la photo épinglée',
  'Aucun composant ajouté, retiré ou remplacé',
];

/* ───────────────────────────── Référence ─────────────────────────────────── */

export const SCHEMA_PRODUIT_EPINGLE = 'produit_epingle/1' as const;
export const COMPOSANTS_MAX = 20;
export const COMPOSANT_LONGUEUR_MAX = 80;
export const ATTRIBUTS_MAX = 20;
export const ATTRIBUT_LONGUEUR_MAX = 200;

export interface PhotoEpinglee {
  assetId: string;
  assetVersion: string;
  sha256: string;
  nature: NatureEmpreinte;
  /** Position au moment de l'épinglage (1 = principale) · un libellé, pas une identité. */
  position: number;
  /** Nombre de photos du produit au moment de l'épinglage. */
  total: number;
}

export interface ReferenceProduitEpinglee {
  schema: typeof SCHEMA_PRODUIT_EPINGLE;
  productId: string;
  /** La photo épinglée · même valeur que `photo.assetId`. */
  assetId: string;
  nom: string;
  faits: FaitProduit[];
  manques: ManqueProduit[];
  photoDisponible: true;
  instantaneLe: string;
  variante: VarianteCatalogue;
  photo: PhotoEpinglee;
  composantsObligatoires: string[];
  attributsImmuables: string[];
  transformationsAutorisees: TransformationProduit[];
  provenanceFaits: { origine: 'catalogue_produits'; productId: string; releveLe: string };
  epingleLe: string;
}

export interface DemandeEpinglage {
  productId: unknown;
  photoId: unknown;
  composants?: unknown;
  attributs?: unknown;
  transformations?: unknown;
}

export type ResultatEpinglage = { ok: true; reference: ReferenceProduitEpinglee } | { ok: false; violations: ViolationStudio[] };

const propre = (x: string, max: number) => x.replace(/\s+/g, ' ').trim().slice(0, max);

/** Liste de libellés courts · nettoyés, dédoublonnés sans tenir compte de la casse. */
function libelles(x: unknown, chemin: string, max: number, longueur: number, v: ViolationStudio[]): string[] {
  if (x === undefined || x === null) return [];
  if (!Array.isArray(x)) { v.push({ chemin, raison: 'liste de libellés attendue' }); return []; }
  const out: string[] = [];
  const vus = new Set<string>();
  x.forEach((t, i) => {
    if (typeof t !== 'string') { v.push({ chemin: `${chemin}/${i}`, raison: 'libellé texte attendu' }); return; }
    const p = propre(t, longueur + 1);
    if (!p) return;
    if (p.length > longueur) { v.push({ chemin: `${chemin}/${i}`, raison: `${longueur} caractères au plus` }); return; }
    const cle = p.toLocaleLowerCase('fr');
    if (vus.has(cle)) return;
    vus.add(cle);
    out.push(p);
  });
  if (out.length > max) v.push({ chemin, raison: `${max} au plus` });
  return out;
}

/**
 * Construit la référence épinglée · le produit et la photo viennent du
 * catalogue SERVEUR (jamais du client), la photo doit être UNE des photos de
 * CE produit.
 */
export function epinglerProduit(
  d: DemandeEpinglage,
  catalogue: { produit: ProduitMarque | null; photos: readonly FichierCatalogue[]; variante: VarianteCatalogue },
  maintenant: Date,
): ResultatEpinglage {
  const v: ViolationStudio[] = [];
  const p = catalogue.produit;
  if (!p || typeof d.productId !== 'string' || d.productId !== p.id) return { ok: false, violations: [{ chemin: 'productId', raison: 'produit absent du catalogue de la marque du projet' }] };
  const photo = catalogue.photos.find((f) => f.assetId === d.photoId && f.provenance === 'produit' && f.productId === p.id);
  if (!photo) return { ok: false, violations: [{ chemin: 'photoId', raison: 'choisis une photo précise de ce produit' }] };
  const composants = libelles(d.composants, 'composants', COMPOSANTS_MAX, COMPOSANT_LONGUEUR_MAX, v);
  const attributs = libelles(d.attributs, 'attributs', ATTRIBUTS_MAX, ATTRIBUT_LONGUEUR_MAX, v);
  let transformations: TransformationProduit[] = [...TRANSFORMATIONS_PAR_DEFAUT];
  if (d.transformations !== undefined && d.transformations !== null) {
    if (!Array.isArray(d.transformations)) v.push({ chemin: 'transformations', raison: 'liste attendue' });
    else {
      const inconnues = d.transformations.filter((t) => !TRANSFORMATIONS_PRODUIT.includes(t as TransformationProduit));
      if (inconnues.length) v.push({ chemin: 'transformations', raison: 'transformation inconnue · la liste est fermée' });
      transformations = TRANSFORMATIONS_PRODUIT.filter((t) => (d.transformations as unknown[]).includes(t));
    }
  }
  if (v.length) return { ok: false, violations: v };
  const { faits, manques } = faitsProduit(p);
  const iso = maintenant.toISOString();
  return {
    ok: true,
    reference: {
      schema: SCHEMA_PRODUIT_EPINGLE,
      productId: p.id,
      assetId: photo.assetId,
      nom: propre(p.name, 200),
      faits,
      manques: manques.filter((m) => m.cle !== 'photo'),
      photoDisponible: true,
      instantaneLe: iso,
      variante: { ...catalogue.variante },
      photo: {
        assetId: photo.assetId, assetVersion: photo.assetVersion, sha256: photo.sha256, nature: photo.nature,
        position: photo.position ?? 1, total: catalogue.photos.filter((f) => f.productId === p.id).length,
      },
      composantsObligatoires: composants,
      attributsImmuables: [...ATTRIBUTS_IMMUABLES_SOCLE, ...attributs.filter((a) => !ATTRIBUTS_IMMUABLES_SOCLE.includes(a))],
      transformationsAutorisees: transformations,
      provenanceFaits: { origine: 'catalogue_produits', productId: p.id, releveLe: iso },
      epingleLe: iso,
    },
  };
}

/** Relit une référence ÉPINGLÉE · `null` pour l'instantané L4-B sans photo, ou une autre forme. */
export function lireReferenceEpinglee(x: unknown): ReferenceProduitEpinglee | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null;
  const r = x as Partial<ReferenceProduitEpinglee>;
  if (r.schema !== SCHEMA_PRODUIT_EPINGLE || typeof r.productId !== 'string' || typeof r.assetId !== 'string') return null;
  const ph = r.photo as Partial<PhotoEpinglee> | undefined;
  if (!ph || ph.assetId !== r.assetId || typeof ph.sha256 !== 'string' || typeof ph.assetVersion !== 'string') return null;
  if (!Array.isArray(r.composantsObligatoires) || !r.composantsObligatoires.every((c) => typeof c === 'string')) return null;
  if (!Array.isArray(r.transformationsAutorisees) || !Array.isArray(r.attributsImmuables) || !Array.isArray(r.faits) || !Array.isArray(r.manques)) return null;
  return r as ReferenceProduitEpinglee;
}

/* ───────────────────────── État de la photo épinglée ─────────────────────── */

export type EtatPhotoEpinglee = 'presente' | 'retiree' | 'produit_retire';

/**
 * La photo épinglée est-elle encore dans le catalogue ? Comparée par identité
 * (dérivée du contenu) : une photo remplacée n'est PAS la photo épinglée, même
 * à la même position. Lecture pure, rien n'est réécrit.
 */
export function etatPhotoEpinglee(ref: ReferenceProduitEpinglee, catalogue: { produitPresent: boolean; photos: readonly Pick<FichierCatalogue, 'assetId' | 'sha256'>[] }): EtatPhotoEpinglee {
  if (!catalogue.produitPresent) return 'produit_retire';
  return catalogue.photos.some((f) => f.assetId === ref.photo.assetId && f.sha256 === ref.photo.sha256) ? 'presente' : 'retiree';
}

export const LIBELLES_ETAT_PHOTO: Readonly<Record<EtatPhotoEpinglee, string>> = {
  presente: 'Photo épinglée présente dans le catalogue',
  retiree: 'La photo épinglée n’est plus dans le catalogue · la référence garde son empreinte, aucune autre photo ne la remplace en silence',
  produit_retire: 'Le produit a quitté le catalogue · la référence reste lisible, à remplacer',
};

/* ──────────────────────── Écriture dans la version ───────────────────────── */

/** L'association « Produit » de la photo épinglée · composants et gestes permis compris. */
export function associationProduit(ref: ReferenceProduitEpinglee): ReferenceBrief {
  return {
    assetId: ref.photo.assetId, assetVersion: ref.photo.assetVersion, sha256: ref.photo.sha256,
    role: 'product', scope: 'product',
    allowedChanges: [...ref.transformationsAutorisees],
    requiredComponents: [...ref.composantsObligatoires],
  };
}

/** Faits produit du brief · ceux d'un autre produit sont retirés, ceux du produit épinglé reposés. */
export function faitsAvecProduit(faits: readonly FaitBrief[], ref: ReferenceProduitEpinglee): FaitBrief[] {
  const src = idSourceProduit(ref.productId);
  const gardes = faits.filter((f) => !(f.id.startsWith('produit.') && f.sourceIds.some((s) => s.startsWith('produit:'))));
  const produit: FaitBrief[] = ref.faits.map((f) => ({ id: `produit.${f.cle}`, claim: `${f.libelle} : ${f.valeur}`.slice(0, 12_000), sourceIds: [src], kind: 'declared', confidence: 'high' }));
  if (ref.composantsObligatoires.length) {
    produit.push({ id: 'produit.composants', claim: `Composants obligatoires : ${ref.composantsObligatoires.join(', ')}`, sourceIds: [src], kind: 'declared', confidence: 'high' });
  }
  return [...gardes, ...produit].slice(0, 100);
}

/**
 * Références du brief après épinglage · les associations « Produit » qui ne
 * visent pas une photo de CE produit sont retirées (le produit a changé),
 * celle de la photo épinglée est posée (ou mise à jour). Les autres rôles
 * restent intacts.
 */
export function referencesAvecProduit(refs: readonly ReferenceBrief[], ref: ReferenceProduitEpinglee, photosDuProduit: ReadonlySet<string>): ReferenceBrief[] {
  const gardes = refs.filter((r) => r.role !== 'product' || (photosDuProduit.has(r.assetId) && r.assetId !== ref.photo.assetId));
  return [associationProduit(ref), ...gardes].slice(0, 100);
}

/**
 * Les changements d'une nouvelle version · `/productRef` toujours ; `/brief`
 * (faits produit et association « Produit ») si le projet a un brief. Les
 * collections étant indexées par identifiant, les listes du brief se
 * remplacent entières (aucun indice positionnel).
 */
export function changementsEpinglage(contenu: ContenuVersion, brief: BriefCanonique | null, ref: ReferenceProduitEpinglee, photosDuProduit: ReadonlySet<string>): ChangementPatch[] {
  const raison = `Produit épinglé : ${ref.nom} · photo ${ref.photo.position}`;
  const out: ChangementPatch[] = [{ op: 'replace', path: '/productRef', newValue: ref, reason: raison }];
  void contenu;
  if (brief) {
    out.push({ op: 'replace', path: '/brief/facts', newValue: faitsAvecProduit(brief.facts, ref), reason: raison });
    out.push({ op: 'replace', path: '/brief/references', newValue: referencesAvecProduit(brief.references, ref, photosDuProduit), reason: raison });
  }
  return out;
}
