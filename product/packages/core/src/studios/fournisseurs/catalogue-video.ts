/**
 * Studios · catalogue des modèles vidéo (image → vidéo) · ce que chaque modèle
 * accepte, ce qu'il coûte À LA SECONDE, et ce que sa voix sait dire.
 *
 * Pur. Aucune base, aucun réseau. C'est la SEULE source des prix vidéo des
 * Studios : le devis (lignes par seconde), la réserve du worker
 * (`coutSoumissionStudio`) et l'écran lisent les mêmes chiffres ici. Un test
 * (`catalogue-video.test.ts`) échoue si une entrée réserve moins que son prix.
 *
 * ── Sources (relevées le 16/11/2026) ─────────────────────────────────────────
 *
 * Pages publiques des modèles fal, lues par recherche (fal.ai est bloqué depuis
 * la session · aucune page ouverte directement, aucune génération lancée) :
 *  · Veo 3.1 Fast · `fal-ai/veo3.1/fast/image-to-video` · `duration` "4s" |
 *    "6s" | "8s", `aspect_ratio` "9:16" (ou "16:9"), `resolution` "720p" |
 *    "1080p", `generate_audio` (vrai par défaut chez fal), `negative_prompt` ·
 *    0,10 $/s sans audio, 0,15 $/s avec, même prix en 720p et en 1080p ;
 *  · Veo 3.1 Lite · `fal-ai/veo3.1/lite/image-to-video` · mêmes paramètres ·
 *    720p 0,03 $/s sans audio, 0,05 $/s avec ; 1080p 0,05 $/s, 0,08 $/s ;
 *  · Kling 2.5 turbo pro · `fal-ai/kling-video/v2.5-turbo/pro/image-to-video`
 *    (le modèle déjà en service) · `duration` "5" | "10", muet · 0,35 $ les
 *    5 s puis 0,07 $ la seconde, soit 0,07 $/s (`COST_MODEL`, `economics.ts`).
 *
 * Ces prix ne sont pas encore rapprochés d'une facture fal : le devis les dit
 * « estimation » (`MOTIF_PRIX_CATALOGUE`), jamais « au plus ».
 *
 * ── La voix native ───────────────────────────────────────────────────────────
 *
 *  · Kling : la voix des modèles Kling ne parle que chinois et anglais (refus
 *    documenté pour le français), et l'entrée 2.5 turbo pro est muette chez
 *    fal · aucune voix utilisable en français ;
 *  · Veo 3.1 : le français n'est PAS confirmé officiellement · la voix est
 *    permise, marquée « à valider à l'écoute » (seul le propriétaire peut
 *    l'entendre), jamais présentée comme acquise.
 *
 * ── Hors catalogue ──────────────────────────────────────────────────────────
 *
 * Un modèle HORS catalogue (posé à la main dans `FAL_VIDEO_MODEL_STUDIO`) n'a
 * pas de prix : il est REFUSÉ au devis (`MOTIF_HORS_CATALOGUE`), jamais
 * envoyé au forfait d'un prix inconnu.
 *
 * ── La réserve, tant qu'aucune facture n'est rapprochée ──────────────────────
 *
 * Les prix ci-dessous sont relevés, pas encore rapprochés d'une facture fal.
 * Le DEVIS affiche l'estimation catalogue (prix × durée, « estimation ») ; la
 * RÉSERVE (ligne `ai_spend`, barrière du worker) ne descend jamais sous
 * l'ancien forfait de main pour un clip (`FIXED_COSTS.fal_video`, 0,60 $) :
 * Kling 5 s réserve 0,60 $ et non 0,35 $. Baisse de la réserve après
 * rapprochement d'une facture · quand le propriétaire fournit la ligne de
 * facture fal d'un modèle, on l'inscrit dans `FACTURES_FAL_RAPPROCHEES`, et
 * ce modèle réserve alors exactement prix × durée. Un modèle plus cher que le
 * forfait (Veo Fast 8 s, 1,20 $) réserve déjà prix × durée.
 */

import { CREDIT_COSTS } from '../../credits';
import { FIXED_COSTS } from '../../spend-guard';
import type { ModeParole } from '../document';

/** Date du relevé des prix · lue dans le motif du devis. */
export const DATE_RELEVE_CATALOGUE_VIDEO = '16/11/2026';

/** Forme du corps fal attendue par le modèle. */
export type FamilleCorpsVideo = 'kling' | 'veo';
export type ResolutionVideo = '720p' | '1080p';
export type RatioVideo = '9:16' | '16:9';
export type IdModeleVideo = 'kling-2.5-turbo-pro' | 'veo-3.1-fast' | 'veo-3.1-lite';

