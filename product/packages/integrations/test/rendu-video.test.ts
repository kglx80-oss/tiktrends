import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile, spawnSync } from 'node:child_process';
import { chmodSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { assemblerVideoFfmpeg, grapheAssemblage } from '../src/rendu-video';

/**
 * Vidéo finale · l'assembleur RÉEL (ffmpeg du conteneur), contre des clips
 * fabriqués ici. Le fichier produit est relu par ffprobe DANS l'assembleur ;
 * on le relit encore ici, indépendamment. Aucun réseau, 0 $.
 *
 * Les clips et la musique sont fabriqués UNE fois, en parallèle, dans le
 * `beforeAll`, par des processus ASYNCHRONES : un `spawnSync` dans le corps
 * d'un cas bloquait la boucle d'événements (le minuteur de vitest ne pouvait
 * plus se déclencher) et comptait la fabrication dans la durée du cas. Les
 * trois clips d'une seconde 320×240, identiques, n'en font plus qu'un.
 */

const FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const executer = promisify(execFile);
let dossier = '';
const fabriquer = async (nom: string, args: string[]) => {
  const f = join(dossier, nom);
  await executer('ffmpeg', ['-v', 'error', '-y', ...args, f]);
  return new Uint8Array(await readFile(f));
};
const clip = (nom: string, taille: string, s: number) => fabriquer(nom, ['-f', 'lavfi', '-i', `testsrc=size=${taille}:rate=24:duration=${s}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'mp4']);
const sonder = async (o: Uint8Array) => {
  const f = join(dossier, `sonde-${Math.random().toString(36).slice(2)}.mp4`);
  await writeFile(f, o);
  const r = await executer('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', f], { encoding: 'utf8' });
  return JSON.parse(r.stdout) as { streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }>; format: { duration: string } };
};

/** Fabriqués une fois : 320×240 5 s, 240×320 2 s, 320×240 1 s, sinus 440 Hz 20 s en MP3. */
let CLIP_5S = new Uint8Array();
let CLIP_2S = new Uint8Array();
let CLIP_1S = new Uint8Array();
let MUSIQUE = new Uint8Array();

beforeAll(async () => {
  dossier = await mkdtemp(join(tmpdir(), 'rendu-video-'));
  if (!FFMPEG) return;
  [CLIP_5S, CLIP_2S, CLIP_1S, MUSIQUE] = await Promise.all([
    clip('a.mp4', '320x240', 5),
    clip('b.mp4', '240x320', 2),
    clip('c.mp4', '320x240', 1),
    fabriquer('m.mp3', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=20', '-f', 'mp3']),
  ]);
});
afterAll(() => rm(dossier, { recursive: true, force: true }));

describe('graphe ffmpeg · chaque plan au format et à sa durée, bande son', () => {
  it('réduit sans déformer, bandes, durée tenue (dernière image prolongée), concaténation, musique au gain et fondu', () => {
    const g = grapheAssemblage({ n: 2, dureesMs: [3000, 4500], largeur: 1080, hauteur: 1920, fps: '30/1', musique: true, gainDb: -12, totalMs: 7500 });
    expect(g).toContain('[0:v]fps=30/1,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:');
    expect(g).toContain('tpad=stop_mode=clone:stop_duration=4.500,trim=duration=4.500');
    expect(g).toContain('[v0][v1]concat=n=2:v=1:a=0[v]');
    expect(g).toContain('[2:a]aresample=48000,aformat=channel_layouts=stereo,volume=-12dB,atrim=duration=7.500,apad=whole_dur=7.500,afade=t=out:st=7.000:d=0.5[a]');
  });
});

/**
 * Limite des assemblages réels · MESURÉE. Chaque cas lance ffmpeg (encodage
 * 360×640) puis ffprobe ; c'est le travail vérifié, il ne se réduit pas.
 * Mesures du 2026-11-02, 4 vCPU, suite `packages/integrations` complète,
 * 10 passages par colonne, durée du cas en ms :
 *
 * | cas               | seul (charge 6-13) | 8 boucles CPU (charge 6-12) | 16 boucles CPU (charge 19-20) | avant · 8 boucles (charge 12-17) |
 * |-------------------|--------------------|-----------------------------|-------------------------------|----------------------------------|
 * | avec musique, 7 s | 673-845            | 1 525-2 369                 | 2 975-3 925                   | 5 708-8 256                      |
 * | sans musique, 2 s | 299-343            | 675-944                     | 1 438-1 910                   | 2 071-4 471                      |
 *
 * « Avant », la fabrication des clips comptait dans le cas, et son
 * `spawnSync` bloquait le minuteur : 8,3 s passaient sous une limite de 5 s
 * (à 300 ms, un cas de 383 ms passait encore). Le `beforeAll` asynchrone
 * prend 0,7-1,0 s sous 8 boucles (limite par défaut de 10 s). 15 s laissent
 * un facteur 3,8 sur la pire mesure (3,9 s).
 */
const DELAI_ASSEMBLAGE_REEL_MS = 15_000;

describe.skipIf(!FFMPEG)('assemblage réel · ffmpeg du conteneur', { timeout: DELAI_ASSEMBLAGE_REEL_MS }, () => {
  it('deux clips de tailles différentes, l’un trop court, avec musique ⇒ MP4 H.264/AAC au format, 3 s + 4 s', async () => {
    const r = await assemblerVideoFfmpeg({ segments: [{ octets: CLIP_5S, dureeMs: 3000 }, { octets: CLIP_2S, dureeMs: 4000 }], musique: { octets: MUSIQUE, gainDb: -12 }, largeur: 360, hauteur: 640, fps: { num: 30, den: 1 } });
    expect(r.ok, !r.ok ? r.motif : '').toBe(true);
    if (!r.ok) return;
    expect(r.mesure).toEqual({ largeur: 360, hauteur: 640, dureeMs: 7000 });
    const p = await sonder(r.octets);
    expect(p.streams.map((s) => [s.codec_type, s.codec_name]).sort()).toEqual([['audio', 'aac'], ['video', 'h264']]);
    expect(Math.abs(Number(p.format.duration) - 7)).toBeLessThan(0.1);
  });

  it('sans musique ⇒ bande son silencieuse stéréo, toujours deux flux', async () => {
    const r = await assemblerVideoFfmpeg({ segments: [{ octets: CLIP_1S, dureeMs: 2000 }], musique: null, largeur: 360, hauteur: 640, fps: { num: 30, den: 1 } });
    expect(r.ok && r.mesure.dureeMs).toBe(2000);
    expect(r.ok && (await sonder(r.octets)).streams.length).toBe(2);
  });

  it('clip illisible ⇒ refus « rendu », aucun fichier rendu', async () => {
    const r = await assemblerVideoFfmpeg({ segments: [{ octets: new TextEncoder().encode('ceci n’est pas une vidéo'), dureeMs: 2000 }], musique: null, largeur: 360, hauteur: 640, fps: { num: 30, den: 1 } });
    expect(r).toMatchObject({ ok: false, cause: 'rendu' });
  });

  it('binaire absent ⇒ refus « binaire », jamais un faux fichier', async () => {
    const r = await assemblerVideoFfmpeg({ segments: [{ octets: CLIP_1S, dureeMs: 1000 }], musique: null, largeur: 360, hauteur: 640, fps: { num: 30, den: 1 } }, { ffmpeg: '/chemin/inexistant/ffmpeg' });
    expect(r).toMatchObject({ ok: false, cause: 'binaire' });
  });

  // La relecture ffprobe est la dernière barrière · une sonde qui décrit un fichier non conforme ⇒ jamais rendu.
  const sondeFausse = (nom: string, json: object) => {
    const f = join(dossier, nom);
    writeFileSync(f, `#!/bin/sh\ncat <<'FIN'\n${JSON.stringify(json)}\nFIN\n`);
    chmodSync(f, 0o755);
    return f;
  };
  const entree = () => ({ segments: [{ octets: CLIP_1S, dureeMs: 1000 }], musique: null, largeur: 360, hauteur: 640, fps: { num: 30, den: 1 } });
  it.each([
    ['dimensions', { streams: [{ codec_type: 'video', codec_name: 'h264', width: 720, height: 1280 }, { codec_type: 'audio', codec_name: 'aac' }], format: { duration: '1.0' } }, /dimensions produites 720×1280, attendues 360×640/],
    ['piste audio absente', { streams: [{ codec_type: 'video', codec_name: 'h264', width: 360, height: 640 }], format: { duration: '1.0' } }, /audio AAC absent/],
    ['durée', { streams: [{ codec_type: 'video', codec_name: 'h264', width: 360, height: 640 }, { codec_type: 'audio', codec_name: 'aac' }], format: { duration: '3.0' } }, /durée produite 3000 ms, attendue 1000 ms/],
  ])('relecture non conforme (%s) ⇒ refus « verification »', async (nom, json, motif) => {
    const r = await assemblerVideoFfmpeg(entree(), { ffprobe: sondeFausse(`ffprobe-${nom.replace(/\W/g, '')}`, json) });
    expect(r).toMatchObject({ ok: false, cause: 'verification' });
    expect(!r.ok && r.motif).toMatch(motif);
  });
});
