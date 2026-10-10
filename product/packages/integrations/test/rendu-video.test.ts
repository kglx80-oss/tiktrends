import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assemblerVideoFfmpeg, grapheAssemblage } from '../src/rendu-video';

/**
 * Vidéo finale · l'assembleur RÉEL (ffmpeg du conteneur), contre des clips
 * fabriqués ici. Le fichier produit est relu par ffprobe DANS l'assembleur ;
 * on le relit encore ici, indépendamment. Aucun réseau, 0 $.
 */

const FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
let dossier = '';
const fabriquer = (nom: string, args: string[]) => {
  const f = join(dossier, nom);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args, f], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return new Uint8Array(readFileSync(f));
};
const clip = (nom: string, taille: string, s: number) => fabriquer(nom, ['-f', 'lavfi', '-i', `testsrc=size=${taille}:rate=24:duration=${s}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'mp4']);
const sonder = (o: Uint8Array) => {
  const f = join(dossier, `sonde-${Math.random().toString(36).slice(2)}.mp4`);
  writeFileSync(f, o);
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', f], { encoding: 'utf8' });
  return JSON.parse(r.stdout) as { streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }>; format: { duration: string } };
};

beforeAll(() => { dossier = mkdtempSync(join(tmpdir(), 'rendu-video-')); });
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

describe('graphe ffmpeg · chaque plan au format et à sa durée, bande son', () => {
  it('réduit sans déformer, bandes, durée tenue (dernière image prolongée), concaténation, musique au gain et fondu', () => {
    const g = grapheAssemblage({ n: 2, dureesMs: [3000, 4500], largeur: 1080, hauteur: 1920, fps: '30/1', musique: true, gainDb: -12, totalMs: 7500 });
    expect(g).toContain('[0:v]fps=30/1,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:');
    expect(g).toContain('tpad=stop_mode=clone:stop_duration=4.500,trim=duration=4.500');
    expect(g).toContain('[v0][v1]concat=n=2:v=1:a=0[v]');
    expect(g).toContain('[2:a]aresample=48000,aformat=channel_layouts=stereo,volume=-12dB,atrim=duration=7.500,apad=whole_dur=7.500,afade=t=out:st=7.000:d=0.5[a]');
  });
});

describe.skipIf(!FFMPEG)('assemblage réel · ffmpeg du conteneur', () => {
  it('deux clips de tailles différentes, l’un trop court, avec musique ⇒ MP4 H.264/AAC au format, 3 s + 4 s', async () => {
    const musique = fabriquer('m.mp3', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=20', '-f', 'mp3']);
    const r = await assemblerVideoFfmpeg({ segments: [{ octets: clip('a.mp4', '320x240', 5), dureeMs: 3000 }, { octets: clip('b.mp4', '240x320', 2), dureeMs: 4000 }], musique: { octets: musique, gainDb: -12 }, largeur: 360, hauteur: 640, fps: { num: 30, den: 1 } });
    expect(r.ok, !r.ok ? r.motif : '').toBe(true);
    if (!r.ok) return;
    expect(r.mesure).toEqual({ largeur: 360, hauteur: 640, dureeMs: 7000 });
    const p = sonder(r.octets);
    expect(p.streams.map((s) => [s.codec_type, s.codec_name]).sort()).toEqual([['audio', 'aac'], ['video', 'h264']]);
    expect(Math.abs(Number(p.format.duration) - 7)).toBeLessThan(0.1);
  });

  it('sans musique ⇒ bande son silencieuse stéréo, toujours deux flux', async () => {
    const r = await assemblerVideoFfmpeg({ segments: [{ octets: clip('c.mp4', '320x240', 1), dureeMs: 2000 }], musique: null, largeur: 360, hauteur: 640, fps: { num: 30, den: 1 } });
    expect(r.ok && r.mesure.dureeMs).toBe(2000);
    expect(r.ok && sonder(r.octets).streams.length).toBe(2);
  });

  it('clip illisible ⇒ refus « rendu », aucun fichier rendu', async () => {
    const r = await assemblerVideoFfmpeg({ segments: [{ octets: new TextEncoder().encode('ceci n’est pas une vidéo'), dureeMs: 2000 }], musique: null, largeur: 360, hauteur: 640, fps: { num: 30, den: 1 } });
    expect(r).toMatchObject({ ok: false, cause: 'rendu' });
  });

  it('binaire absent ⇒ refus « binaire », jamais un faux fichier', async () => {
    const r = await assemblerVideoFfmpeg({ segments: [{ octets: clip('d.mp4', '320x240', 1), dureeMs: 1000 }], musique: null, largeur: 360, hauteur: 640, fps: { num: 30, den: 1 } }, { ffmpeg: '/chemin/inexistant/ffmpeg' });
    expect(r).toMatchObject({ ok: false, cause: 'binaire' });
  });

  // La relecture ffprobe est la dernière barrière · une sonde qui décrit un fichier non conforme ⇒ jamais rendu.
  const sondeFausse = (nom: string, json: object) => {
    const f = join(dossier, nom);
    writeFileSync(f, `#!/bin/sh\ncat <<'FIN'\n${JSON.stringify(json)}\nFIN\n`);
    chmodSync(f, 0o755);
    return f;
  };
  const entree = () => ({ segments: [{ octets: clip('e.mp4', '320x240', 1), dureeMs: 1000 }], musique: null, largeur: 360, hauteur: 640, fps: { num: 30, den: 1 } });
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
