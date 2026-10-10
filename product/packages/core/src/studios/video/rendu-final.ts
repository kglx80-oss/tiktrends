/**
 * Studios · vidéo finale d'un projet · ASSEMBLAGE des clips animés des plans.
 *
 * Pur. Décide si une vidéo finale peut être assemblée MAINTENANT et avec quoi :
 * chaque plan, dans l'ordre du montage, apporte son clip animé encore valide
 * (sortie produite pour cette version), tenu à la durée du plan ; la musique
 * choisie s'ajoute à son gain ; le format est celui du projet.
 *
 * Ce qui n'est PAS fait, et le dit (jamais simulé) :
 *  · la voix (aucun fournisseur de voix branché) · la narration n'est pas dite ;
 *  · le texte écran et les sous-titres ne sont pas incrustés.
 * Chaque absence est listée dans `nonInclus`, affichée avant le clic.
 *
 * L'assemblage est un CALCUL (ffmpeg sur le serveur, aucun fournisseur payant) :
 * 0 crédit, 0 $. La vérification du fichier produit (décodage, dimensions,
 * durée) est faite par l'appelant, jamais supposée.
 */

import type { ContenuVersion, FpsRationnel } from '../document';
import { dureePlanMs } from './plans';
import { formatVideo } from './consigne-plan';

/** Bornes · une publicité courte. Au-delà, l'assemblage synchrone n'est pas proposé. */
export const PLANS_RENDU_MAX = 12;
export const DUREE_RENDU_MAX_MS = 90_000;
/** Durée minimale d'un plan dans l'assemblage (une demi-seconde). */
export const DUREE_PLAN_RENDU_MIN_MS = 500;
/** Gain de musique accepté (la timeline borne déjà à 24 dB). */
export const GAIN_MUSIQUE_RENDU_MIN_DB = -60;
export const GAIN_MUSIQUE_RENDU_MAX_DB = 12;

export interface SegmentRendu { shotId: string; rang: number; assetId: string; dureeMs: number }

export interface PlanRenduFinal {
  segments: SegmentRendu[];
  largeur: number;
  hauteur: number;
  fps: FpsRationnel;
  dureeMs: number;
  musique: { assetId: string; gainDb: number } | null;
  /** Ce que cette vidéo ne contient pas, en clair · affiché avant le clic. */
  nonInclus: string[];
}

export type ResultatPlanRendu =
  | { ok: true; plan: PlanRenduFinal }
  | { ok: false; violations: Array<{ cible: string; raison: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function planRenduFinal(e: {
  contenu: Pick<ContenuVersion, 'shots' | 'timeline' | 'brief'>;
  /** Le clip animé VALIDE de chaque plan pour cette version (identifiant de média), absent sinon. */
  clips: Readonly<Record<string, string | undefined>>;
  /** La musique de la timeline, relue : `null` si aucune choisie, `'introuvable'` si choisie mais illisible. */
  musique: { assetId: string; gainDb: number } | null | 'introuvable';
}): ResultatPlanRendu {
  const v: Array<{ cible: string; raison: string }> = [];
  const c = e.contenu;
  const t = c.timeline;
  if (!t) return { ok: false, violations: [{ cible: 'timeline', raison: 'Aucun montage · construis d’abord le storyboard.' }] };
  if (!t.fps || !Number.isSafeInteger(t.fps.num) || !Number.isSafeInteger(t.fps.den) || t.fps.num <= 0 || t.fps.den <= 0) {
    v.push({ cible: 'timeline', raison: 'Débit d’images du montage invalide.' });
  }
  const format = formatVideo(c);
  if (format.largeur % 2 || format.hauteur % 2) v.push({ cible: 'format', raison: `Format ${format.largeur}×${format.hauteur} · des dimensions paires sont requises.` });

  const plans = c.shots.order.filter((sid) => c.shots.byId[sid]);
  if (plans.length === 0) v.push({ cible: 'plans', raison: 'Aucun plan dans le montage.' });
  if (plans.length > PLANS_RENDU_MAX) v.push({ cible: 'plans', raison: `${plans.length} plans · l’assemblage en accepte ${PLANS_RENDU_MAX} au plus.` });

  const segments: SegmentRendu[] = [];
  const parle: number[] = [];
  const texte: number[] = [];
  plans.forEach((sid, i) => {
    const p = c.shots.byId[sid]!;
    const rang = i + 1;
    const clip = e.clips[sid];
    if (!clip || !UUID.test(clip)) v.push({ cible: sid, raison: `Le plan ${rang} n’a pas de clip animé valide pour cette version · anime-le avant d’assembler.` });
    const duree = Math.round(dureePlanMs(p));
    if (!Number.isFinite(duree) || duree < DUREE_PLAN_RENDU_MIN_MS) v.push({ cible: sid, raison: `Le plan ${rang} dure moins d’une demi-seconde.` });
    if (clip && UUID.test(clip)) segments.push({ shotId: sid, rang, assetId: clip, dureeMs: duree });
    if (p.speechMode !== 'none' && p.narration.trim()) parle.push(rang);
    if (p.onScreenText.some((x) => x.trim())) texte.push(rang);
  });
  const dureeMs = segments.reduce((s, x) => s + x.dureeMs, 0);
  if (dureeMs > DUREE_RENDU_MAX_MS) v.push({ cible: 'timeline', raison: `Durée totale ${Math.round(dureeMs / 1000)} s · l’assemblage s’arrête à ${DUREE_RENDU_MAX_MS / 1000} s.` });

  let musique: PlanRenduFinal['musique'] = null;
  if (e.musique === 'introuvable') v.push({ cible: 'musique', raison: 'La musique choisie est introuvable · choisis-en une autre ou retire-la.' });
  else if (e.musique) {
    if (!UUID.test(e.musique.assetId)) v.push({ cible: 'musique', raison: 'Musique illisible.' });
    musique = { assetId: e.musique.assetId, gainDb: Math.min(GAIN_MUSIQUE_RENDU_MAX_DB, Math.max(GAIN_MUSIQUE_RENDU_MIN_DB, e.musique.gainDb)) };
  }
  if (v.length) return { ok: false, violations: v };

  const nonInclus: string[] = [];
  const liste = (rangs: number[]) => rangs.map((r) => `plan ${r}`).join(', ');
  if (parle.length) nonInclus.push(`Voix · aucun fournisseur de voix n’est branché, la narration n’est pas dite (${liste(parle)}).`);
  if (texte.length) nonInclus.push(`Texte écran · non incrusté (${liste(texte)}).`);
  if (t.subtitles.enabled && parle.length) nonInclus.push('Sous-titres · non incrustés.');
  if (!musique) nonInclus.push('Musique · aucune choisie, bande son silencieuse.');

  return {
    ok: true,
    plan: { segments, largeur: format.largeur, hauteur: format.hauteur, fps: { num: t.fps.num, den: t.fps.den }, dureeMs, musique, nonInclus },
  };
}
