/**
 * Studios · vidéo finale d'un projet · ASSEMBLAGE des clips animés des plans.
 *
 * Pur. Décide si une vidéo finale peut être assemblée MAINTENANT et avec quoi :
 * chaque plan, dans l'ordre du montage, apporte son clip animé encore valide
 * (sortie produite pour cette version), tenu à la durée du plan ; la musique
 * choisie s'ajoute à son gain ; le format est celui du projet.
 *
 * Le son des prises est gardé au montage (voix, lèvres et son du lieu naissent
 * dans la prise, `prise-parlee.ts`). Ce qui n'est PAS fait, et le dit (jamais
 * simulé) :
 *  · la voix d'un plan parlé dont la prise livrée est MUETTE · avant le clic,
 *    on ne sait pas encore : c'est dit comme tel ; après l'assemblage, la
 *    mesure du fichier (`sonDesSegments`) tranche, plan par plan
 *    (`nonInclusDuRendu`) ;
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
import { estPriseParlee } from './prise-parlee';

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
  /** Ce que cette vidéo ne contient pas, en clair · affiché avant le clic (son des prises encore inconnu). */
  nonInclus: string[];
  /** Rangs des plans à prise parlée (mode voix off ou lipsync, narration présente). */
  parles: number[];
  /** Rangs des plans qui portent un texte écran. */
  textes: number[];
  sousTitres: boolean;
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
    if (estPriseParlee(p)) parle.push(rang);
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

  const plan = { segments, largeur: format.largeur, hauteur: format.hauteur, fps: { num: t.fps.num, den: t.fps.den }, dureeMs, musique, parles: parle, textes: texte, sousTitres: t.subtitles.enabled };
  return { ok: true, plan: { ...plan, nonInclus: nonInclusDuRendu(plan) } };
}

/**
 * Ce que la vidéo finale n'inclut pas · `son` est la mesure du fichier
 * assemblé, segment par segment (`sonDesSegments` de l'assembleur) ; sans
 * elle (avant le clic), le son des prises est inconnu et dit comme tel.
 */
export function nonInclusDuRendu(p: Pick<PlanRenduFinal, 'segments' | 'musique' | 'parles' | 'textes' | 'sousTitres'>, son?: ReadonlyArray<boolean>): string[] {
  const out: string[] = [];
  const liste = (rangs: number[]) => rangs.map((r) => `plan ${r}`).join(', ');
  const mesure = !!son && son.length === p.segments.length;
  const sonDu = (rang: number) => mesure && son![p.segments.findIndex((x) => x.rang === rang)] === true;
  if (p.parles.length) {
    if (!mesure) out.push(`Voix · non vérifiée · à l’assemblage, seule la présence de son dans la prise est contrôlée, pas les mots dits (${liste(p.parles)}).`);
    else {
      const muettes = p.parles.filter((r) => !sonDu(r));
      const sonores = p.parles.filter((r) => sonDu(r));
      if (muettes.length) out.push(`Voix · prise muette, la narration n’est pas dite (${liste(muettes)}).`);
      // Du son n'est pas la réplique · la vérification des mots dits viendra du contrôle de la parole.
      if (sonores.length) out.push(`Voix · son présent dans la prise, réplique non vérifiée (${liste(sonores)}).`);
    }
  }
  if (p.textes.length) out.push(`Texte écran · non incrusté (${liste(p.textes)}).`);
  if (p.sousTitres && p.parles.length) out.push('Sous-titres · non incrustés.');
  if (!p.musique) {
    out.push(!mesure
      ? 'Musique · aucune choisie, la bande son sera le son des prises, un silence si elles sont muettes.'
      : son!.some(Boolean) ? 'Musique · aucune choisie, la bande son est le son des prises.' : 'Musique · aucune choisie, bande son silencieuse.');
  }
  return out;
}
