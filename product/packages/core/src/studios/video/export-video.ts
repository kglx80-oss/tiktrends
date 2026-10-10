/**
 * Studios · L7-B · préflight de l'EXPORT vidéo (cahier 01 · validation export).
 *
 * Pur. Avant tout montage, la timeline dit si une vidéo exportable existe :
 *  · médias présents ET décodés (le décodage réel du worker, jamais un en-tête) ;
 *  · durée totale = somme des segments en ticks entiers (`TIMEBASE_VIDEO`), écart ≤ UNE image
 *    au débit RATIONNEL de la timeline (aucun flottant) ; montage continu ;
 *  · chaque plan a son segment et son clip, assez long ;
 *  · voix, sous-titres, texte écran requis mais absents ⇒ violation CIBLÉE
 *    (le plan nommé) ; voix ou lipsync sans fournisseur ⇒ BLOQUÉ, jamais
 *    simulé ;
 *  · paramètres d'encodage MP4 H.264/AAC issus de la capacité SONDÉE du
 *    worker : sans libx264 ou sans aac constatés, aucun export H.264 n'est
 *    annoncé.
 *
 * Le rendu final (montage ffmpeg réel des clips, voix, musique, surimpressions)
 * n'est PAS branché dans ce lot : `RENDU_VIDEO_FINAL` le dit, et le préflight
 * ne prétend jamais qu'un fichier a été produit.
 */

import type { ContenuVersion, FpsRationnel } from '../document';
import type { CapaciteVideo } from '../execution/media';
import { dureePlanMs } from './plans';
import { PISTES_VIDEO } from './timeline';
import { formatVideo } from './consigne-plan';

/** Ce que le serveur sait d'un média de la timeline (relu en base, décodé au worker). */
export interface MediaExport {
  /** Décodé EN ENTIER par le worker (`completed` après `verdictDecodage`). */
  decode: boolean;
  /** Durée décodée en ticks de `TIMEBASE_VIDEO` · `null` si inconnue. */
  dureeTicks?: number | null;
  /** Crête audio ≥ 0 dBFS mesurée au décodage. */
  audioSature?: boolean;
}

export interface EntreePreflightExport {
  contenu: Pick<ContenuVersion, 'shots' | 'timeline' | 'brief'>;
  medias: Readonly<Record<string, MediaExport>>;
  capacite: CapaciteVideo;
  /** Fournisseurs branchés · aucun aujourd'hui pour l'animation, la voix et le lipsync. */
  fournisseurs: { animation: boolean; voix: boolean; lipsync: boolean };
  /** Format de sortie · défaut : celui du brief (`formatVideo`). */
  format?: { largeur: number; hauteur: number };
}

export type CodeViolationExport =
  | 'timeline_absente' | 'fps_invalide' | 'dimensions_impaires'
  | 'duree_incoherente' | 'montage_discontinu' | 'plan_sans_segment'
  | 'plan_sans_clip' | 'clip_absent' | 'clip_non_decode' | 'clip_trop_court'
  | 'voix_absente' | 'voix_indisponible' | 'lipsync_indisponible'
  | 'sous_titres_absents' | 'texte_ecran_absent' | 'musique_absente' | 'audio_sature'
  | 'capacite_video_absente' | 'encodeur_h264_absent';

export interface ViolationExportVideo {
  code: CodeViolationExport;
  /** Le plan, l'élément ou le média visé · `timeline` / `worker` sinon. */
  cible: string;
  raison: string;
  /** `a_corriger` · l'utilisateur peut y remédier ; `bloque` · l'infrastructure ne le permet pas. */
  nature: 'a_corriger' | 'bloque';
}

export interface ParametresEncodageMp4 {
  conteneur: 'mp4';
  video: { codec: 'libx264'; profil: 'high'; pixFmt: 'yuv420p'; largeur: number; hauteur: number; fps: FpsRationnel };
  audio: { codec: 'aac'; frequenceHz: 48_000; canaux: 2 };
  /** `moov` en tête de fichier · lecture progressive. */
  faststart: true;
}

export interface PreflightExportVideo {
  statut: 'pret' | 'a_corriger' | 'bloque';
  violations: ViolationExportVideo[];
  dureeTicks: number;
  /** Nombre d'images à `fps` (division entière). */
  images: number;
  parametres: ParametresEncodageMp4 | null;
  rendu: typeof RENDU_VIDEO_FINAL;
}

/** Le montage final n'est pas branché (L7-B) · dit, jamais simulé. */
export const RENDU_VIDEO_FINAL = {
  disponible: false,
  raison: 'Le montage final (assemblage ffmpeg des clips, voix, musique et surimpressions) n’est pas encore branché au worker · aucun fichier vidéo n’est produit ni facturé.',
} as const;

