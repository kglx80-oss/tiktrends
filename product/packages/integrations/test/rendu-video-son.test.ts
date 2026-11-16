import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { assemblerVideoFfmpeg, grapheAssemblage, dureeSegmentS, NOM_MP4_ASSEMBLE } from '../src/rendu-video';

/**
 * Vidéo finale · le SON des prises survit au montage. Assembleur RÉEL (ffmpeg
 * du conteneur) contre des clips fabriqués ici, MP4 final relu de l'extérieur
 * (ffprobe, `astats` par blocs de 10 ms). Aucun réseau, 0 $.
 *
 *  · une prise parlée est figurée par un bip 1 kHz (la « voix »), une prise
 *    muette n'a AUCUNE piste (comme Kling), la musique est un sinus 440 Hz ;
 *  · chaque fréquence est isolée par un passe-bande : on lit la voix et la
 *    musique séparément dans le mélange final.
 *
 * Ce qui est vérifié, sur le fichier · le bip commence et finit à la frontière
 * de son plan (à une image près), la musique est plus basse pendant le bip
 * qu'avant et après, les durées audio et vidéo concordent à une image près,
 * des plans de durée non multiple de l'image ne font pas dériver la voix.
 */

const FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const executer = promisify(execFile);
let dossier = '';
const fabriquer = async (nom: string, args: string[]) => {
  const f = join(dossier, nom);
  await executer('ffmpeg', ['-v', 'error', '-y', ...args, f]);
  return new Uint8Array(await readFile(f));
};

const UNE_IMAGE_S = 1 / 30;
const BLOC_S = 0.01;