/** Prix d'une seconde de vidéo, micro-dollars entiers · `audio` `null` = aucune voix chez ce modèle. */
export interface PrixSeconde { muetUsdMicros: number; audioUsdMicros: number | null }

export interface VoixModele {
  /** Le modèle sait-il produire une piste audio (voix) ? */
  native: boolean;
  /** Langues couvertes, codes ISO à deux lettres · `null` = non publiées. */
  langues: readonly string[] | null;
  /** `confirmee` · publié par l'éditeur ; `a_valider_ecoute` · à entendre avant de s'y fier ; `aucune` · pas de voix. */
  statut: 'confirmee' | 'a_valider_ecoute' | 'aucune';
  note: string;
}

export interface EntreeCatalogueVideo {
  id: IdModeleVideo;
  libelle: string;
  /** Endpoint exact de la file fal. */
  endpoint: string;
  famille: FamilleCorpsVideo;
  /** Durées acceptées par le modèle, en secondes, croissantes. */
  dureesS: readonly number[];
  /** Prix à la seconde par résolution · Kling n'a pas de paramètre de résolution (une seule clé). */
  prix: Readonly<Partial<Record<ResolutionVideo, PrixSeconde>>>;
  /** Résolution envoyée (Veo) ou facturée (Kling). */
  resolutionDefaut: ResolutionVideo;
  /** Ratios produits · `null` = déduit de l'image de départ par le modèle. */
  ratios: readonly RatioVideo[] | null;
  voix: VoixModele;
  source: string;
}

export const CATALOGUE_VIDEO: readonly EntreeCatalogueVideo[] = [
  {
    id: 'kling-2.5-turbo-pro', libelle: 'Kling 2.5 turbo pro',
    endpoint: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', famille: 'kling',
    dureesS: [5, 10],
    prix: { '1080p': { muetUsdMicros: 70_000, audioUsdMicros: null } },
    resolutionDefaut: '1080p', ratios: null,
    voix: { native: false, langues: ['zh', 'en'], statut: 'confirmee', note: 'voix Kling en chinois et en anglais seulement, et ce modèle est muet chez fal · aucune voix utilisable en français' },
    source: `page fal du modèle, relevée le ${DATE_RELEVE_CATALOGUE_VIDEO} · 0,35 $ les 5 s, 0,07 $ la seconde en plus`,
  },
  {
    id: 'veo-3.1-fast', libelle: 'Veo 3.1 Fast',
    endpoint: 'fal-ai/veo3.1/fast/image-to-video', famille: 'veo',
    dureesS: [4, 6, 8],
    prix: { '720p': { muetUsdMicros: 100_000, audioUsdMicros: 150_000 }, '1080p': { muetUsdMicros: 100_000, audioUsdMicros: 150_000 } },
    // Même prix en 720p et 1080p · la meilleure des deux.
    resolutionDefaut: '1080p', ratios: ['9:16', '16:9'],
    voix: { native: true, langues: null, statut: 'a_valider_ecoute', note: 'français non confirmé officiellement · à valider à l’écoute' },
    source: `page fal du modèle, relevée le ${DATE_RELEVE_CATALOGUE_VIDEO} · 0,10 $/s sans audio, 0,15 $/s avec`,
  },
  {
    id: 'veo-3.1-lite', libelle: 'Veo 3.1 Lite',
    endpoint: 'fal-ai/veo3.1/lite/image-to-video', famille: 'veo',
    dureesS: [4, 6, 8],
    prix: { '720p': { muetUsdMicros: 30_000, audioUsdMicros: 50_000 }, '1080p': { muetUsdMicros: 50_000, audioUsdMicros: 80_000 } },
    // Le modèle économique · 720p, le moins cher.
    resolutionDefaut: '720p', ratios: ['9:16', '16:9'],
    voix: { native: true, langues: null, statut: 'a_valider_ecoute', note: 'français non confirmé officiellement · à valider à l’écoute' },
    source: `page fal du modèle, relevée le ${DATE_RELEVE_CATALOGUE_VIDEO} · 720p 0,03 / 0,05 $/s, 1080p 0,05 / 0,08 $/s`,
  },
];

/** Le modèle vidéo des Studios quand rien n'est posé · celui déjà en service. */
export const MODELE_VIDEO_STUDIO_DEFAUT = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';

