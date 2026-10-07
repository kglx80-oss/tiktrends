/**
 * Studios · L4 · référence de source (cahier 01 §7 « SourceReference », §4.2).
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * Une source est une publicité OBSERVÉE (Veille) ou SAUVEGARDÉE (Sauvegardes,
 * Formats) d'où l'on part pour créer. La référence est ce qu'un projet garde
 * d'elle, durablement, dans `studio_projects.source_refs` :
 *
 *  · un identifiant OPAQUE et stable (`src_<16 hex>`), dérivé du type et de la
 *    clé externe · jamais une URL (une URL de média expire, et une URL signée
 *    n'est pas une identité, cahier §7) ;
 *  · le DROIT : une annonce publique s'observe et s'analyse (sa structure), elle
 *    ne se recopie pas · ni produit, ni marque, ni allégation du concurrent ;
 *  · la PORTÉE (espace de la session, marque de la sauvegarde s'il y en a une) ;
 *  · la DATE D'OBSERVATION · ce qu'on a vu, quand on l'a vu ;
 *  · un EXTRAIT AUTORISÉ borné et des observations dérivées (`modalites.ts`) ·
 *    ce qui reste lisible même quand la source ne l'est plus ;
 *  · une EMPREINTE du snapshot normalisé ;
 *  · un STATUT (`active`, `revoquee`, `supprimee`) · une source dont l'accès est
 *    retiré n'est plus lisible, mais son tombstone reste (cahier §4.2 point 6).
 *
 * Aucun champ média (image, vidéo, vignette) n'est stocké : quand la source est
 * encore accessible, l'écran relit la sauvegarde ; sinon il n'y a rien à
 * montrer, et c'est voulu (on ne contourne pas une révocation par un cache).
 */

import { empreinteContenu } from '../version';
import { estIdStable } from '../document';
import { observerSource, type ObservationSource, type ElementAbsent, type ModaliteSource } from './modalites';

export type TypeSource = 'veille_ad' | 'saved_ad';
export type StatutSource = 'active' | 'revoquee' | 'supprimee';
/** Le seul droit que donne une annonce publique observée · cf. en-tête. */
export const DROIT_OBSERVATION_PUBLIQUE = 'observation_publique' as const;
export type DroitSource = typeof DROIT_OBSERVATION_PUBLIQUE;

/** Taille de l'extrait autorisé · une accroche et sa phrase suivante, pas l'annonce entière. */
export const EXTRAIT_AUTORISE_MAX = 280;
/** Nombre maximal de sources d'un projet. */
export const SOURCES_MAX = 10;

export interface FormatSource { id: string; libelle: string }

export interface SourceReferenceStudio {
  schema: 1;
  sourceId: string;
  type: TypeSource;
  /** `plateforme:identifiant externe` · la clé de la source chez son fournisseur. */
  cle: string;
  /** La ligne `saved_ads` d'origine pour une source sauvegardée, sinon `null`. */
  savedAdId: string | null;
  droit: DroitSource;
  portee: { workspaceId: string; brandId: string | null };
  /** ISO 8601 · le moment où la source a été observée et figée dans ce projet. */
  observeLe: string;
  plateforme: string;
  annonceur: string;
  diffuseeDepuisJours: number | null;
  extraitAutorise: string;
  modalites: ModaliteSource[];
  format: FormatSource | null;
  observations: ObservationSource[];
  absents: ElementAbsent[];
  empreinte: string;
  statut: StatutSource;
  revoqueeLe: string | null;
  /** Contexte de retour vers la Veille (critères nettoyés + ancre), ou `null`. */
  retourVeille: string | null;
}

/**
 * Ce que le serveur sait d'une annonce, après nettoyage · jamais le snapshot
 * brut du client. Les URL de média ne servent qu'à DÉDUIRE les modalités, elles
 * ne sont pas recopiées dans la référence.
 */
export interface AnnonceObservee {
  id: string;
  platform: string;
  mediaType: string | null;
  aImage: boolean;
  aVideo: boolean;
  advertiserName: string;
  body: string;
  callToAction: string;
  landingDomain: string;
  aLien: boolean;
  daysRunning: number | null;
  transcription: string;
  aAudio: boolean;
}

const texteBorne = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * Nettoie un snapshot d'annonce (Veille ou sauvegarde) · liste blanche de
 * champs, types vérifiés, longueurs bornées. `null` sans identifiant.
 */
export function annonceObservee(brut: unknown): AnnonceObservee | null {
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) return null;
  const a = brut as Record<string, unknown>;
  const id = texteBorne(a.id, 120);
  if (!id || !/^[A-Za-z0-9_.:-]+$/.test(id)) return null;
  const platform = texteBorne(a.platform, 20).toLowerCase().replace(/[^a-z]/g, '') || 'meta';
  const mediaType = texteBorne(a.mediaType, 20).toLowerCase() || null;
  const url = (v: unknown) => typeof v === 'string' && /^(https?:)?\/\//i.test(v.trim());
  const aVideo = mediaType === 'video';
  const aImage = url(a.thumbnailUrl) || (mediaType === 'image' && url(a.mediaUrl)) || (mediaType === 'image');
  const jours = typeof a.daysRunning === 'number' && Number.isFinite(a.daysRunning) && a.daysRunning >= 0 ? Math.floor(a.daysRunning) : null;
  const transcription = texteBorne(a.transcript ?? a.transcription, 12_000);
  return {
    id,
    platform,
    mediaType,
    aImage,
    aVideo,
    advertiserName: texteBorne(a.advertiserName, 160),
    body: texteBorne(a.body, 4000),
    callToAction: texteBorne(a.callToAction, 80),
    landingDomain: texteBorne(a.landingDomain, 200).replace(/^https?:\/\//i, '').replace(/\/.*$/, ''),
    aLien: url(a.landingUrl) || texteBorne(a.landingDomain, 200).length > 0,
    daysRunning: jours,
    transcription,
    aAudio: a.hasAudio === true,
  };
}

