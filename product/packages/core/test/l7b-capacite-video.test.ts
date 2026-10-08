import { describe, it, expect } from 'vitest';
import {
  capaciteVideo, lireSondeVideo, verdictDecodage, refusLectureVideo, operationsNonVerifiables, operationsSansFournisseur,
  FRAICHEUR_SONDE_VIDEO_MS, INTERVALLE_SONDE_VIDEO_MS, DERIVE_HORLOGE_SONDE_MS, FOURNISSEUR_ANIMATION_BRANCHE, CLE_SONDE_VIDEO,
  type SondeVideo, type InfosVideo, type ResultatDecodage,
} from '../src/studios/execution/media';
import { disponibiliteVideo, RAISON_ANIMATION_INDISPONIBLE, RAISON_ANIMATION_SANS_FOURNISSEUR } from '../src/studios/video';

/**
 * L7-B · la capacité vidéo est une PREUVE fraîche du worker, jamais une
 * constante. Règle pure : sonde → capacité ; décodage vidéo complet → verdict.
 */

const T = new Date('2026-10-08T10:00:00Z');
const sonde = (o: Partial<SondeVideo> = {}): SondeVideo => ({
  version: 1, sondeLe: T.toISOString(), workerId: 'w1', ffmpeg: 'ffmpeg version 6.1.1',
  decodage: { ok: true, raison: 'échantillon décodé', dureeMs: 480 }, encodeurs: { libx264: true, aac: true }, ...o,
});
const apres = (ms: number) => new Date(T.getTime() + ms);

describe('capaciteVideo · sans preuve fraîche, rien n’est promis', () => {
  it('aucune sonde publiée ⇒ décodage faux (le défaut, comportement d’avant)', () => {
    expect(capaciteVideo(null, T)).toEqual({ decodage: false, encodeurs: { libx264: false, aac: false }, raison: 'aucune sonde vidéo publiée par le worker', sondeLe: null });
    expect(capaciteVideo(undefined, T).decodage).toBe(false);
  });
  it('sonde fraîche, échantillon décodé ⇒ décodage vrai, encodeurs constatés', () => {
    expect(capaciteVideo(sonde(), T)).toEqual({ decodage: true, encodeurs: { libx264: true, aac: true }, raison: '', sondeLe: T.toISOString() });
    expect(capaciteVideo(sonde({ encodeurs: { libx264: false, aac: true } }), T).encodeurs).toEqual({ libx264: false, aac: true });
  });
  it('fraîcheur bornée · valable jusqu’à la borne incluse, périmée une milliseconde après', () => {
    expect(capaciteVideo(sonde(), apres(FRAICHEUR_SONDE_VIDEO_MS)).decodage).toBe(true);
    const p = capaciteVideo(sonde(), apres(FRAICHEUR_SONDE_VIDEO_MS + 1));
    expect(p.decodage, 'une sonde périmée promet encore la vidéo').toBe(false);
    expect(p.raison).toBe('sonde vidéo périmée · 15 min, preuve valable 15 min');
  });
  it('les valeurs choisies depuis la mesure · resonde 5 min, preuve 3 intervalles, dérive 1 min', () => {
    expect([INTERVALLE_SONDE_VIDEO_MS, FRAICHEUR_SONDE_VIDEO_MS, DERIVE_HORLOGE_SONDE_MS]).toEqual([300_000, 900_000, 60_000]);
    expect(CLE_SONDE_VIDEO).toBe('studio:capacite-video');
  });
  it('sonde datée dans le futur au-delà de la dérive ⇒ pas une preuve', () => {
    expect(capaciteVideo(sonde({ sondeLe: apres(DERIVE_HORLOGE_SONDE_MS).toISOString() }), T).decodage).toBe(true);
    expect(capaciteVideo(sonde({ sondeLe: apres(DERIVE_HORLOGE_SONDE_MS + 1).toISOString() }), T)).toMatchObject({ decodage: false, raison: 'sonde vidéo datée dans le futur' });
  });
  it('ffmpeg absent, échantillon non décodé, sonde illisible ⇒ faux, dit pourquoi', () => {
    expect(capaciteVideo(sonde({ ffmpeg: null, decodage: { ok: false, raison: 'ffmpeg introuvable', dureeMs: 1 } }), T)).toMatchObject({ decodage: false, raison: 'ffmpeg absent du worker · ffmpeg introuvable' });
    expect(capaciteVideo(sonde({ decodage: { ok: false, raison: 'lecture incomplète', dureeMs: 9 } }), T)).toMatchObject({ decodage: false, raison: 'échantillon vidéo non décodé par le worker · lecture incomplète', encodeurs: { libx264: false, aac: false } });
    expect(capaciteVideo({ version: 2 }, T).raison).toBe('sonde vidéo illisible');
    expect(capaciteVideo('vrai', T).decodage).toBe(false);
    expect(capaciteVideo({ ...sonde(), decodage: { ok: 'oui' } }, T).decodage).toBe(false);
    expect(capaciteVideo(sonde({ sondeLe: 'hier' }), T).raison).toBe('sonde vidéo sans date lisible');
  });
  it('lireSondeVideo ne garde que les champs attendus', () => {
    expect(lireSondeVideo({ ...sonde(), injecte: 'x' })).toEqual(sonde());
  });
});