/**
 * Le modèle d'animation des Studios · `FAL_VIDEO_MODEL_STUDIO`, sinon le
 * défaut. Variable DISTINCTE de `FAL_VIDEO_MODEL_I2V`, qui reste celle de
 * l'ancien « Vidéo IA » (`packages/integrations/src/fal.ts`) : changer l'un ne
 * change jamais l'autre.
 */
export function modeleAnimationStudio(env: Readonly<Record<string, string | undefined>>): string {
  const m = (env.FAL_VIDEO_MODEL_STUDIO ?? '').trim();
  return m || MODELE_VIDEO_STUDIO_DEFAUT;
}

/** L'entrée du catalogue d'un endpoint · `null` hors catalogue (repli au forfait). */
export function entreeCatalogueVideo(endpoint: string | null | undefined): EntreeCatalogueVideo | null {
  return CATALOGUE_VIDEO.find((e) => e.endpoint === endpoint) ?? null;
}

/* ─────────────────────────────── Durée ──────────────────────────────────── */

/**
 * La durée du clip pour un plan · la plus proche durée PERMISE au moins égale
 * à la durée du plan, bornée à la plus longue du modèle. `bornee` dit qu'un
 * plan plus long que le clip maximal sera coupé au montage.
 *
 * Saut assumé · chez Kling, un plan de 5,1 s part en 10 s (0,70 $ au lieu de
 * 0,35 $) : aucune tolérance n'est posée tant qu'aucune mesure ne dit combien
 * de dixièmes un montage absorbe sans gêne. Le prix du plan (durée comprise)
 * est annoncé AVANT le clic (`prixClipDuPlan`).
 */
export function dureeClipPour(e: Pick<EntreeCatalogueVideo, 'dureesS'>, dureePlanMs: number): { dureeS: number; bornee: boolean } {
  const ds = [...e.dureesS].sort((a, b) => a - b);
  const voulue = Math.max(1, Math.ceil((Number.isFinite(dureePlanMs) ? Math.max(0, dureePlanMs) : 0) / 1000));
  const d = ds.find((x) => x >= voulue);
  return d !== undefined ? { dureeS: d, bornee: false } : { dureeS: ds[ds.length - 1]!, bornee: true };
}

/* ─────────────────────────────── Format ─────────────────────────────────── */

/**
 * Le ratio envoyé à un modèle qui l'exige (Veo) · depuis le format du projet.
 * Veo ne produit qu'en 9:16 ou 16:9 : un projet carré ou en 4:5 est refusé
 * avec la raison, jamais recadré en silence.
 */
export function ratioPourModele(e: Pick<EntreeCatalogueVideo, 'ratios' | 'libelle'>, format: { largeur: number; hauteur: number; libelle: string }):
  { ok: true; ratio: RatioVideo | null } | { ok: false; raison: string } {
  if (e.ratios === null) return { ok: true, ratio: null };
  const r = format.largeur > 0 && format.hauteur > 0 ? format.largeur / format.hauteur : 0;
  const ratio: RatioVideo | null = Math.abs(r - 9 / 16) < 0.01 ? '9:16' : Math.abs(r - 16 / 9) < 0.01 ? '16:9' : null;
  if (ratio && e.ratios.includes(ratio)) return { ok: true, ratio };
  return { ok: false, raison: `${e.libelle} ne produit qu’en ${e.ratios.join(' ou ')} · le format du projet (${format.libelle}) n’est pas couvert. Passe le projet en Vertical · 9:16 ou choisis un autre modèle.` };
}

/* ─────────────────────────────── Voix ───────────────────────────────────── */

/** La langue d'un projet · `brief.langue` (deux lettres), sinon le français, la langue des textes par défaut. */
export function langueDuProjet(contenu: { brief: Record<string, unknown> | null }): string {
  const l = contenu.brief?.langue;
  return typeof l === 'string' && /^[a-z]{2}$/.test(l) ? l : 'fr';
}

const NOMS_LANGUES: Readonly<Record<string, string>> = { fr: 'français', en: 'anglais', zh: 'chinois', es: 'espagnol', de: 'allemand', it: 'italien', pt: 'portugais' };
const nomLangue = (l: string) => NOMS_LANGUES[l] ?? l;

export interface DecisionAudio {
  /** Voix native demandée au modèle (`generate_audio`). */
  audio: boolean;
  /** Pourquoi la voix native est REFUSÉE · le clip part muet, la parole se pose au montage. */
  refus: string | null;
  /** Ce qu'il faut encore vérifier (langue non confirmée). */
  limite: string | null;
}

