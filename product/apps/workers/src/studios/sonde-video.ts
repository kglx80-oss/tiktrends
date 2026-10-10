import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { schema } from '@tiktrends/db';
import {
  CLE_SONDE_VIDEO, INTERVALLE_SONDE_VIDEO_MS, inspecterMedia, verdictDecodage, type SondeVideo,
} from '@tiktrends/core';
import { decoderVideoFfmpeg, type OptionsDecodeurVideo } from './decodeur-video';
import type { BaseStudio } from './types';

/**
 * Sonde de la capacité vidéo du worker (L7-B) · une CAPACITÉ, jamais une
 * promesse. Au démarrage puis toutes les `INTERVALLE_SONDE_VIDEO_MS` :
 *
 *  1. `ffmpeg -version` · le binaire existe et répond ;
 *  2. `ffmpeg -encoders` · libx264 et aac présents ou non (export MP4) ;
 *  3. un échantillon MINUSCULE est généré à la volée (32×32, 12 i/s, 1 s,
 *     H.264 si libx264, sinon MPEG-4 ; son AAC si disponible) puis passé par
 *     le MÊME chemin que les sorties des fournisseurs : premier filtre pur,
 *     décodeur réel (`decoderVideoFfmpeg`), verdict du noyau. Il doit rendre
 *     12 images de 32×32, pixels lus.
 *
 * Le résultat est publié dans `app_settings` (`CLE_SONDE_VIDEO`, ligne
 * existante, aucune migration) ; le site le juge par `capaciteVideo` (preuve
 * fraîche exigée). Rien n'est dépensé : aucun fournisseur n'est appelé.
 */

export const ECHANTILLON_SONDE = { largeur: 32, hauteur: 32, fps: 12, images: 12 } as const;
const DELAI_SONDE_MS = 30_000;

type Exec = { code: number; stdout: string; stderr: string; absent: boolean };
function exec(bin: string, args: string[], env?: NodeJS.ProcessEnv): Promise<Exec> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: DELAI_SONDE_MS, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024, env: env ?? process.env, encoding: 'utf8' }, (err, stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null;
      resolve({ code: e ? (typeof e.code === 'number' ? e.code : -1) : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), absent: e?.code === 'ENOENT' });
    });
  });
}

/** Lignes `ffmpeg -encoders` : « V....D libx264  libx264 H.264 … » → présence du nom exact. */
export function encodeursPresents(sortie: string): { libx264: boolean; aac: boolean } {
  const noms = new Set(sortie.split('\n').map((l) => /^\s*[VAS.][A-Z.]{5}\s+(\S+)/.exec(l)?.[1]).filter((x): x is string => !!x));
  return { libx264: noms.has('libx264'), aac: noms.has('aac') };
}