describe('le devis et le worker suivent la capacité', () => {
  const ops = [{ operation: 'keyframe:s1', profil: 'image_generation' }, { operation: 'clip:s1', profil: 'animation' }];
  it('sans preuve ⇒ l’animation est non vérifiable ; avec preuve ⇒ vérifiable', () => {
    expect(operationsNonVerifiables(ops, { video: capaciteVideo(null, T).decodage })).toEqual(['clip:s1']);
    expect(operationsNonVerifiables(ops, { video: capaciteVideo(sonde(), T).decodage })).toEqual([]);
  });
  it('vérifiable ne suffit pas · aucun fournisseur d’animation branché ⇒ refusée', () => {
    expect(FOURNISSEUR_ANIMATION_BRANCHE).toBe(false);
    expect(operationsSansFournisseur(ops, { animation: FOURNISSEUR_ANIMATION_BRANCHE })).toEqual(['clip:s1']);
    expect(operationsSansFournisseur(ops, { animation: true })).toEqual([]);
  });
  it('écran · décodeur prouvé mais aucun fournisseur ⇒ animation toujours indisponible, raison juste', () => {
    const tout = { peutGenerer: true, peutProposer: true, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, briefPresent: true };
    expect(disponibiliteVideo({ ...tout, decodeurVideo: false }).animation).toEqual({ disponible: false, raison: RAISON_ANIMATION_INDISPONIBLE });
    expect(disponibiliteVideo({ ...tout, decodeurVideo: true }).animation).toEqual({ disponible: false, raison: RAISON_ANIMATION_SANS_FOURNISSEUR });
    expect(disponibiliteVideo({ ...tout, decodeurVideo: true, fournisseurVideo: FOURNISSEUR_ANIMATION_BRANCHE }).animation.disponible).toBe(false);
    expect(disponibiliteVideo({ ...tout, decodeurVideo: true, fournisseurVideo: true }).animation).toEqual({ disponible: true, raison: '' });
  });
});

describe('verdict d’une vidéo · livrable seulement LUE EN ENTIER', () => {
  const entete = { mime: 'video/mp4' as const, largeur: 64, hauteur: 48 };
  const extrait = (rang: number) => ({ rang, largeur: 64, hauteur: 48, canaux: 3, octetsPixels: 64 * 48 * 3, moyenne: [10, 20, 30] });
  const infos = (o: Partial<InfosVideo> = {}): InfosVideo => ({ codec: 'h264', fps: { num: 24, den: 1 }, images: 24, imagesAnnoncees: 24, dureeTicks: 1_000_000, audio: null, extraits: [extrait(0), extrait(11), extrait(23)], ...o });
  const ok = (video?: InfosVideo): ResultatDecodage => ({ ok: true, largeur: 64, hauteur: 48, canaux: 3, octetsPixels: 3 * 64 * 48 * 3, video });

  it('lecture complète ⇒ livrable', () => {
    expect(verdictDecodage(entete, ok(infos()))).toEqual({ livrable: true, largeur: 64, hauteur: 48 });
  });
  it('aucun constat de lecture (un décodeur qui ne dit que « ok ») ⇒ refusé', () => {
    expect(verdictDecodage(entete, ok(undefined))).toEqual({ livrable: false, suite: 'retelecharger', raison: 'vidéo sans lecture complète · aucun constat de décodage des images' });
  });
  it('moins d’images décodées qu’annoncées ⇒ refusé', () => {
    expect(verdictDecodage(entete, ok(infos({ images: 20 })))).toMatchObject({ livrable: false, raison: 'lecture incomplète · 20 images décodées sur 24 annoncées' });
  });
  it('extraits manquants ou aux mauvaises dimensions ⇒ refusé', () => {
    expect(refusLectureVideo(infos({ extraits: [extrait(0)] }), 64, 48)).toBe('images début, milieu, fin non extraites (1)');
    expect(refusLectureVideo(infos({ extraits: [extrait(0), extrait(11), { ...extrait(23), largeur: 32 }] }), 64, 48)).toBe('image 23 extraite en 32×48, vidéo 64×48');
    expect(refusLectureVideo(infos({ extraits: [extrait(0), extrait(11), { ...extrait(23), octetsPixels: 10 }] }), 64, 48)).toBe('image 23 aux pixels incomplets');
    expect(refusLectureVideo(infos({ images: 0, imagesAnnoncees: null }), 64, 48)).toBe('vidéo sans aucune image décodée');
  });
  it('une image ne passe pas par la règle vidéo', () => {
    expect(verdictDecodage({ mime: 'image/png', largeur: 2, hauteur: 2 }, { ok: true, largeur: 2, hauteur: 2, canaux: 3, octetsPixels: 12 })).toMatchObject({ livrable: true });
  });
});