/** |a − b| ≤ une image au débit `fps`, en entiers : |a − b| × num ≤ timebase × den. */
export function dansUneImage(a: number, b: number, timebase: number, fps: FpsRationnel): boolean {
  return BigInt(Math.abs(a - b)) * BigInt(fps.num) <= BigInt(timebase) * BigInt(fps.den);
}

const fpsValide = (f: FpsRationnel | undefined): f is FpsRationnel =>
  !!f && Number.isSafeInteger(f.num) && Number.isSafeInteger(f.den) && f.num > 0 && f.den > 0;

/** Paramètres MP4 H.264/AAC · `null` sans décodage prouvé, sans libx264 ou sans aac constatés. */
export function parametresEncodageMp4(capacite: CapaciteVideo, format: { largeur: number; hauteur: number }, fps: FpsRationnel): ParametresEncodageMp4 | null {
  if (!capacite.decodage || !capacite.encodeurs.libx264 || !capacite.encodeurs.aac) return null;
  return {
    conteneur: 'mp4',
    video: { codec: 'libx264', profil: 'high', pixFmt: 'yuv420p', largeur: format.largeur, hauteur: format.hauteur, fps: { num: fps.num, den: fps.den } },
    audio: { codec: 'aac', frequenceHz: 48_000, canaux: 2 },
    faststart: true,
  };
}