/** Identifiant opaque et stable d'une source · le même pour la même annonce. */
export function idSource(type: TypeSource, cle: string): string {
  return `src_${empreinteContenu({ type, cle }).slice(0, 16)}`;
}

/** L'extrait autorisé · le début du texte, coupé sur un mot. */
export function extraitAutorise(body: string): string {
  const t = body.replace(/\s+/g, ' ').trim();
  if (t.length <= EXTRAIT_AUTORISE_MAX) return t;
  const coupe = t.slice(0, EXTRAIT_AUTORISE_MAX - 1);
  const espace = coupe.lastIndexOf(' ');
  return `${(espace > 120 ? coupe.slice(0, espace) : coupe).trim()}…`;
}

export interface EntreeReference {
  type: TypeSource;
  annonce: AnnonceObservee;
  savedAdId: string | null;
  portee: { workspaceId: string; brandId: string | null };
  observeLe: Date;
  format: FormatSource | null;
  retourVeille: string | null;
}

/** Construit la référence durable d'une source à partir d'une annonce nettoyée. */
export function referenceSource(e: EntreeReference): SourceReferenceStudio {
  const cle = `${e.annonce.platform}:${e.annonce.id}`;
  const sourceId = idSource(e.type, cle);
  const { modalites, observations, absents } = observerSource(sourceId, e.annonce, e.format);
  const extrait = extraitAutorise(e.annonce.body);
  // L'empreinte porte sur ce qui a été OBSERVÉ (snapshot normalisé), pas sur la date.
  const empreinte = empreinteContenu({ cle, annonce: e.annonce, format: e.format });
  return {
    schema: 1,
    sourceId,
    type: e.type,
    cle,
    savedAdId: e.savedAdId,
    droit: DROIT_OBSERVATION_PUBLIQUE,
    portee: { ...e.portee },
    observeLe: e.observeLe.toISOString(),
    plateforme: e.annonce.platform,
    annonceur: e.annonce.advertiserName,
    diffuseeDepuisJours: e.annonce.daysRunning,
    extraitAutorise: extrait,
    modalites,
    format: e.format,
    observations,
    absents,
    empreinte,
    statut: 'active',
    revoqueeLe: null,
    retourVeille: e.retourVeille,
  };
}

/**
 * Le TOMBSTONE d'une source qui n'est plus lisible · même identité, même
 * empreinte, mêmes observations autorisées, statut changé et daté. Aucun lien
 * de retour vers la source (on ne la rouvre pas par un raccourci).
 */
export function tombstoneSource(s: SourceReferenceStudio, statut: Exclude<StatutSource, 'active'>, le: Date): SourceReferenceStudio {
  return { ...s, statut, revoqueeLe: s.revoqueeLe ?? le.toISOString(), retourVeille: null };
}

const MODALITES: readonly ModaliteSource[] = ['image', 'video', 'transcription', 'texte', 'lien'];

/**
 * Relit une référence stockée (jsonb) · une forme inattendue n'est jamais
 * « réparée » en silence : elle est écartée et signalée par l'appelant.
 */
export function lireReferenceSource(x: unknown): SourceReferenceStudio | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null;
  const s = x as Partial<SourceReferenceStudio>;
  if (s.schema !== 1 || !estIdStable(s.sourceId) || (s.type !== 'veille_ad' && s.type !== 'saved_ad')) return null;
  if (typeof s.cle !== 'string' || typeof s.observeLe !== 'string' || Number.isNaN(Date.parse(s.observeLe))) return null;
  if (s.droit !== DROIT_OBSERVATION_PUBLIQUE || typeof s.empreinte !== 'string' || !/^[a-f0-9]{64}$/.test(s.empreinte)) return null;
  if (!['active', 'revoquee', 'supprimee'].includes(s.statut as string)) return null;
  if (!Array.isArray(s.modalites) || !s.modalites.every((m) => MODALITES.includes(m))) return null;
  if (!Array.isArray(s.observations) || !Array.isArray(s.absents)) return null;
  if (typeof s.portee !== 'object' || s.portee === null || typeof s.portee.workspaceId !== 'string') return null;
  return s as SourceReferenceStudio;
}

export function lireReferencesSources(x: unknown): { sources: SourceReferenceStudio[]; illisibles: number } {
  if (!Array.isArray(x)) return { sources: [], illisibles: x === null || x === undefined ? 0 : 1 };
  const sources: SourceReferenceStudio[] = [];
  let illisibles = 0;
  for (const e of x) {
    const s = lireReferenceSource(e);
    if (s) sources.push(s); else illisibles++;
  }
  return { sources, illisibles };
}

export const LIBELLES_STATUT_SOURCE: Readonly<Record<StatutSource, string>> = {
  active: 'Accessible',
  revoquee: 'Accès retiré',
  supprimee: 'Source retirée',
};

export const LIBELLES_TYPE_SOURCE: Readonly<Record<TypeSource, string>> = {
  veille_ad: 'Annonce observée en Veille',
  saved_ad: 'Annonce sauvegardée',
};
