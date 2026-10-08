import 'server-only';
import {
  controlerAvantCompilation, etatPhotoEpinglee, erreurStudio, LIBELLES_ETAT_PHOTO, LIBELLES_PROVENANCE, LIBELLES_ROLE, LIBELLES_PORTEE,
  type EtatPhotoEpinglee, type FichierCatalogue, type PreparationCompilation, type ReferenceProduitEpinglee,
  type RoleReference, type PorteeReference, type ProvenanceFichier, type NatureEmpreinte, type ErreurStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { chargerCatalogueProjet, type CatalogueProjet } from './catalogue';

/**
 * La vue de l'écran « Produit et références » · données SÉRIALISABLES, sans
 * octets d'image (les aperçus passent par une adresse servie après contrôle
 * de portée). Lecture pure.
 */

export interface PhotoVue {
  assetId: string;
  assetVersion: string;
  sha256: string;
  nature: NatureEmpreinte;
  position: number;
  /** Adresse d'aperçu servie par la route du projet (jamais la data URI). */
  apercu: string;
}

export interface ProduitVue { id: string; nom: string; photos: PhotoVue[] }

export interface FichierVue {
  assetId: string;
  assetVersion: string;
  sha256: string;
  nature: NatureEmpreinte;
  provenance: ProvenanceFichier;
  libelleProvenance: string;
  libelle: string;
  apercu: string | null;
  productId: string | null;
}

export interface AssociationVue {
  assetId: string;
  role: RoleReference;
  libelleRole: string;
  scope: PorteeReference;
  libellePortee: string;
  libelle: string;
  provenance: ProvenanceFichier | null;
  requiredComponents: string[];
  epinglee: boolean;
}

export interface VueProduit {
  projet: { id: string; title: string; marque: string };
  version: { id: string; n: number };
  briefPresent: boolean;
  produits: ProduitVue[];
  epingle: (ReferenceProduitEpinglee & { etat: EtatPhotoEpinglee; libelleEtat: string; apercu: string | null }) | null;
  /** Produit choisi à la création (L4-B) sans photo épinglée. */
  produitSansPhoto: { productId: string; nom: string } | null;
  fichiers: FichierVue[];
  associations: AssociationVue[];
  preparation: Record<'faithful_composite' | 'generative_scene', PreparationCompilation>;
}

export function adresseApercu(projectId: string, f: Pick<FichierCatalogue, 'assetId' | 'provenance'> & { url: string | null }): string | null {
  if (f.provenance === 'produit' || f.provenance === 'logo') return `/studio/projets/${projectId}/produit/fichier/${f.assetId}`;
  if (f.provenance === 'bibliotheque') return f.url;
  return null;
}

export function construireVueProduit(c: CatalogueProjet): VueProduit {
  const pid = c.projet.id;
  const e = c.epingle;
  const produitEpingle = e ? c.produits.find((p) => p.produit.id === e.productId) ?? null : null;
  const etat = e ? etatPhotoEpinglee(e, { produitPresent: !!produitEpingle, photos: produitEpingle?.photos ?? [] }) : null;
  const fichierEpingle = e ? c.fichiers.get(e.photo.assetId) : undefined;
  return {
    projet: { id: pid, title: c.projet.title, marque: c.marque },
    version: { id: c.version.id, n: c.version.n },
    briefPresent: !!c.brief,
    produits: c.produits.map((p) => ({
      id: p.produit.id, nom: p.produit.name,
      photos: p.photos.map((f) => ({ assetId: f.assetId, assetVersion: f.assetVersion, sha256: f.sha256, nature: f.nature, position: f.position ?? 1, apercu: adresseApercu(pid, f)! })),
    })),
    epingle: e && etat ? { ...e, etat, libelleEtat: LIBELLES_ETAT_PHOTO[etat], apercu: fichierEpingle && etat === 'presente' ? adresseApercu(pid, fichierEpingle) : null } : null,
    produitSansPhoto: !e && c.instantane ? { productId: c.instantane.productId, nom: c.instantane.nom } : null,
    fichiers: [...c.fichiers.values()].map((f) => ({
      assetId: f.assetId, assetVersion: f.assetVersion, sha256: f.sha256, nature: f.nature, provenance: f.provenance,
      libelleProvenance: LIBELLES_PROVENANCE[f.provenance], libelle: f.libelle, apercu: adresseApercu(pid, f), productId: f.productId,
    })),
    associations: (c.brief?.references ?? []).map((r) => {
      const f = c.fichiers.get(r.assetId);
      return {
        assetId: r.assetId, role: r.role, libelleRole: LIBELLES_ROLE[r.role], scope: r.scope, libellePortee: LIBELLES_PORTEE[r.scope],
        libelle: f?.libelle ?? `Fichier ${r.assetId.slice(0, 16)} · plus dans le catalogue`, provenance: f?.provenance ?? null,
        requiredComponents: [...r.requiredComponents], epinglee: !!e && r.role === 'product' && r.assetId === e.photo.assetId,
      };
    }),
    preparation: {
      faithful_composite: controlerAvantCompilation({ mode: 'faithful_composite', brief: c.brief, produit: e, fichiers: c.fichiers }),
      generative_scene: controlerAvantCompilation({ mode: 'generative_scene', brief: c.brief, produit: e, fichiers: c.fichiers }),
    },
  };
}

export async function lireVueProduitPour(ctx: ContexteStudio, projectId: unknown, o: { veilleOuverte: boolean; maintenant: Date }): Promise<({ ok: true; vue: VueProduit }) | ErreurStudio> {
  const c = await chargerCatalogueProjet(ctx, projectId, o);
  if (!c.ok) return c;
  return { ok: true, vue: construireVueProduit(c.catalogue) };
}

/** Le fichier servi par la route d'aperçu · photo produit ou logo de la marque du projet. */
export async function fichierAServirPour(ctx: ContexteStudio, projectId: unknown, assetId: unknown, o: { veilleOuverte: boolean; maintenant: Date }): Promise<{ ok: true; url: string } | ErreurStudio> {
  const c = await chargerCatalogueProjet(ctx, projectId, o);
  if (!c.ok) return c;
  const f = typeof assetId === 'string' ? c.catalogue.fichiers.get(assetId) : undefined;
  if (!f || !f.url || (f.provenance !== 'produit' && f.provenance !== 'logo')) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  return { ok: true, url: f.url };
}