export function preflightExportVideo(e: EntreePreflightExport): PreflightExportVideo {
  const v: ViolationExportVideo[] = [];
  const a = (code: CodeViolationExport, cible: string, raison: string, nature: ViolationExportVideo['nature'] = 'a_corriger') => v.push({ code, cible, raison, nature });
  const c = e.contenu;
  const format = e.format ?? formatVideo(c);
  const t = c.timeline;

  // Capacité du worker · d'abord, elle vaut pour tout le reste.
  if (!e.capacite.decodage) a('capacite_video_absente', 'worker', `Le worker ne sait pas vérifier une vidéo · ${e.capacite.raison || 'aucune preuve de décodage'}.`, 'bloque');
  else if (!e.capacite.encodeurs.libx264 || !e.capacite.encodeurs.aac) {
    const manque = [!e.capacite.encodeurs.libx264 && 'libx264', !e.capacite.encodeurs.aac && 'aac'].filter(Boolean).join(', ');
    a('encodeur_h264_absent', 'worker', `Encodeur absent du worker (${manque}) · aucun export MP4 H.264/AAC n’est proposé.`, 'bloque');
  }
  if (format.largeur % 2 !== 0 || format.hauteur % 2 !== 0) a('dimensions_impaires', 'format', `Format ${format.largeur}×${format.hauteur} · H.264 en 4:2:0 exige des dimensions paires.`);

  if (!t) {
    a('timeline_absente', 'timeline', 'Aucune timeline · reconstruis le montage depuis les plans.');
    return conclure(v, 0, 0, null);
  }
  if (!fpsValide(t.fps)) {
    a('fps_invalide', 'timeline', 'Débit d’images invalide · numérateur et dénominateur entiers positifs attendus.');
    return conclure(v, t.durationTicks, 0, null);
  }
  const tb = t.timebase;
  const ms = (x: number) => (x * tb) / 1000;
  const unite = (d: number) => `${(d / tb).toFixed(3).replace('.', ',')} s`;

  // Montage · segments vidéo continus, somme = durée annoncée = durée des plans.
  const items = Object.values(t.tracks[PISTES_VIDEO.video]?.items ?? {}).sort((x, y) => x.startTicks - y.startTicks);
  let somme = 0;
  let fin = 0;
  for (const it of items) {
    const d = it.outTicks - it.inTicks;
    if (!dansUneImage(it.startTicks, fin, tb, t.fps)) a('montage_discontinu', it.id, `Le segment ${it.id} commence à ${unite(it.startTicks)}, le précédent finit à ${unite(fin)} · trou ou chevauchement de plus d’une image.`);
    somme += d;
    fin = it.startTicks + d;
  }
  if (!dansUneImage(somme, t.durationTicks, tb, t.fps)) a('duree_incoherente', 'timeline', `Durée annoncée ${unite(t.durationTicks)}, somme des segments ${unite(somme)} · écart de plus d’une image.`);
  const plans = c.shots.order.filter((sid) => c.shots.byId[sid]);
  const dureePlans = plans.reduce((s, sid) => s + ms(dureePlanMs(c.shots.byId[sid]!)), 0);
  if (!dansUneImage(somme, dureePlans, tb, t.fps)) a('duree_incoherente', 'plans', `Somme des plans ${unite(dureePlans)}, montage ${unite(somme)} · reconstruis la timeline.`);

  const surPiste = (piste: string, sid: string) => Object.values(t.tracks[piste]?.items ?? {}).find((x) => x.source.shotId === sid);
  const media = (id: string | null | undefined) => (id ? e.medias[id] : undefined);

  plans.forEach((sid, rang) => {
    const p = c.shots.byId[sid]!;
    const nom = `plan ${rang + 1}`;
    const seg = surPiste(PISTES_VIDEO.video, sid);
    if (!seg) a('plan_sans_segment', sid, `Le ${nom} n’a aucun segment dans le montage.`);

    // Clip du plan.
    if (!p.clipAssetId) {
      if (e.fournisseurs.animation && e.capacite.decodage) a('plan_sans_clip', sid, `Le ${nom} n’a pas de clip · anime-le avant d’exporter.`);
      else a('plan_sans_clip', sid, `Le ${nom} n’a pas de clip, et aucune animation n’est disponible sur ce serveur.`, 'bloque');
    } else {
      const m = media(p.clipAssetId);
      if (!m) a('clip_absent', sid, `Le clip du ${nom} est introuvable dans les médias de la marque.`);
      else if (!m.decode) a('clip_non_decode', sid, `Le clip du ${nom} n’a pas été décodé en entier · il ne peut pas entrer dans un export.`);
      else {
        if (seg && typeof m.dureeTicks === 'number' && m.dureeTicks < seg.outTicks && !dansUneImage(m.dureeTicks, seg.outTicks, tb, t.fps)) {
          a('clip_trop_court', sid, `Le clip du ${nom} dure ${unite(m.dureeTicks)}, le montage en demande ${unite(seg.outTicks)}.`);
        }
        if (m.audioSature) a('audio_sature', sid, `Le son du clip du ${nom} sature (crête ≥ 0 dBFS).`);
      }
    }

    // Voix · lipsync jamais simulé.
    const parle = p.speechMode !== 'none' && p.narration.trim().length > 0;
    if (parle && p.speechMode === 'lipsync' && !e.fournisseurs.lipsync) {
      a('lipsync_indisponible', sid, `Le ${nom} demande une parole synchronisée · aucun fournisseur de lipsync n’est branché, rien n’est simulé.`, 'bloque');
    } else if (parle) {
      const m = media(p.voiceAssetId);
      if (!p.voiceAssetId || !m) {
        if (e.fournisseurs.voix) a('voix_absente', sid, `Le ${nom} est parlé mais n’a pas de prise de voix.`);
        else a('voix_indisponible', sid, `Le ${nom} est parlé · aucun fournisseur de voix n’est branché, rien n’est simulé.`, 'bloque');
      } else if (!m.decode) a('voix_absente', sid, `La prise de voix du ${nom} n’a pas été décodée en entier.`);
      else if (m.audioSature) a('audio_sature', sid, `La voix du ${nom} sature (crête ≥ 0 dBFS).`);
    }

    // Sous-titres et texte écran posés par la timeline.
    if (t.subtitles.enabled && p.narration.trim() && !surPiste(PISTES_VIDEO.sousTitres, sid)) a('sous_titres_absents', sid, `Les sous-titres du ${nom} manquent au montage.`);
    if (p.onScreenText.length > 0 && !surPiste(PISTES_VIDEO.texte, sid)) a('texte_ecran_absent', sid, `Le texte écran du ${nom} manque au montage.`);
  });

  if (t.music) {
    const m = media(t.music.assetId);
    if (!m || !m.decode) a('musique_absente', t.music.assetId, 'La musique choisie est introuvable ou n’a pas été décodée.');
    else if (m.audioSature) a('audio_sature', t.music.assetId, 'La musique sature (crête ≥ 0 dBFS).');
  }

  const images = Number((BigInt(somme) * BigInt(t.fps.num)) / (BigInt(tb) * BigInt(t.fps.den)));
  return conclure(v, somme, images, parametresEncodageMp4(e.capacite, format, t.fps));
}

function conclure(v: ViolationExportVideo[], dureeTicks: number, images: number, parametres: ParametresEncodageMp4 | null): PreflightExportVideo {
  const statut = v.some((x) => x.nature === 'bloque') ? 'bloque' : v.length ? 'a_corriger' : 'pret';
  return { statut, violations: v, dureeTicks, images, parametres, rendu: RENDU_VIDEO_FINAL };
}
