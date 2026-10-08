import { describe, it, expect } from 'vitest';
import {
  preflightExportVideo, parametresEncodageMp4, dansUneImage, timelineDesPlans, TIMEBASE_VIDEO, PISTES_VIDEO, RENDU_VIDEO_FINAL,
  type EntreePreflightExport, type MediaExport,
} from '../src/studios/video';
import { capaciteVideo, type CapaciteVideo } from '../src/studios/execution/media';
import type { ContenuVersion, PlanStudio } from '../src/studios/document';

/**
 * L7-B · préflight de l'export vidéo · lu sur le RÉSULTAT : statut,
 * violations ciblées (code + plan), paramètres d'encodage, durée en ticks.
 */

const T = new Date('2026-10-08T10:00:00Z');
const CAP: CapaciteVideo = capaciteVideo({
  version: 1, sondeLe: T.toISOString(), workerId: 'w', ffmpeg: 'ffmpeg version 6.1.1',
  decodage: { ok: true, raison: 'ok', dureeMs: 480 }, encodeurs: { libx264: true, aac: true },
}, T);
const FOURNIS = { animation: true, voix: true, lipsync: true };

const plan = (shotId: string, o: Partial<PlanStudio> = {}): PlanStudio => ({
  shotId, purpose: 'Accroche', subject: 'Léa', action: 'sourit', framing: 'plan rapproché', camera: 'fixe', lighting: 'jour', environment: 'salle de bain',
  referenceIds: [], narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 2000, clipAssetId: `clip_${shotId}`, ...o,
});

/** Deux plans de 2 s et 1,5 s, sans voix ni texte, clips décodés et assez longs. */
function video(plans: PlanStudio[] = [plan('s1'), plan('s2', { estimatedDurationMs: 1500 })]): ContenuVersion {
  const shots = { order: plans.map((p) => p.shotId), byId: Object.fromEntries(plans.map((p) => [p.shotId, p])) };
  return { brief: { formats: ['9:16'] }, productRef: null, styleRef: null, characterRefs: {}, shots, document: null, timeline: timelineDesPlans({ shots }, null) };
}
const medias = (c: ContenuVersion, o: Partial<MediaExport> = {}): Record<string, MediaExport> =>
  Object.fromEntries(Object.values(c.shots.byId).flatMap((p) => [
    ...(p.clipAssetId ? [[p.clipAssetId, { decode: true, dureeTicks: 5 * TIMEBASE_VIDEO, ...o }]] : []),
    ...(p.voiceAssetId ? [[p.voiceAssetId, { decode: true, dureeTicks: 5 * TIMEBASE_VIDEO }]] : []),
  ]));
const entree = (c: ContenuVersion, o: Partial<EntreePreflightExport> = {}): EntreePreflightExport => ({ contenu: c, medias: medias(c), capacite: CAP, fournisseurs: FOURNIS, ...o });
const codes = (r: ReturnType<typeof preflightExportVideo>) => r.violations.map((v) => `${v.code}@${v.cible}:${v.nature}`);

describe('cas nominal · prêt, paramètres MP4 H.264/AAC issus de la capacité sondée', () => {
  it('deux plans complets ⇒ prêt, 3,5 s = 105 images à 30 i/s, encodage annoncé', () => {
    const r = preflightExportVideo(entree(video()));
    expect(codes(r)).toEqual([]);
    expect(r.statut).toBe('pret');
    expect([r.dureeTicks, r.images]).toEqual([3_500_000, 105]);
    expect(r.parametres).toEqual({
      conteneur: 'mp4', video: { codec: 'libx264', profil: 'high', pixFmt: 'yuv420p', largeur: 1080, hauteur: 1920, fps: { num: 30, den: 1 } },
      audio: { codec: 'aac', frequenceHz: 48_000, canaux: 2 }, faststart: true,
    });
    expect(r.rendu).toEqual(RENDU_VIDEO_FINAL);
    expect(r.rendu.disponible).toBe(false);
  });
});