/**
 * L'audio natif d'un clip. Seule une prise PARLÉE À L'IMAGE (`lipsync`) le
 * demande : la voix off et la musique se posent au montage, le clip part muet
 * (le moins cher). La voix native est REFUSÉE, raison écrite, quand le modèle
 * ne parle pas la langue du projet (Kling et le français) : le clip part
 * muet, jamais une voix dans une autre langue ; une langue non confirmée part,
 * marquée « à valider à l'écoute ».
 */
export function decisionAudioNatif(e: { entree: EntreeCatalogueVideo | null; langue: string; parole: ModeParole }): DecisionAudio {
  if (e.parole !== 'lipsync') return { audio: false, refus: null, limite: null };
  const m = e.entree;
  const suite = 'le clip part muet, la parole se pose au montage';
  if (!m) return { audio: false, refus: `Voix native refusée · le modèle vidéo posé est hors catalogue, sa voix est inconnue · ${suite}.`, limite: null };
  const langue = nomLangue(e.langue);
  if (!m.voix.native || m.voix.statut === 'aucune' || (m.voix.statut === 'confirmee' && !(m.voix.langues ?? []).includes(e.langue))) {
    return { audio: false, refus: `Voix native en ${langue} refusée avec ${m.libelle} · ${m.voix.note} · ${suite}.`, limite: null };
  }
  if (m.voix.statut === 'a_valider_ecoute') return { audio: true, refus: null, limite: `voix native en ${langue} · ${m.voix.note}` };
  return { audio: true, refus: null, limite: null };
}

/**
 * Le modèle rend-il une voix native utilisable dans cette langue ? LA source
 * pour le son et le montage (prise parlée à l'image) · définie par
 * `decisionAudioNatif` (prise parlée), jamais recalculée ailleurs. Vrai pour
 * Veo 3.1 (voix « à valider à l'écoute »), faux pour Kling et hors catalogue.
 */
export function modeleRendLaVoix(entree: EntreeCatalogueVideo | null, langue: string): boolean {
  return decisionAudioNatif({ entree, langue, parole: 'lipsync' }).audio;
}

/* ─────────────────────────────── Tarif ──────────────────────────────────── */

/**
 * Le rapport crédits / dollars d'aujourd'hui, DÉRIVÉ : un clip Kling de 5 s
 * coûte `CREDIT_COSTS.video` crédits (200) pour 5 × 0,07 $ = 0,35 $. Chaque
 * seconde d'un autre modèle se paie au même rapport, arrondi au crédit
 * SUPÉRIEUR (jamais vendue à perte).
 */
const KLING = CATALOGUE_VIDEO[0]!;
export const RAPPORT_CREDITS_VIDEO = {
  credits: CREDIT_COSTS.video,
  usdMicros: KLING.prix[KLING.resolutionDefaut]!.muetUsdMicros * 5,
} as const;

export function creditsPourUsdMicros(usdMicros: number): number {
  return Math.ceil((Math.max(0, usdMicros) * RAPPORT_CREDITS_VIDEO.credits) / RAPPORT_CREDITS_VIDEO.usdMicros);
}

/** Motif de nature du montant d'une ligne au catalogue · prix publié, pas encore rapproché d'une facture. */
export const MOTIF_PRIX_CATALOGUE = `prix catalogue fal relevé le ${DATE_RELEVE_CATALOGUE_VIDEO}, non encore rapproché d’une facture`;
/** Refus d'un modèle Studios hors catalogue · aucun prix, aucun envoi. */
export const MOTIF_HORS_CATALOGUE = 'Modèle vidéo non chiffré au catalogue · ajoute-le au catalogue avec son prix avant de l’utiliser';

/**
 * Factures fal rapprochées, par modèle · VIDE tant que le propriétaire n'a
 * fourni aucune ligne de facture. Une entrée (référence de la facture) fait
 * descendre la réserve de ce modèle au prix catalogue exact.
 */
export const FACTURES_FAL_RAPPROCHEES: Readonly<Partial<Record<IdModeleVideo, string>>> = {};
/** Plancher de réserve d'un clip · l'ancien forfait de main (`FIXED_COSTS.fal_video`). */
export const PLANCHER_RESERVE_CLIP_USD_MICROS = Math.round(FIXED_COSTS.fal_video * 1_000_000);