/** Niveau RMS (dB) par bloc de 10 ms, dans la bande d'une fréquence · `[début du bloc, dB]`. */
async function niveaux(o: Uint8Array, frequence: number): Promise<Array<[number, number]>> {
  const f = join(dossier, `sonde-${Math.random().toString(36).slice(2)}.mp4`);
  await writeFile(f, o);
  const r = await executer('ffmpeg', ['-hide_banner', '-nostats', '-v', 'error', '-i', f, '-map', '0:a:0', '-af',
    `aresample=48000,pan=mono|c0=c0,bandpass=f=${frequence}:width_type=h:width=120,asetnsamples=n=480:p=0,astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=-`,
    '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const out: Array<[number, number]> = [];
  let t = NaN;
  for (const l of r.stdout.split('\n')) {
    const m = /pts_time:([\d.]+)/.exec(l);
    if (m) t = Number(m[1]);
    const v = /RMS_level=(-?[\d.]+|-inf)/.exec(l);
    if (v) out.push([t, v[1] === '-inf' ? -200 : Number(v[1])]);
  }
  return out;
}
/** RMS moyen (dB, moyenne d'énergie) des blocs entièrement compris dans [a, b[. */
function moyenne(n: Array<[number, number]>, a: number, b: number): number {
  const x = n.filter(([t]) => t >= a - 1e-6 && t + BLOC_S <= b + 1e-6).map(([, db]) => 10 ** (db / 10));
  return 10 * Math.log10(x.reduce((s, v) => s + v, 0) / x.length);
}
/** Début et fin de la voix · premier et dernier bloc à moins de 20 dB de sa crête. */
function fenetre(n: Array<[number, number]>): { debut: number; fin: number } {
  const crete = Math.max(...n.map(([, db]) => db));
  const forts = n.filter(([, db]) => db > crete - 20);
  return { debut: forts[0]![0], fin: forts[forts.length - 1]![0] + BLOC_S };
}
async function durees(o: Uint8Array): Promise<{ video: number; audio: number }> {
  const f = join(dossier, `sonde-${Math.random().toString(36).slice(2)}.mp4`);
  await writeFile(f, o);
  const r = await executer('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'json', f], { encoding: 'utf8' });
  const s = (JSON.parse(r.stdout) as { streams: Array<{ codec_type: string; duration: string }> }).streams;
  return { video: Number(s.find((x) => x.codec_type === 'video')!.duration), audio: Number(s.find((x) => x.codec_type === 'audio')!.duration) };
}
/** Sonie intégrée (LUFS, EBU R128) du fichier. */
async function sonie(o: Uint8Array): Promise<number> {
  const f = join(dossier, `sonde-${Math.random().toString(36).slice(2)}.mp4`);
  await writeFile(f, o);
  const r = await executer('ffmpeg', ['-hide_banner', '-nostats', '-v', 'info', '-i', f, '-map', '0:a:0', '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const resume = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  return Number(/I:\s*(-?[\d.]+) LUFS/.exec(resume)![1]);
}
async function crete(o: Uint8Array): Promise<number> {
  const f = join(dossier, `sonde-${Math.random().toString(36).slice(2)}.mp4`);
  await writeFile(f, o);
  const r = await executer('ffmpeg', ['-hide_banner', '-nostats', '-v', 'info', '-i', f, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  return Number(/max_volume:\s*(-?[\d.]+) dB/.exec(r.stderr)![1]);
}

/** Bip 1 kHz 3 s (prise « parlée », piste AAC mono 44,1 kHz), prise muette 2 s SANS piste, musique 440 Hz 20 s. */
let BIP = new Uint8Array();
let MUET = new Uint8Array();
let MUSIQUE = new Uint8Array();

beforeAll(async () => {
  dossier = await mkdtemp(join(tmpdir(), 'rendu-video-son-'));
  if (!FFMPEG) return;
  [BIP, MUET, MUSIQUE] = await Promise.all([
    fabriquer('bip.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=3:sample_rate=44100', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-f', 'mp4']),
    fabriquer('muet.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'mp4']),
    fabriquer('m.mp3', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=20', '-f', 'mp3']),
  ]);
});
afterAll(() => rm(dossier, { recursive: true, force: true }));

describe('graphe · le son des prises', () => {
  it('aucune prise sonore ⇒ graphe d’avant, caractère pour caractère (avec ou sans musique)', () => {
    const base = { n: 2, dureesMs: [3000, 4500], largeur: 1080, hauteur: 1920, fps: '30/1', gainDb: -12, totalMs: 7500 };
    for (const musique of [true, false]) {
      expect(grapheAssemblage({ ...base, musique, sonDesSegments: [false, false] })).toBe(grapheAssemblage({ ...base, musique }));
      expect(grapheAssemblage({ ...base, musique })).toContain('concat=n=2:v=1:a=0[v]');
    }
  });

  it('une prise sonore ⇒ piste gardée, silence pour la muette, concat audio, musique baissée sous la voix, normalisation', () => {
    const g = grapheAssemblage({ n: 2, dureesMs: [3000, 2000], largeur: 360, hauteur: 640, fps: '30/1', musique: true, gainDb: -6, totalMs: 5000, sonDesSegments: [true, false] });
    expect(g).toContain('[0:a]aresample=48000:async=1:first_pts=0,');
    expect(g).toContain('atrim=duration=3.000000,apad=whole_dur=3.000000');
    expect(g).toContain('anullsrc=r=48000:cl=stereo,');
    expect(g).not.toContain('[1:a]');
    expect(g).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][voix]');
    expect(g).toMatch(/\[mus48\]\[voixsc\]sidechaincompress=/);
    expect(g).toMatch(/amix=inputs=2:duration=first:dropout_transition=0:normalize=0,loudnorm=/);
    expect(g).not.toMatch(/subtitles|ass=|drawtext/);
  });

  it('durée audio d’un segment = durée RÉELLE de ses images (⌈durée × fps⌉ images)', () => {
    expect(dureeSegmentS(3000, '30/1')).toBe('3.000000');
    expect(dureeSegmentS(3010, '30/1')).toBe('3.033333');
    expect(dureeSegmentS(1001, '30000/1001')).toBe('1.001000');
    expect(dureeSegmentS(1010, '30/1')).toBe('1.033333');
  });
});

/**
 * Limite des cas réels · MESURÉE (2026-11-16, 4 vCPU, `vitest run` de ce
 * fichier seul, 3 passages, durée du cas en ms ; chaque cas assemble PUIS
 * relit le fichier par 2 à 4 processus ffmpeg/ffprobe) :
 *
 * | cas                                        | seul        |
 * |--------------------------------------------|-------------|
 * | muet · bip · muet, avec musique, 7,5 s     | 2 498-2 859 |
 * | cinq plans dont trois de 1,010 s, 6,1 s    | 1 732-2 001 |
 * | deux prises muettes, sans musique, 3 s     | 571-648     |
 *
 * La suite entière, sous charge, multiplie ces durées par 3 à 5 (mesures de
 * `rendu-video.test.ts`). 30 s laissent un facteur 10 sur la pire mesure.
 */
const DELAI_SON_MS = 30_000;

describe.skipIf(!FFMPEG)('assemblage réel · le son des prises', { timeout: DELAI_SON_MS }, () => {
  it('muet 2 s · bip 3 s dans un plan de 3,5 s · muet 2 s, musique ⇒ bip dans sa fenêtre, musique plus basse sous le bip, durées audio = vidéo, sonie visée', async () => {
    const garde = await mkdtemp(join(dossier, 'sortie-'));
    const r = await assemblerVideoFfmpeg({
      segments: [{ octets: MUET, dureeMs: 2000 }, { octets: BIP, dureeMs: 3500 }, { octets: MUET, dureeMs: 2000 }],
      musique: { octets: MUSIQUE, gainDb: -6 }, largeur: 360, hauteur: 640, fps: { num: 30, den: 1 },
    }, { dossierSortie: garde });
    expect(r.ok, !r.ok ? r.motif : '').toBe(true);
    if (!r.ok) return;
    expect(r.mesure.sonDesSegments).toEqual([false, true, false]);
    // Le MP4 assemblé reste sur disque pour la passe des sous-titres, identique aux octets rendus.
    expect(r.chemin).toBe(join(garde, NOM_MP4_ASSEMBLE));
    expect((await stat(r.chemin!)).size).toBe(r.octets.length);

    const d = await durees(r.octets);
    expect(Math.abs(d.audio - d.video), `audio ${d.audio} s, vidéo ${d.video} s`).toBeLessThanOrEqual(UNE_IMAGE_S + 1e-6);
    expect(Math.abs(d.video - 7.5)).toBeLessThanOrEqual(UNE_IMAGE_S);

    // La voix · de 2 s (fin du premier plan muet) à 5 s (fin de son clip de 3 s), puis le silence tenu jusqu'à 5,5 s.
    const voix = await niveaux(r.octets, 1000);
    const w = fenetre(voix);
    expect(Math.abs(w.debut - 2), `la voix commence à ${w.debut} s, attendue à 2 s`).toBeLessThanOrEqual(UNE_IMAGE_S);
    expect(Math.abs(w.fin - 5), `la voix finit à ${w.fin} s, attendue à 5 s`).toBeLessThanOrEqual(UNE_IMAGE_S);
    const horsVoix = Math.max(moyenne(voix, 0.2, 1.8), moyenne(voix, 5.7, 7.0));
    expect(moyenne(voix, 2.2, 4.8) - horsVoix, 'la voix ne domine pas sa fenêtre').toBeGreaterThan(20);

    const musique = await niveaux(r.octets, 440);
    const avant = moyenne(musique, 0.5, 1.8);
    const pendant = moyenne(musique, 2.6, 4.8);
    const apres = moyenne(musique, 6.0, 6.9);
    const lufs = await sonie(r.octets);
    console.info(`[mesure] voix ${moyenne(voix, 2.2, 4.8).toFixed(1)} dB, hors fenêtre ${horsVoix.toFixed(1)} dB · musique avant ${avant.toFixed(1)} · pendant ${pendant.toFixed(1)} · après ${apres.toFixed(1)} dB · sonie ${lufs} LUFS · durées vidéo ${d.video} s audio ${d.audio} s · voix ${w.debut}-${w.fin} s`);
    expect(avant - pendant, `musique avant ${avant.toFixed(1)} dB, pendant la voix ${pendant.toFixed(1)} dB`).toBeGreaterThan(6);
    expect(apres - pendant, `musique après ${apres.toFixed(1)} dB, pendant la voix ${pendant.toFixed(1)} dB`).toBeGreaterThan(6);
    expect(Math.abs(lufs - -16), `sonie intégrée ${lufs} LUFS, visée -16`).toBeLessThanOrEqual(2);
  });

  it('plans de durée non multiple de l’image (1,010 s) ⇒ la voix reste calée sur ses images, aucune dérive', async () => {
    // Trois plans muets de 1,010 s = 3 × 31 images = 3,100 s · le bip doit partir à 3,100 s, pas à 3,030 s.
    const r = await assemblerVideoFfmpeg({
      segments: [{ octets: MUET, dureeMs: 1010 }, { octets: MUET, dureeMs: 1010 }, { octets: MUET, dureeMs: 1010 }, { octets: BIP, dureeMs: 2000 }, { octets: MUET, dureeMs: 1000 }],
      musique: null, largeur: 360, hauteur: 640, fps: { num: 30, den: 1 },
    });
    expect(r.ok, !r.ok ? r.motif : '').toBe(true);
    if (!r.ok) return;
    const w = fenetre(await niveaux(r.octets, 1000));
    expect(Math.abs(w.debut - 3.1), `la voix commence à ${w.debut} s, ses images à 3,100 s`).toBeLessThanOrEqual(UNE_IMAGE_S / 2);
    expect(Math.abs(w.fin - 5.1), `la voix finit à ${w.fin} s, ses images à 5,100 s`).toBeLessThanOrEqual(UNE_IMAGE_S / 2);
    const d = await durees(r.octets);
    expect(Math.abs(d.audio - d.video), `audio ${d.audio} s, vidéo ${d.video} s`).toBeLessThanOrEqual(UNE_IMAGE_S + 1e-6);
  });

  it('prises toutes muettes, sans musique ⇒ bande son silencieuse, comme avant', async () => {
    const r = await assemblerVideoFfmpeg({ segments: [{ octets: MUET, dureeMs: 2000 }, { octets: MUET, dureeMs: 1000 }], musique: null, largeur: 360, hauteur: 640, fps: { num: 30, den: 1 } });
    expect(r.ok, !r.ok ? r.motif : '').toBe(true);
    if (!r.ok) return;
    expect(r.mesure.sonDesSegments).toEqual([false, false]);
    expect(r.chemin).toBeNull();
    expect(await crete(r.octets)).toBeLessThanOrEqual(-90);
  });
});
