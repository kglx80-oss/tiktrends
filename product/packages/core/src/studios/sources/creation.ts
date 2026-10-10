/**
 * Studios · une création PRÉCÉDENTE de la marque comme source d'un projet.
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * Les projets Studios partaient d'annonces concurrentes (Veille, Sauvegardes)
 * et ignoraient ce que la marque avait déjà produit dans l'outil (Pubs IA,
 * Image IA · table `generations`). Ce module dit QUELLES créations peuvent
 * servir de source, et ce qu'on en garde.
 *
 *  · Réutilisable : une image ou une pub (`ad`, `image`), terminée
 *    (`completed`), avec au moins une image en `https://`. Une création
 *    archivée, en échec ou sans image n'est pas une source.
 *  · Ce qu'on en garde : le texte de la pub (accroche, sous-titre, appel à
 *    l'action) pour une pub ; rien d'écrit pour une image (sa consigne au
 *    modèle n'est pas un texte publicitaire, la recopier mentirait).
 *  · Le droit : `creation_interne` · elle appartient à la marque, elle se
 *    reprend · aucune exclusion de concurrent ne s'applique (`import.ts`).
 *  · Aucune URL n'est stockée dans la référence : l'aperçu est relu à chaque
 *    lecture (`apercuCreation`), comme pour une sauvegarde.
 */

import { referenceSource, type AnnonceObservee, type SourceReferenceStudio } from './reference';

/** Les sortes de créations qui produisent une image réutilisable. */
export const SORTES_CREATION_SOURCE = ['ad', 'image'] as const;
export type SorteCreationSource = (typeof SORTES_CREATION_SOURCE)[number];

/** Nombre de créations précédentes proposées dans « Préparer une création ». */
export const CREATIONS_PROPOSEES_MAX = 12;

/** Plateforme affichée d'une création précédente · produite dans l'outil. */
export const PLATEFORME_CREATION = 'interne';

/** Ce que la base dit d'une création · sous-ensemble de la table `generations`. */
export interface CreationBrute {
  id: string;
  brandId: string;
  kind: string;
  status: string | null;
  assetUrls: readonly string[] | null;
  input: unknown;
  createdAt: Date | string;
}

const texte = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const objet = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** La première image servable d'une création · `null` s'il n'y en a pas. */
export function imageCreation(g: Pick<CreationBrute, 'assetUrls'>): string | null {
  return (g.assetUrls ?? []).find((u) => typeof u === 'string' && /^https:\/\//.test(u)) ?? null;
}

/** Une création peut-elle servir de source ? · terminée, image ou pub, avec une image. */
export function creationReutilisable(g: Pick<CreationBrute, 'kind' | 'status' | 'assetUrls'>): boolean {
  return (SORTES_CREATION_SOURCE as readonly string[]).includes(g.kind) && g.status === 'completed' && imageCreation(g) !== null;
}

/**
 * L'aperçu montré · la pub COMPOSÉE (texte compris) par sa route de rendu,
 * l'image elle-même pour une image IA.
 */
export function apercuCreation(g: Pick<CreationBrute, 'id' | 'kind' | 'assetUrls'>): string | null {
  if (g.kind === 'ad') return `/api/ad/${g.id}`;
  return imageCreation(g);
}

/** Le texte publicitaire d'une création · accroche, sous-titre (pub seulement). */
export function texteCreation(g: Pick<CreationBrute, 'kind' | 'input'>): { body: string; cta: string } {
  if (g.kind !== 'ad') return { body: '', cta: '' };
  const r = objet(g.input);
  const body = [texte(r.headline, 300), texte(r.subhead, 600)].filter(Boolean).join(' · ');
  return { body, cta: texte(r.cta, 80) };
}

/** Le libellé d'une création dans une liste · sa sorte et son accroche quand elle en a une. */
export function libelleCreation(g: Pick<CreationBrute, 'kind' | 'input'>): string {
  const sorte = g.kind === 'ad' ? 'Pub' : 'Image';
  const { body } = texteCreation(g);
  return body ? `${sorte} · ${body.length > 90 ? `${body.slice(0, 89).trim()}…` : body}` : sorte;
}

/** La matière observée d'une création · même forme qu'une annonce nettoyée. */
export function matiereCreation(g: Pick<CreationBrute, 'id' | 'kind' | 'input'>): AnnonceObservee {
  const { body, cta } = texteCreation(g);
  return {
    id: g.id, platform: PLATEFORME_CREATION, mediaType: 'image', aImage: true, aVideo: false,
    // Pas d'annonceur : c'est la marque elle-même · aucune exclusion par nom.
    advertiserName: '', body, callToAction: cta, landingDomain: '', aLien: false,
    daysRunning: null, transcription: '', aAudio: false,
  };
}

/** La référence durable d'une création précédente · `null` si elle n'est pas réutilisable. */
export function referenceCreation(
  g: CreationBrute,
  e: { workspaceId: string; observeLe: Date },
): SourceReferenceStudio | null {
  if (!creationReutilisable(g)) return null;
  return referenceSource({
    type: 'creation', annonce: matiereCreation(g), savedAdId: null, generationId: g.id,
    portee: { workspaceId: e.workspaceId, brandId: g.brandId }, observeLe: e.observeLe, format: null, retourVeille: null,
  });
}

/**
 * Les sources « création » d'une autre marque que celle du projet · une
 * création porte le produit et la DA de SA marque, elle ne se greffe pas sur
 * une autre. Rend les identifiants fautifs (vide = tout est conforme).
 */
export function creationsHorsMarque(sources: readonly SourceReferenceStudio[], brandId: string): string[] {
  return sources.filter((s) => s.type === 'creation' && s.portee.brandId !== brandId).map((s) => s.sourceId);
}