describe('capacité · jamais d’export H.264 annoncé sans encodeur constaté', () => {
  it('sans libx264 ⇒ bloqué, aucun paramètre', () => {
    const r = preflightExportVideo(entree(video(), { capacite: { ...CAP, encodeurs: { libx264: false, aac: true } } }));
    expect(r.statut).toBe('bloque');
    expect(codes(r)).toEqual(['encodeur_h264_absent@worker:bloque']);
    expect(r.violations[0]!.raison).toBe('Encodeur absent du worker (libx264) · aucun export MP4 H.264/AAC n’est proposé.');
    expect(r.parametres).toBeNull();
    expect(parametresEncodageMp4({ ...CAP, encodeurs: { libx264: true, aac: false } }, { largeur: 2, hauteur: 2 }, { num: 30, den: 1 })).toBeNull();
  });
  it('sans sonde fraîche ⇒ bloqué, raison de la capacité reprise', () => {
    const r = preflightExportVideo(entree(video(), { capacite: capaciteVideo(null, T) }));
    expect(codes(r)).toEqual(['capacite_video_absente@worker:bloque']);
    expect(r.violations[0]!.raison).toBe('Le worker ne sait pas vérifier une vidéo · aucune sonde vidéo publiée par le worker.');
    expect(r.parametres).toBeNull();
  });
});

describe('durée · somme en ticks, écart ≤ une image au débit rationnel', () => {
  it('une image près, pas plus · 29,97 i/s (30000/1001)', () => {
    const fps = { num: 30000, den: 1001 };
    const image = Math.floor((TIMEBASE_VIDEO * 1001) / 30000); // 33 366 µs
    expect(dansUneImage(0, image, TIMEBASE_VIDEO, fps)).toBe(true);
    expect(dansUneImage(0, image + 1, TIMEBASE_VIDEO, fps)).toBe(false);
  });
  it('durée annoncée décalée de plus d’une image ⇒ violation ciblée sur la timeline', () => {
    const c = video();
    const juste = preflightExportVideo(entree({ ...c, timeline: { ...c.timeline!, durationTicks: c.timeline!.durationTicks + 33_333 } }));
    expect(codes(juste)).toEqual([]);
    const r = preflightExportVideo(entree({ ...c, timeline: { ...c.timeline!, durationTicks: c.timeline!.durationTicks + 33_334 } }));
    expect(codes(r)).toEqual(['duree_incoherente@timeline:a_corriger']);
    expect(r.violations[0]!.raison).toBe('Durée annoncée 3,533 s, somme des segments 3,500 s · écart de plus d’une image.');
  });
  it('un trou dans le montage ⇒ segment visé', () => {
    const c = video();
    const t = c.timeline!;
    const v = t.tracks[PISTES_VIDEO.video]!;
    const decale = { ...v, items: { ...v.items, v_s2: { ...v.items.v_s2!, startTicks: v.items.v_s2!.startTicks + 100_000 } } };
    const r = preflightExportVideo(entree({ ...c, timeline: { ...t, tracks: { ...t.tracks, [PISTES_VIDEO.video]: decale } } }));
    expect(codes(r)).toEqual(['montage_discontinu@v_s2:a_corriger']);
  });
  it('fps invalide ⇒ refus net', () => {
    const c = video();
    expect(codes(preflightExportVideo(entree({ ...c, timeline: { ...c.timeline!, fps: { num: 0, den: 1 } } })))).toEqual(['fps_invalide@timeline:a_corriger']);
  });
  it('aucune timeline ⇒ violation, statut à corriger', () => {
    const r = preflightExportVideo(entree({ ...video(), timeline: null }));
    expect([r.statut, codes(r)]).toEqual(['a_corriger', ['timeline_absente@timeline:a_corriger']]);
  });
});

