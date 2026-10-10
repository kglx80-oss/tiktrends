/**
 * Studios · L4 · le produit de la marque CIBLE · faits connus et manques
 * (cahier 01 §4.2 point 6).
 *
 * Pur. Le produit vient TOUJOURS de la marque cible, jamais de la source : le
 * concurrent n'apporte que de la structure (`import.ts`). Avant tout scénario,
 * on montre ce qu'on sait du produit et ce qui manque, sans rien inventer.
 *
 * L'instantané (`referenceProduit`) est ce qui entre dans la version du projet
 * (`productRef`) : identifiant, nom, faits, manques, présence d'une photo. Pas
 * l'URL de la photo · les photos déposées vivent en data URI (L0-A §8) et
 * gonfleraient chaque version ; la photo épinglée viendra d'un média studio
 * (`assetId`) quand il existera.
 */

export interface ProduitMarque {
  id: string;
  name: string;
  description: string | null;
  usp: string | null;
  price: number | null;
  url: string | null;
  imageUrl: string | null;
  imageUrls: readonly string[] | null;
}

export type CleFaitProduit = 'nom' | 'description' | 'promesse' | 'prix' | 'page' | 'photo';

export const LIBELLES_FAIT_PRODUIT: Readonly<Record<CleFaitProduit, string>> = {
  nom: 'Nom',
  description: 'Description',
  promesse: 'Promesse (bénéfice clé)',
  prix: 'Prix',
  page: 'Page produit',
  photo: 'Photo produit',
};

export interface FaitProduit { cle: CleFaitProduit; libelle: string; valeur: string }
export interface ManqueProduit { cle: CleFaitProduit; libelle: string }

const propre = (x: string | null | undefined, max = 600) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function faitsProduit(p: ProduitMarque): { faits: FaitProduit[]; manques: ManqueProduit[] } {
  const faits: FaitProduit[] = [];
  const manques: ManqueProduit[] = [];
  const pose = (cle: CleFaitProduit, valeur: string) => {
    if (valeur) faits.push({ cle, libelle: LIBELLES_FAIT_PRODUIT[cle], valeur });
    else manques.push({ cle, libelle: LIBELLES_FAIT_PRODUIT[cle] });
  };
  pose('nom', propre(p.name, 200));
  pose('description', propre(p.description));
  pose('promesse', propre(p.usp, 300));
  pose('prix', typeof p.price === 'number' && Number.isFinite(p.price) && p.price > 0 ? `${p.price.toFixed(2).replace('.', ',')} €` : '');
  pose('page', propre(p.url, 300).replace(/^https?:\/\//i, ''));
  const photos = (p.imageUrl ? 1 : 0) + (p.imageUrls?.filter((u) => typeof u === 'string' && u.length > 0 && u !== p.imageUrl).length ?? 0);
  pose('photo', photos > 0 ? `${photos} photo${photos > 1 ? 's' : ''} disponible${photos > 1 ? 's' : ''}` : '');
  return { faits, manques };
}

/** L'identifiant de « source » d'un fait produit dans le brief. */
export function idSourceProduit(productId: string): string {
  return `produit:${productId}`;
}

export interface ReferenceProduitStudio {
  productId: string;
  assetId: null;
  nom: string;
  faits: FaitProduit[];
  manques: ManqueProduit[];
  photoDisponible: boolean;
  instantaneLe: string;
}

export function referenceProduit(p: ProduitMarque, maintenant: Date): ReferenceProduitStudio {
  const { faits, manques } = faitsProduit(p);
  return {
    productId: p.id,
    assetId: null,
    nom: propre(p.name, 200),
    faits,
    manques,
    photoDisponible: !manques.some((m) => m.cle === 'photo'),
    instantaneLe: maintenant.toISOString(),
  };
}

/** Relit un `productRef` de version · `null` si absent ou d'une autre forme. */
export function lireReferenceProduit(x: unknown): ReferenceProduitStudio | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null;
  const r = x as Partial<ReferenceProduitStudio>;
  if (typeof r.productId !== 'string' || typeof r.nom !== 'string' || !Array.isArray(r.faits) || !Array.isArray(r.manques)) return null;
  return r as ReferenceProduitStudio;
}
