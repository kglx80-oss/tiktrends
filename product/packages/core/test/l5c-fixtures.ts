import { createHash } from 'node:crypto';
import { composerBrief, type BriefCanonique } from '../src/studios/brief';
import { annonceObservee, referenceSource, type SourceReferenceStudio } from '../src/studios/sources/reference';
import { referenceProduit, type ProduitMarque } from '../src/studios/sources/produit';
import type { HypotheseTest } from '../src/studios/sources/hypotheses';
import { contenuVide, type ContenuVersion } from '../src/studios/document';
import {
  photosDuProduit, empreinteAdresse, idBibliotheque, versionDepuisEmpreinte,
  type EmpreinteFichier, type FichierCatalogue,
} from '../src/studios/produit';

/**
 * Fixtures L5-C · un catalogue de SEPT photos (data URI d'octets distincts,
 * dont une distante), une annonce concurrente, un brief composé par L4-B.
 */

export const T0 = new Date('2026-10-08T09:00:00Z');
export const ID_PRODUIT = '11111111-1111-4111-8111-111111111111';
export const ID_AUTRE = '22222222-2222-4222-8222-222222222222';

/** Une « image » : des octets distincts par numéro, en data URI base64. */
export function dataUri(n: number): string {
  const octets = Buffer.from(Array.from({ length: 64 + n }, (_, i) => (i * 31 + n * 7) % 256));
  return `data:image/png;base64,${octets.toString('base64')}`;
}
export const shaOctetsNode = (uri: string) => createHash('sha256').update(Buffer.from(uri.split(',')[1]!, 'base64')).digest('hex');

/** Le hacheur du serveur, rejoué ici avec node:crypto (référence indépendante). */
export function hacher(url: string): EmpreinteFichier {
  return url.startsWith('data:') ? { sha256: shaOctetsNode(url), nature: 'contenu' } : empreinteAdresse(url);
}

export const PHOTOS = [dataUri(1), dataUri(2), dataUri(3), dataUri(4), dataUri(5), dataUri(6), 'https://cdn.boutique.test/lunettes-7.jpg'];

export const produit: ProduitMarque = {
  id: ID_PRODUIT, name: 'Lunettes Sport Bandeau', description: 'Lunettes de sport avec bandeau élastique', usp: 'Tiennent pendant la course',
  price: 49, url: 'https://boutique.test/lunettes', imageUrl: PHOTOS[0]!, imageUrls: PHOTOS,
};
export const autreProduit: ProduitMarque = { id: ID_AUTRE, name: 'Casquette', description: null, usp: null, price: null, url: null, imageUrl: dataUri(40), imageUrls: null };

export const photos = () => photosDuProduit({ id: produit.id, name: produit.name, imageUrl: produit.imageUrl, imageUrls: produit.imageUrls }, hacher);
export const photosAutre = () => photosDuProduit({ id: autreProduit.id, name: autreProduit.name, imageUrl: autreProduit.imageUrl, imageUrls: autreProduit.imageUrls }, hacher);

const annonce = annonceObservee({
  id: '9001', platform: 'meta', daysRunning: 64, mediaType: 'image', thumbnailUrl: 'https://cdn.test/v.jpg',
  advertiserName: 'Lumière Botanique', body: 'Votre regard mérite mieux. Nos lunettes à verres miroir tiennent partout et pour toujours.',
  callToAction: 'Acheter', landingDomain: 'lbcosmetiques.fr',
})!;
export const source: SourceReferenceStudio = referenceSource({ type: 'veille_ad', annonce, savedAdId: null, portee: { workspaceId: 'ws_a', brandId: 'b_a1' }, observeLe: T0, format: null, retourVeille: null });

export const hypothese: HypotheseTest = {
  id: 'hyp_1', statement: 'Une accroche sur la tenue en course augmente le taux de clic.', sourceIds: [source.sourceId], variable: 'Accroche',
  control: 'Accroche prix', treatment: 'Accroche tenue', invariants: ['Même visuel'], metric: 'Taux de clic (CTR)', decisionRule: '+15 % après 3 000 impressions', limitations: [],
};

export function brief(): BriefCanonique {
  return composerBrief({ sources: [source], hypothese, produit: referenceProduit(produit, T0), audience: 'Coureurs 25-40 ans' });
}

export function contenuAvecBrief(b: BriefCanonique = brief()): ContenuVersion {
  return { ...contenuVide(), brief: b as unknown as Record<string, unknown>, productRef: referenceProduit(produit, T0) as unknown as ContenuVersion['productRef'] };
}

/** Le fichier « source concurrente » du catalogue des références. */
export const fichierConcurrent: FichierCatalogue = {
  assetId: source.sourceId, assetVersion: versionDepuisEmpreinte(source.empreinte), sha256: source.empreinte, nature: 'contenu',
  provenance: 'concurrent', libelle: 'Annonce meta · Lumière Botanique', productId: null, position: null, annonceur: source.annonceur, apercu: false,
};
export const fichierLogo: FichierCatalogue = {
  assetId: 'logo_aaaaaaaaaaaaaaaaaaaaaaaa', assetVersion: versionDepuisEmpreinte('a'.repeat(64)), sha256: 'a'.repeat(64), nature: 'contenu',
  provenance: 'logo', libelle: 'Logo principal', productId: null, position: null, annonceur: null, apercu: true,
};
export const fichierBib: FichierCatalogue = {
  assetId: idBibliotheque('33333333-3333-4333-8333-333333333333'), assetVersion: versionDepuisEmpreinte('b'.repeat(64)), sha256: 'b'.repeat(64), nature: 'contenu',
  provenance: 'bibliotheque', libelle: 'Coureuse de face', productId: null, position: null, annonceur: null, apercu: true,
};

export function catalogue(): Map<string, FichierCatalogue> {
  return new Map([...photos(), ...photosAutre(), fichierConcurrent, fichierLogo, fichierBib].map((f) => [f.assetId, f]));
}