describe('médias · présents, décodés, assez longs · violations ciblées par plan', () => {
  it('plan sans clip et aucune animation disponible ⇒ bloqué sur CE plan', () => {
    const c = video([plan('s1'), plan('s2', { clipAssetId: null })]);
    const r = preflightExportVideo(entree(c, { fournisseurs: { ...FOURNIS, animation: false } }));
    expect(codes(r)).toEqual(['plan_sans_clip@s2:bloque']);
    expect(r.violations[0]!.raison).toBe('Le plan 2 n’a pas de clip, et aucune animation n’est disponible sur ce serveur.');
    expect(codes(preflightExportVideo(entree(c)))).toEqual(['plan_sans_clip@s2:a_corriger']);
  });
  it('clip introuvable, non décodé, trop court ⇒ chacun dit', () => {
    const c = video();
    expect(codes(preflightExportVideo(entree(c, { medias: { clip_s2: { decode: true, dureeTicks: 9e6 } } })))).toEqual(['clip_absent@s1:a_corriger']);
    expect(codes(preflightExportVideo(entree(c, { medias: { ...medias(c), clip_s1: { decode: false } } })))).toEqual(['clip_non_decode@s1:a_corriger']);
    // Le plan 1 dure 2 s · un clip de 1,9 s manque de 3 images, un clip à une image près suffit.
    expect(codes(preflightExportVideo(entree(c, { medias: { ...medias(c), clip_s1: { decode: true, dureeTicks: 1_900_000 } } })))).toEqual(['clip_trop_court@s1:a_corriger']);
    expect(codes(preflightExportVideo(entree(c, { medias: { ...medias(c), clip_s1: { decode: true, dureeTicks: 1_970_000 } } })))).toEqual([]);
  });
  it('son saturé au décodage ⇒ signalé', () => {
    const c = video();
    expect(codes(preflightExportVideo(entree(c, { medias: { ...medias(c), clip_s2: { decode: true, dureeTicks: 5e6, audioSature: true } } })))).toEqual(['audio_sature@s2:a_corriger']);
  });
});

describe('voix, lipsync, sous-titres, texte écran · requis mais absents', () => {
  it('voix off sans fournisseur de voix ⇒ BLOQUÉ (jamais simulé) ; avec fournisseur ⇒ à corriger', () => {
    const c = video([plan('s1', { speechMode: 'voiceover', narration: 'Encore un bouton ?' }), plan('s2')]);
    const r = preflightExportVideo(entree(c, { fournisseurs: { ...FOURNIS, voix: false } }));
    expect(codes(r)).toEqual(['voix_indisponible@s1:bloque']);
    expect(r.statut).toBe('bloque');
    expect(codes(preflightExportVideo(entree(c)))).toEqual(['voix_absente@s1:a_corriger']);
    const avecVoix = video([plan('s1', { speechMode: 'voiceover', narration: 'Encore un bouton ?', voiceAssetId: 'voix_s1' }), plan('s2')]);
    expect(codes(preflightExportVideo(entree(avecVoix, { fournisseurs: { ...FOURNIS, voix: false } })))).toEqual([]);
  });
  it('lipsync sans fournisseur ⇒ bloqué même avec une prise de voix', () => {
    const c = video([plan('s1', { speechMode: 'lipsync', narration: 'Bonjour', voiceAssetId: 'voix_s1' }), plan('s2')]);
    expect(codes(preflightExportVideo(entree(c, { fournisseurs: { ...FOURNIS, lipsync: false } })))).toEqual(['lipsync_indisponible@s1:bloque']);
  });
  it('sous-titres et texte écran retirés du montage ⇒ violations sur le plan', () => {
    const c = video([plan('s1', { speechMode: 'voiceover', narration: 'Encore un bouton ?', voiceAssetId: 'voix_s1', onScreenText: ['-30 %'] }), plan('s2')]);
    expect(codes(preflightExportVideo(entree(c)))).toEqual([]);
    const t = c.timeline!;
    const sansTexte = { ...t, tracks: Object.fromEntries(Object.entries(t.tracks).filter(([k]) => k !== PISTES_VIDEO.sousTitres && k !== PISTES_VIDEO.texte)) };
    expect(codes(preflightExportVideo(entree({ ...c, timeline: sansTexte })))).toEqual(['sous_titres_absents@s1:a_corriger', 'texte_ecran_absent@s1:a_corriger']);
  });
  it('musique choisie non décodée ⇒ visée par son identifiant', () => {
    const c = video();
    const r = preflightExportVideo(entree({ ...c, timeline: { ...c.timeline!, music: { assetId: 'mus_1', gainDb: -12 } } }));
    expect(codes(r)).toEqual(['musique_absente@mus_1:a_corriger']);
  });
});

describe('format · H.264 4:2:0 exige des dimensions paires', () => {
  it('format impair ⇒ violation', () => {
    expect(codes(preflightExportVideo(entree(video(), { format: { largeur: 1081, hauteur: 1920 } })))).toEqual(['dimensions_impaires@format:a_corriger']);
  });
});