export async function sonderVideo(o: OptionsDecodeurVideo & { workerId?: string; horloge?: () => Date } = {}): Promise<SondeVideo> {
  const horloge = o.horloge ?? (() => new Date());
  const debut = Date.now();
  const ffmpeg = o.ffmpeg ?? 'ffmpeg';
  const base = { version: 1 as const, workerId: o.workerId ?? `${hostname()}:${process.pid}` };
  const fin = (ffmpegVersion: string | null, ok: boolean, raison: string, encodeurs = { libx264: false, aac: false }): SondeVideo =>
    ({ ...base, sondeLe: horloge().toISOString(), ffmpeg: ffmpegVersion, decodage: { ok, raison, dureeMs: Date.now() - debut }, encodeurs });

  const v = await exec(ffmpeg, ['-hide_banner', '-version'], o.env);
  if (v.absent) return fin(null, false, `${ffmpeg} introuvable`);
  const version = (v.stdout.split('\n')[0] ?? '').trim().slice(0, 200);
  if (v.code !== 0 || !/^ffmpeg version /.test(version)) return fin(null, false, `${ffmpeg} -version ne répond pas (code ${v.code})`);
  const enc = await exec(ffmpeg, ['-hide_banner', '-encoders'], o.env);
  const encodeurs = enc.code === 0 ? encodeursPresents(enc.stdout) : { libx264: false, aac: false };

  let dossier: string | null = null;
  try {
    dossier = await mkdtemp(join(tmpdir(), 'tt-sonde-'));
    const sortie = join(dossier, 'echantillon.mp4');
    const E = ECHANTILLON_SONDE;
    const g = await exec(ffmpeg, [
      '-nostdin', '-v', 'error',
      '-f', 'lavfi', '-i', `testsrc=size=${E.largeur}x${E.hauteur}:rate=${E.fps}:duration=${E.images / E.fps}`,
      ...(encodeurs.aac ? ['-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${E.images / E.fps}`] : []),
      '-map', '0:v:0', ...(encodeurs.aac ? ['-map', '1:a:0', '-c:a', 'aac'] : []),
      '-c:v', encodeurs.libx264 ? 'libx264' : 'mpeg4', '-pix_fmt', 'yuv420p', '-frames:v', String(E.images),
      '-f', 'mp4', sortie,
    ], o.env);
    if (g.code !== 0) return fin(version, false, `échantillon non généré · ${(g.stderr.split('\n')[0] ?? '').slice(0, 160)}`, encodeurs);
    const octets = new Uint8Array(await readFile(sortie));
    const entete = inspecterMedia(octets);
    if (!entete || entete.mime !== 'video/mp4') return fin(version, false, 'échantillon refusé par le premier filtre', encodeurs);
    const d = await decoderVideoFfmpeg(octets, o);
    if (!d.ok) return fin(version, false, `échantillon non décodé · ${d.raison}`, encodeurs);
    const verdict = verdictDecodage(entete, d);
    if (!verdict.livrable) return fin(version, false, `échantillon non livrable · ${verdict.raison}`, encodeurs);
    if (d.largeur !== E.largeur || d.hauteur !== E.hauteur || d.video?.images !== E.images) {
      return fin(version, false, `échantillon décodé en ${d.largeur}×${d.hauteur}, ${d.video?.images ?? 0} images (attendu ${E.largeur}×${E.hauteur}, ${E.images})`, encodeurs);
    }
    return fin(version, true, `échantillon ${E.largeur}×${E.hauteur} de ${E.images} images décodé en entier`, encodeurs);
  } catch (e) {
    return fin(version, false, `sonde en panne · ${((e as Error).message ?? '').slice(0, 160)}`, encodeurs);
  } finally {
    if (dossier) await rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
}

/** Publie la sonde là où le site la lit (`app_settings`, upsert). */
export async function publierSondeVideo(base: BaseStudio, sonde: SondeVideo): Promise<void> {
  await base.insert(schema.appSettings).values({ key: CLE_SONDE_VIDEO, value: sonde, updatedAt: new Date(sonde.sondeLe) })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: sonde, updatedAt: new Date(sonde.sondeLe) } });
}

/**
 * Sonde au démarrage puis périodique, publiée à chaque passage. `derniere()`
 * rend la dernière sonde CONSTATÉE par ce processus (le worker décide pour
 * lui-même, sans relire la base). Une publication en échec est dite, jamais
 * fatale : le site retombe alors sur « sans preuve » à la péremption.
 */
export function demarrerSondeVideo(o: {
  base: BaseStudio | null;
  intervalleMs?: number;
  sonder?: () => Promise<SondeVideo>;
  log?: (m: string) => void;
}): { derniere: () => SondeVideo | null; premiere: Promise<SondeVideo>; arreter: () => void } {
  const log = o.log ?? ((m: string) => console.log(m));
  const sonder = o.sonder ?? (() => sonderVideo());
  let derniere: SondeVideo | null = null;
  const passage = async (): Promise<SondeVideo> => {
    const s = await sonder();
    derniere = s;
    if (o.base) {
      try { await publierSondeVideo(o.base, s); } catch (e) { log(`[studios] sonde vidéo non publiée · ${(e as Error).message}`); }
    }
    log(`[studios] sonde vidéo · ${s.decodage.ok ? 'décodage prouvé' : 'aucun décodage'} · ${s.decodage.raison} · H.264 ${s.encodeurs.libx264 ? 'oui' : 'non'}, AAC ${s.encodeurs.aac ? 'oui' : 'non'} (${s.decodage.dureeMs} ms)`);
    return s;
  };
  const premiere = passage();
  premiere.catch((e) => log(`[studios] sonde vidéo en échec · ${(e as Error).message}`));
  let enCours = false;
  const minuterie = setInterval(async () => {
    if (enCours) return;
    enCours = true;
    try { await passage(); } catch (e) { log(`[studios] sonde vidéo en échec · ${(e as Error).message}`); } finally { enCours = false; }
  }, o.intervalleMs ?? INTERVALLE_SONDE_VIDEO_MS);
  minuterie.unref?.();
  return { derniere: () => derniere, premiere, arreter: () => clearInterval(minuterie) };
}
