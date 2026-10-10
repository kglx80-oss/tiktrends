/**
 * Studios · la bibliothèque `/assets` montre AUSSI les sorties livrées des
 * projets Studios.
 *
 * ── Le défaut réparé ─────────────────────────────────────────────────────────
 *
 * Les Studios écrivent leurs sorties (générations, retouches, exports) dans
 * `studio_assets` ; la bibliothèque ne lisait que `assets`. Une image produite
 * dans un projet n'apparaissait donc pas dans la bibliothèque de sa marque :
 * deux applications côte à côte au lieu d'une.
 *
 * ── Ce module (pur · ni base, ni réseau) ─────────────────────────────────────
 *
 *  · `verdictSortieLivree` · QUELLES lignes `studio_assets` sont « livrées »
 *    (utilisables), et pourquoi les autres ne le sont pas ;
 *  · `lotsLivreurs` · quel lot a RÉELLEMENT livré quel média (lu dans
 *    `result.assets` du job, jamais déduit) ;
 *  · `elementStudioBibliotheque` · ce que la bibliothèque affiche d'une sortie
 *    (nom, type, origine « Studios · <projet> », lien du projet, adresse gardée) ;
 *  · `fusionnerBibliotheque` · les deux sources en UNE liste, du plus récent
 *    au plus ancien, bornée.
 *
 * Aucun fichier n'est dupliqué : la sortie reste dans `studio_assets`, servie
 * par `/api/studios/media/:id` (session, espace et marques relus à chaque
 * requête). La ligne est en LECTURE SEULE dans la bibliothèque : ni
 * suppression, ni bascule IA, ni template (ces gestes écrivent dans `assets`).
 */

import { libelleMediaStudio } from './produit/catalogue';

/** Origines d'une SORTIE · génération du worker (`generated`) et export conservé (`render`). */
export const ORIGINES_SORTIE_STUDIO: readonly string[] = ['generated', 'render'];

/**
 * Types servis par `/api/studios/media/:id` (`MIMES_SERVIS`) · une sortie d'un
 * autre type n'aurait pas de vignette lisible : elle n'entre pas.
 */
export const MIMES_SORTIE_BIBLIOTHEQUE: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4'];

/** Même borne que la liste historique (`listAssets`) · la page n'affiche jamais plus. */
export const LIMITE_BIBLIOTHEQUE = 400;

export interface LotLivreur {
  state: string;
  qualityStatus: string;
}

export interface SortieStudioLue {
  id: string;
  projectId: string | null;
  origin: string;
  mime: string;
  storageState: string;
  /** Média du fournisseur simulé (tests) · jamais servi par le stockage réel. */
  simule: boolean;
  /** Lot qui a livré ce média (`result.assets`) · `null` s'il n'est pas retrouvé. */
  lot: LotLivreur | null;
}

export type VerdictSortie = { livree: true } | { livree: false; raison: string };

/**
 * Une sortie est LIVRÉE quand :
 *  · ses octets sont stockés (`stored`) ;
 *  · c'est une SORTIE (génération ou export), pas une entrée de travail
 *    (dépôt, masque, import, ancien média) ;
 *  · elle appartient à un projet (le lien d'origine en dépend) ;
 *  · son type est servi par la route gardée, et ce n'est pas un média simulé ;
 *  · pour une génération : son lot est retrouvé, TERMINÉ, et n'a pas été
 *    écarté à la relecture (même règle que `admissibiliteVariante`).
 */
export function verdictSortieLivree(s: SortieStudioLue): VerdictSortie {
  if (s.storageState !== 'stored') return { livree: false, raison: 'octets non stockés' };
  if (!ORIGINES_SORTIE_STUDIO.includes(s.origin)) return { livree: false, raison: 'entrée de travail, pas une sortie' };
  if (!s.projectId) return { livree: false, raison: 'sans projet' };
  if (!MIMES_SORTIE_BIBLIOTHEQUE.includes(s.mime)) return { livree: false, raison: 'type non servi' };
  if (s.simule) return { livree: false, raison: 'média simulé' };
  if (s.origin === 'generated') {
    if (!s.lot) return { livree: false, raison: 'lot introuvable' };
    if (s.lot.state !== 'completed') return { livree: false, raison: 'lot non terminé' };
    if (s.lot.qualityStatus === 'rejected') return { livree: false, raison: 'écartée à la relecture' };
  }
  return { livree: true };
}

/**
 * Quel lot a livré quel média · lu dans `result.assets` (`{ operation: assetId }`),
 * défensivement. Un même média cité par deux lots garde le premier vu.
 */
export function lotsLivreurs(jobs: ReadonlyArray<LotLivreur & { result: unknown }>): Map<string, LotLivreur> {
  const out = new Map<string, LotLivreur>();
  for (const j of jobs) {
    const r = j.result;
    if (typeof r !== 'object' || r === null || Array.isArray(r)) continue;
    const a = (r as Record<string, unknown>).assets;
    if (typeof a !== 'object' || a === null || Array.isArray(a)) continue;
    for (const v of Object.values(a)) {
      if (typeof v === 'string' && !out.has(v)) out.set(v, { state: j.state, qualityStatus: j.qualityStatus });
    }
  }
  return out;
}

/** Adresse de la page d'un projet Studios. */
export const cheminProjetStudio = (projectId: string): string => `/studio/projets/${encodeURIComponent(projectId)}`;
/** Adresse GARDÉE d'un média studio (même route que l'éditeur). */
export const cheminMediaStudio = (assetId: string): string => `/api/studios/media/${encodeURIComponent(assetId)}`;

export interface OrigineStudioBibliotheque {
  projetId: string;
  projetTitre: string;
  /** « Studios · <nom du projet> » · ce que la carte affiche. */
  libelle: string;
  href: string;
}

export interface ElementStudioBibliotheque {
  id: string;
  name: string;
  kind: 'image' | 'video';
  url: string;
  createdAt: string;
  studio: OrigineStudioBibliotheque;
}

/** Ce que la bibliothèque affiche d'une sortie livrée. */
export function elementStudioBibliotheque(s: { id: string; projectId: string; origin: string; mime: string; createdAt: Date | string }, projetTitre: string | null | undefined): ElementStudioBibliotheque {
  const titre = (projetTitre ?? '').trim() || 'Projet sans titre';
  return {
    id: s.id,
    name: libelleMediaStudio(s.origin, s.id),
    kind: s.mime.startsWith('video/') ? 'video' : 'image',
    url: cheminMediaStudio(s.id),
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : s.createdAt.toISOString(),
    studio: { projetId: s.projectId, projetTitre: titre, libelle: `Studios · ${titre}`, href: cheminProjetStudio(s.projectId) },
  };
}

/**
 * Les deux sources en une liste · plus récent d'abord (à date égale, ordre
 * d'identifiant, stable), sans doublon d'identifiant, bornée à `limite`.
 */
export function fusionnerBibliotheque<T extends { id: string; createdAt: string }>(a: readonly T[], b: readonly T[], limite: number = LIMITE_BIBLIOTHEQUE): T[] {
  const vus = new Set<string>();
  const tous: T[] = [];
  for (const x of [...a, ...b]) {
    if (vus.has(x.id)) continue;
    vus.add(x.id);
    tous.push(x);
  }
  tous.sort((x, y) => {
    const dx = Date.parse(x.createdAt), dy = Date.parse(y.createdAt);
    if (dx !== dy) return dy - dx;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  });
  return tous.slice(0, Math.max(0, Math.trunc(limite)));
}