export interface TarifClip {
  /** Unités facturées · les secondes du clip. */
  unites: number;
  usdMicrosParUnite: number;
  creditsParUnite: number;
  /** Estimation catalogue · prix × durée, ce que le devis affiche. */
  usdMicros: number;
  credits: number;
  /** Ce que la barrière RÉSERVE · jamais sous le plancher sans facture rapprochée. */
  reserveUsdMicros: number;
  motif: string;
}

/** La réserve d'un clip · prix × durée, relevé au plancher tant que le modèle n'a pas de facture rapprochée. */
export function reserveClipUsdMicros(
  m: Pick<EntreeCatalogueVideo, 'id'>, t: Pick<TarifClip, 'usdMicros'>,
  rapprochees: Readonly<Partial<Record<IdModeleVideo, string>>> = FACTURES_FAL_RAPPROCHEES,
): number {
  return rapprochees[m.id] ? t.usdMicros : Math.max(t.usdMicros, PLANCHER_RESERVE_CLIP_USD_MICROS);
}

export type ResultatTarifClip = { ok: true; tarif: TarifClip } | { ok: false; motif: string };

const usdTexte = (micros: number) => `${(micros / 1_000_000).toFixed(2).replace('.', ',')} $`;

/**
 * Le tarif EXACT d'un clip · prix à la seconde du modèle × durée, voix
 * comprise. C'est ce que le devis affiche ET ce que le worker réserve. Une
 * durée, une résolution ou une voix que le modèle n'a pas ⇒ refus : on ne
 * réserve pas un prix qu'on ne sait pas dire.
 */
export function tarifClip(e: { modele: string; dureeS: number; audio: boolean; resolution: ResolutionVideo | null }): ResultatTarifClip {
  const m = entreeCatalogueVideo(e.modele);
  if (!m) return { ok: false, motif: `${MOTIF_HORS_CATALOGUE} (${e.modele})` };
  if (!m.dureesS.includes(e.dureeS)) return { ok: false, motif: `${m.libelle} n’accepte que ${m.dureesS.join(', ')} s · ${e.dureeS} s n’a pas de prix` };
  const resolution = e.resolution ?? m.resolutionDefaut;
  const p = m.prix[resolution];
  if (!p) return { ok: false, motif: `${m.libelle} n’a pas de prix en ${resolution}` };
  const parSeconde = e.audio ? p.audioUsdMicros : p.muetUsdMicros;
  if (parSeconde === null) return { ok: false, motif: `${m.libelle} ne produit pas de voix · aucun prix avec audio` };
  const creditsParUnite = creditsPourUsdMicros(parSeconde);
  const usdMicros = parSeconde * e.dureeS;
  return {
    ok: true,
    tarif: {
      unites: e.dureeS, usdMicrosParUnite: parSeconde, creditsParUnite,
      usdMicros, credits: creditsParUnite * e.dureeS, reserveUsdMicros: reserveClipUsdMicros(m, { usdMicros }),
      motif: `${m.libelle} · ${e.dureeS} s × ${usdTexte(parSeconde)}/s${e.audio ? ' avec voix native' : ' muet'} · ${MOTIF_PRIX_CATALOGUE}`,
    },
  };
}

/* ─────────────────────────────── Corps fal ──────────────────────────────── */

export interface EntreeCorpsVideo {
  famille: FamilleCorpsVideo;
  prompt: string;
  imageUrl: string;
  dureeS: number;
  negatif: string;
  /** Veo seulement. */
  ratio?: RatioVideo | null;
  resolution?: ResolutionVideo | null;
  audio?: boolean;
}

/**
 * Le corps natif fal d'un clip, par famille.
 *  · `kling` · `prompt`, `image_url`, `duration` "5" | "10", `negative_prompt`
 *    (le corps d'avant le catalogue, à l'identique pour 5 s) ;
 *  · `veo` · `duration` "4s" | "6s" | "8s", `aspect_ratio`, `resolution`,
 *    `generate_audio` TOUJOURS explicite (fal le met à vrai par défaut : un
 *    oubli ferait payer la voix), `negative_prompt`.
 */
export function corpsFalVideo(e: EntreeCorpsVideo): Record<string, unknown> {
  if (e.famille === 'kling') {
    return { prompt: e.prompt, image_url: e.imageUrl, duration: String(e.dureeS), negative_prompt: e.negatif };
  }
  return {
    prompt: e.prompt, image_url: e.imageUrl, duration: `${e.dureeS}s`,
    aspect_ratio: e.ratio ?? '9:16', resolution: e.resolution ?? '720p', generate_audio: e.audio === true,
    negative_prompt: e.negatif,
  };
}
