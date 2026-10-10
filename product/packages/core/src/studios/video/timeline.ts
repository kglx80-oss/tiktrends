/**
 * Studios · L6-A · la timeline d'une vidéo, DÉRIVÉE des plans (cahier 01 §11.2).
 *
 * Pur. La timeline se recale à chaque geste : l'ordre des plans et leurs
 * durées décident des positions, en unités ENTIÈRES (microsecondes,
 * `TIMEBASE_VIDEO`), fps rationnel conservé. Aucun flottant pour le temps.
 *
 * Pistes posées par ce module (identifiants stables) :
 *  · `t_video`       · un segment par plan (source : le plan) ;
 *  · `t_voix`        · un segment par plan parlé (source : le plan, sa voix) ;
 *  · `t_texte`       · le texte écran d'un plan qui en porte (surimpression) ;
 *  · `t_sous_titres` · la narration validée d'un plan, si les sous-titres
 *                      sont activés.
 * La musique ne vit PAS dans les pistes : `timeline.music` (piste et gain)
 * n'entre que dans le mix (graphe L1) · changer la musique ne touche ni le
 * montage, ni la voix, ni une image. Les autres pistes éventuelles sont
 * conservées telles quelles.
 */

import type { ContenuVersion, ElementTimeline, PisteTimeline, TimelineStudio } from '../document';
import { dureePlanMs } from './plans';

/** Microsecondes · 1 000 000 ticks par seconde. */
export const TIMEBASE_VIDEO = 1_000_000;
export const FPS_DEFAUT = { num: 30, den: 1 } as const;
export const PISTES_VIDEO = { video: 't_video', voix: 't_voix', texte: 't_texte', sousTitres: 't_sous_titres' } as const;
const PISTES_POSEES = new Set<string>(Object.values(PISTES_VIDEO));
const MS = TIMEBASE_VIDEO / 1000;

export interface SegmentPlan { shotId: string; rang: number; debutMs: number; dureeMs: number; finMs: number }

/** Les segments des plans, dans l'ORDRE du montage. */
export function segmentsPlans(c: Pick<ContenuVersion, 'shots'>): SegmentPlan[] {
  const out: SegmentPlan[] = [];
  let t = 0;
  c.shots.order.forEach((sid, rang) => {
    const p = c.shots.byId[sid];
    if (!p) return;
    const d = dureePlanMs(p);
    out.push({ shotId: sid, rang, debutMs: t, dureeMs: d, finMs: t + d });
    t += d;
  });
  return out;
}

export function dureeTotaleMs(c: Pick<ContenuVersion, 'shots'>): number {
  const s = segmentsPlans(c);
  return s.length ? s[s.length - 1]!.finMs : 0;
}

const piste = (id: string, kind: PisteTimeline['kind'], z: number, items: Record<string, ElementTimeline>, avant?: PisteTimeline): PisteTimeline =>
  ({ id, kind, z: avant?.z ?? z, muted: avant?.muted ?? false, gainDb: avant?.gainDb ?? 0, items });

/**
 * La timeline des plans · fps, voix, musique et réglage des sous-titres repris
 * de `base` (ou les défauts pour une première timeline : 30 i/s, aucune voix
 * choisie, aucune musique, sous-titres actifs).
 */
export function timelineDesPlans(c: Pick<ContenuVersion, 'shots'>, base: TimelineStudio | null): TimelineStudio {
  const segs = segmentsPlans(c);
  const sousTitres = base?.subtitles.enabled ?? true;
  const video: Record<string, ElementTimeline> = {};
  const voix: Record<string, ElementTimeline> = {};
  const texte: Record<string, ElementTimeline> = {};
  const st: Record<string, ElementTimeline> = {};
  for (const s of segs) {
    const p = c.shots.byId[s.shotId]!;
    const pose = { startTicks: s.debutMs * MS, inTicks: 0, outTicks: s.dureeMs * MS };
    video[`v_${s.shotId}`] = { id: `v_${s.shotId}`, source: { shotId: s.shotId }, ...pose };
    if (p.speechMode !== 'none' && p.narration.trim()) voix[`a_${s.shotId}`] = { id: `a_${s.shotId}`, source: { shotId: s.shotId }, ...pose };
    if (p.onScreenText.length) texte[`x_${s.shotId}`] = { id: `x_${s.shotId}`, source: { shotId: s.shotId }, ...pose };
    if (sousTitres && p.narration.trim()) st[`st_${s.shotId}`] = { id: `st_${s.shotId}`, source: { shotId: s.shotId }, ...pose };
  }
  const tracks: Record<string, PisteTimeline> = {};
  for (const [id, p] of Object.entries(base?.tracks ?? {})) if (!PISTES_POSEES.has(id)) tracks[id] = p;
  const b = base?.tracks ?? {};
  tracks[PISTES_VIDEO.video] = piste(PISTES_VIDEO.video, 'video', 0, video, b[PISTES_VIDEO.video]);
  tracks[PISTES_VIDEO.voix] = piste(PISTES_VIDEO.voix, 'audio', 1, voix, b[PISTES_VIDEO.voix]);
  // Sans texte : aucune piste de surimpression ni de sous-titres n'est posée.
  if (Object.keys(texte).length) tracks[PISTES_VIDEO.texte] = piste(PISTES_VIDEO.texte, 'overlay', 10, texte, b[PISTES_VIDEO.texte]);
  if (Object.keys(st).length) tracks[PISTES_VIDEO.sousTitres] = piste(PISTES_VIDEO.sousTitres, 'subtitle', 20, st, b[PISTES_VIDEO.sousTitres]);
  return {
    timebase: base?.timebase === TIMEBASE_VIDEO ? base.timebase : TIMEBASE_VIDEO,
    fps: base ? { ...base.fps } : { ...FPS_DEFAUT },
    durationTicks: (segs.length ? segs[segs.length - 1]!.finMs : 0) * MS,
    tracks,
    voice: base?.voice ? { ...base.voice } : null,
    music: base?.music ? { ...base.music } : null,
    subtitles: { enabled: sousTitres },
  };
}

/** Les surimpressions qu'un rendu poserait · vide quand la vidéo est sans texte. */
export function surimpressions(t: TimelineStudio | null): string[] {
  if (!t) return [];
  return Object.values(t.tracks).filter((p) => p.kind === 'overlay' || p.kind === 'subtitle').flatMap((p) => Object.keys(p.items));
}
