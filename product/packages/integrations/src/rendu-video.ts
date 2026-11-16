import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Studios · assemblage de la VIDÉO FINALE d'un projet avec ffmpeg.
 *
 * Reçoit les clips animés des plans (octets MP4, dans l'ordre) avec la durée
 * de chaque plan, et la musique éventuelle ; rend un MP4 H.264/AAC au format
 * demandé :
 *  · chaque clip est mis au format (réduit sans déformation, bandes noires),
 *    au débit d'images du montage, tenu à la durée du plan (dernière image
 *    prolongée si le clip est plus court, coupé s'il est plus long) ;
 *  · les plans sont mis bout à bout ;
 *  · le SON de chaque prise est gardé (voix, lèvres et son du lieu naissent
 *    dans la prise) : chaque segment apporte sa piste, tenue à la durée de
 *    son plan arrondie à l'image (`atrim`, `apad`), ou un silence (`anullsrc`)
 *    si la prise est muette (Kling ne rend aucune piste) ; les pistes sont
 *    mises bout à bout AVEC les images (`concat` a=1), puis la musique passe
 *    SOUS la voix (`sidechaincompress`), les deux sont mêlées (`amix`) et le
 *    niveau est normalisé (`loudnorm`) ;
 *  · aucune prise sonore : graphe STRICTEMENT celui d'avant · la bande son est
 *    la musique à son gain, coupée à la durée et fondue en sortie, ou un
 *    silence stéréo ;
 *  · aucun filtre de sous-titres · ils se brûlent dans une passe SÉPARÉE sur le
 *    MP4 assemblé (`OptionsAssemblage.dossierSortie` le garde sur disque) ;
 *  · `+faststart` (lecture progressive).
 *
 * Une prise « a du son » si le MÉDIA LIVRÉ le dit, jamais d'après le modèle
 * supposé : ffprobe y trouve une piste audio ET sa crête mesurée
 * (`volumedetect`) dépasse `SEUIL_SILENCE_DB`.
 *
 * Le fichier produit est RELU par ffprobe (flux vidéo et audio, dimensions,
 * durée à une image près) : un fichier non conforme n'est jamais rendu.
 *
 * Processus SANS shell (`execFile`, arguments en tableau), délai borné et tué
 * par SIGKILL, dossier temporaire privé supprimé dans `finally`, entrées
 * limitées au protocole `file`. Binaire absent ⇒ refus dit, jamais un faux
 * fichier.
 */

export interface SegmentAssemblage { octets: Uint8Array; dureeMs: number }
export interface EntreeAssemblage {
  segments: SegmentAssemblage[];
  musique: { octets: Uint8Array; gainDb: number } | null;
  largeur: number;
  hauteur: number;
  fps: { num: number; den: number };
}
export interface MesureAssemblage {
  largeur: number;
  hauteur: number;
  dureeMs: number;
  /** Durée de la piste audio produite, relue par ffprobe. */
  dureeAudioMs: number;
  /** Pour chaque segment, dans l'ordre : la prise livrée a-t-elle du son (piste ET crête au-dessus du silence) ? */
  sonDesSegments: boolean[];
}
export type ResultatAssemblage =
  | { ok: true; octets: Uint8Array; mesure: MesureAssemblage; /** Le MP4 assemblé sur disque · seulement avec `dossierSortie`. */ chemin: string | null }
  | { ok: false; motif: string; cause: 'binaire' | 'filtre' | 'entree' | 'rendu' | 'verification' };

export interface OptionsAssemblage {
  ffmpeg?: string;
  ffprobe?: string;
  delaiMs?: number;
  env?: NodeJS.ProcessEnv;
  /**
   * Dossier (existant, à l'appelant) où GARDER le MP4 assemblé, sous
   * `NOM_MP4_ASSEMBLE` · pour une passe ffmpeg suivante (sous-titres brûlés).
   * Absent : le fichier ne survit pas à l'appel, seuls ses octets sont rendus.
   */
  dossierSortie?: string;
}

/** Nom du MP4 assemblé gardé dans `dossierSortie`. */
export const NOM_MP4_ASSEMBLE = 'video-assemblee.mp4';

/**
 * Crête (dB, `volumedetect`) au-dessous de laquelle une piste est un SILENCE.
 * Mesures (ffmpeg 6.1.1, AAC, 2 s) :
 *
 *   | piste                                   | crête mesurée |
 *   | silence numérique (anullsrc → AAC)      | -91,0 dB (plancher de volumedetect) |
 *   | bruit très faible (anoisesrc a=0,0003)  | -65,2 dB      |
 *   | sinus 300 Hz à -78 dBFS                 | -78,3 dB      |
 *   | bip 1 kHz, amplitude par défaut         | -16,6 dB      |
 *
 * -85 dB : 6 dB au-dessus du plancher du silence, 6,7 dB au-dessous du plus
 * faible signal mesuré (lui-même inaudible).
 */
export const SEUIL_SILENCE_DB = -85;

/**
 * Le dosage du montage sonore · la voix devant, la musique dessous.
 * `sidechaincompress` baisse la musique dès que la voix dépasse le seuil
 * (amplitude linéaire 0,01 ≈ -40 dBFS), au rapport 20, en 10 ms, relâchée en
 * 300 ms ; `loudnorm` vise -16 LUFS intégrés (réseaux sociaux, mobile), crête
 * vraie -1,5 dBTP.
 *
 * Baisse MESURÉE sur le fichier final (`rendu-video-son.test.ts` : bip 1 kHz
 * 3 s entre deux prises muettes, musique 440 Hz à -6 dB, niveaux lus au
 * passe-bande ; ffmpeg 6.1.1, résultats identiques sur 3 passages) :
 *
 *   | réglage                                  | musique avant / pendant / après la voix |
 *   | seuil 0,02 · rapport 8 · 20 ms · 400 ms  | -22,2 / -30,9 / -23,7 dB (baisse 7,2 à 8,7) |
 *   | seuil 0,02 · rapport 20 · 20 ms · 400 ms | -22,1 / -31,3 / -23,7 dB                |
 *   | seuil 0,01 · rapport 20 · 10 ms · 300 ms | -22,1 / -32,9 / -23,7 dB (baisse 9,2 à 10,8) · retenu |
 *
 * La voix, elle, ressort à -16,8 dB dans sa fenêtre, -46 à -48 dB hors d'elle.
 */
export const DOSAGE_SON = {
  compression: 'threshold=0.01:ratio=20:attack=10:release=300',
  normalisation: 'I=-16:TP=-1.5:LRA=11',
} as const;

/**
 * Délai d'un assemblage. Mesures (conteneur de développement, 4 cœurs, ffmpeg
 * 6.1.1, preset veryfast, 2 passages) :
 *
 *   | plans de 5 s, 1080×1920, 30 i/s | durée     |
 *   | 3                               | 4,7-5,1 s |
 *   | 6                               | 10,2-10,6 s |
 *   | 12 (maximum, `PLANS_RENDU_MAX`) | 19,0-20,0 s |
 *
 * 180 s laissent un facteur 9 sur la pire mesure (VPS plus lent, chargé).
 */
export const DELAI_ASSEMBLAGE_MS = 180_000;
/** Plafond du fichier produit lu en mémoire. */
export const OCTETS_MAX_RENDU = 256 * 1024 * 1024;

function lancer(bin: string, args: string[], o: { delaiMs: number; env?: NodeJS.ProcessEnv }): Promise<{ code: number | null; stdout: string; stderr: string; absent: boolean }> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: o.delaiMs, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024, env: o.env ?? process.env, windowsHide: true }, (err, stdout, stderr) => {
      const absent = !!err && (err as NodeJS.ErrnoException).code === 'ENOENT';
      resolve({ code: err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), absent });
    });
  });
}

const s = (ms: number) => (ms / 1000).toFixed(3);

/**
 * Durée RÉELLE d'un segment vidéo, en secondes (6 décimales) · `trim` garde les
 * images d'horodatage < durée, soit ⌈durée × fps⌉ images. La piste audio du
 * segment est tenue à CETTE durée : sans cela, un plan de 3,010 s à 30 i/s
 * (91 images, 3,033 s) décalerait la voix de 23 ms à chaque plan.
 */
export function dureeSegmentS(dureeMs: number, fps: string): string {
  const [num, den] = fps.split('/').map(Number) as [number, number];
  const images = Math.ceil(Number(s(dureeMs)) * num / den - 1e-9);
  return ((images * den) / num).toFixed(6);
}

/** Durée réelle du montage (somme des segments arrondis à l'image), en secondes (6 décimales). */
export function dureeTotaleS(dureesMs: readonly number[], fps: string): string {
  return dureesMs.reduce((t, ms) => t + Number(dureeSegmentS(ms, fps)), 0).toFixed(6);
}

/** Le graphe de filtres ffmpeg · exporté pour être relu par les tests. */
export function grapheAssemblage(e: {
  n: number; dureesMs: number[]; largeur: number; hauteur: number; fps: string; musique: boolean; gainDb: number; totalMs: number;
  /** Segment par segment : la prise a-t-elle du son à garder ? Absent ou tout faux ⇒ graphe d'avant, à l'identique. */
  sonDesSegments?: readonly boolean[];
}): string {
  const parts: string[] = [];
  for (let i = 0; i < e.n; i++) {
    const d = s(e.dureesMs[i]!);
    parts.push(`[${i}:v]fps=${e.fps},scale=${e.largeur}:${e.hauteur}:force_original_aspect_ratio=decrease,pad=${e.largeur}:${e.hauteur}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},setpts=PTS-STARTPTS[v${i}]`);
  }
  const t = s(e.totalMs);
  const fondu = s(Math.max(0, e.totalMs - 500));
  const musique = (sortie: string) => `[${e.n}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${e.gainDb}dB,atrim=duration=${t},apad=whole_dur=${t},afade=t=out:st=${fondu}:d=0.5[${sortie}]`;
  const son = e.sonDesSegments ?? [];
  if (!son.some(Boolean)) {
    // Aucune prise sonore · le graphe d'avant, caractère pour caractère.
    parts.push(`${Array.from({ length: e.n }, (_, i) => `[v${i}]`).join('')}concat=n=${e.n}:v=1:a=0[v]`);
    parts.push(e.musique ? musique('a') : `[${e.n}:a]atrim=duration=${t}[a]`);
    return parts.join(';');
  }
  // Le son de chaque prise, tenu à la durée réelle de son segment vidéo.
  const format = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
  for (let i = 0; i < e.n; i++) {
    const d = dureeSegmentS(e.dureesMs[i]!, e.fps);
    parts.push(son[i]
      ? `[${i}:a]aresample=48000:async=1:first_pts=0,${format},atrim=duration=${d},apad=whole_dur=${d},asetpts=PTS-STARTPTS[a${i}]`
      : `anullsrc=r=48000:cl=stereo,${format},atrim=duration=${d},asetpts=PTS-STARTPTS[a${i}]`);
  }
  parts.push(`${Array.from({ length: e.n }, (_, i) => `[v${i}][a${i}]`).join('')}concat=n=${e.n}:v=1:a=1[v][voix]`);
  // `loudnorm` travaille par trames de 100 ms : sur un total qui n'en est pas un multiple, il décale la fin
  // de la piste (voix à 2,097 s au lieu de 2,033 s, mesuré) et la raccourcit. La piste est donc complétée
  // de silence jusqu'aux 100 ms suivantes AVANT lui, puis recoupée au total exact APRÈS.
  const total = dureeTotaleS(e.dureesMs, e.fps);
  const totalS = Number(total);
  const pad = (Math.ceil(Math.round(totalS * 1e6) / 1e5) / 10).toFixed(1);
  const fin = `apad=whole_dur=${pad},loudnorm=${DOSAGE_SON.normalisation},aresample=48000,${format},atrim=duration=${total},asetpts=PTS-STARTPTS[a]`;
  if (e.musique) {
    parts.push(musique('mus'));
    parts.push('[voix]asplit=2[voixmix][voixsc]');
    parts.push(`[mus]${format}[mus48]`);
    parts.push(`[mus48][voixsc]sidechaincompress=${DOSAGE_SON.compression}[musbas]`);
    parts.push(`[voixmix][musbas]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,${fin}`);
  } else {
    parts.push(`[voix]${fin}`);
  }
  return parts.join(';');
}

/**
 * Écart toléré entre bande son et images, en plus d'une image · une trame AAC
 * (1 024 échantillons à 48 kHz = 21,3 ms) d'amorce ou de fin.
 */
export const ECART_AAC_MS = 22;

/**
 * La prise a-t-elle du son ? · lu sur le fichier : piste audio (ffprobe) puis
 * crête (`volumedetect`). `false` pour un fichier sans piste, à piste muette ou
 * illisible (ffmpeg le refusera au montage) ; `'absent'` si un binaire manque.
 */
export async function sonDeLaPrise(fichier: string, o: { ffmpeg: string; ffprobe: string; delaiMs: number; env?: NodeJS.ProcessEnv; /** Partie MONTÉE (s) · le son au-delà n'entre pas au montage. */ dureeS?: string }): Promise<boolean | 'absent'> {
  const p = await lancer(o.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'mp4', '-show_entries', 'stream=codec_type', '-of', 'json', fichier], o);
  if (p.absent) return 'absent';
  let flux: Array<{ codec_type?: string }> = [];
  try { flux = (JSON.parse(p.stdout) as { streams?: Array<{ codec_type?: string }> }).streams ?? []; } catch { return false; }
  if (p.code !== 0 || !flux.some((x) => x.codec_type === 'audio')) return false;
  const v = await lancer(o.ffmpeg, ['-nostdin', '-hide_banner', '-v', 'info', '-nostats', '-protocol_whitelist', 'file', '-f', 'mp4', '-i', fichier, ...(o.dureeS ? ['-t', o.dureeS] : []), '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], o);
  if (v.absent) return 'absent';
  if (v.code !== 0) return false;
  const m = /max_volume:\s*(-?\d+(?:\.\d+)?|-inf) dB/.exec(v.stderr);
  return !!m && m[1] !== '-inf' && Number(m[1]) > SEUIL_SILENCE_DB;
}

export async function assemblerVideoFfmpeg(e: EntreeAssemblage, o: OptionsAssemblage = {}): Promise<ResultatAssemblage> {
  const ffmpeg = o.ffmpeg ?? 'ffmpeg';
  const ffprobe = o.ffprobe ?? 'ffprobe';
  const delaiMs = o.delaiMs ?? DELAI_ASSEMBLAGE_MS;
  if (e.segments.length === 0) return { ok: false, motif: 'aucun plan à assembler', cause: 'entree' };
  if (e.largeur % 2 || e.hauteur % 2 || e.largeur < 16 || e.hauteur < 16) return { ok: false, motif: 'dimensions invalides', cause: 'entree' };
  if (!(e.fps.num > 0 && e.fps.den > 0)) return { ok: false, motif: 'débit d’images invalide', cause: 'entree' };
  const totalMs = e.segments.reduce((t, x) => t + x.dureeMs, 0);
  const dossier = await mkdtemp(join(tmpdir(), 'tt-rendu-'));
  try {
    const args: string[] = ['-nostdin', '-hide_banner', '-v', 'error', '-y'];
    const sonDesSegments: boolean[] = [];
    for (let i = 0; i < e.segments.length; i++) {
      const f = join(dossier, `plan-${i}.mp4`);
      await writeFile(f, e.segments[i]!.octets, { mode: 0o600 });
      args.push('-protocol_whitelist', 'file', '-f', 'mp4', '-i', f);
      // Le son de la prise, lu sur le MÉDIA LIVRÉ · un clip illisible est laissé à ffmpeg, qui le refusera.
      const son = await sonDeLaPrise(f, { ffmpeg, ffprobe, delaiMs, env: o.env, dureeS: dureeSegmentS(e.segments[i]!.dureeMs, `${e.fps.num}/${e.fps.den}`) });
      if (son === 'absent') return { ok: false, motif: 'ffprobe absent du serveur · le son des prises ne peut pas être lu', cause: 'binaire' };
      sonDesSegments.push(son === true);
    }
    if (e.musique) {
      const f = join(dossier, 'musique.bin');
      await writeFile(f, e.musique.octets, { mode: 0o600 });
      args.push('-protocol_whitelist', 'file', '-i', f);
    } else {
      args.push('-f', 'lavfi', '-t', s(totalMs), '-i', 'anullsrc=r=48000:cl=stereo');
    }
    const fps = `${e.fps.num}/${e.fps.den}`;
    const sortie = join(dossier, 'final.mp4');
    args.push(
      '-filter_complex', grapheAssemblage({ n: e.segments.length, dureesMs: e.segments.map((x) => x.dureeMs), largeur: e.largeur, hauteur: e.hauteur, fps, musique: !!e.musique, gainDb: e.musique?.gainDb ?? 0, totalMs, sonDesSegments }),
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', fps, '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      // Avec le son des prises, la sortie dure ce que durent vraiment les images (arrondies à l'image) · sinon comme avant.
      '-movflags', '+faststart', '-t', sonDesSegments.some(Boolean) ? dureeTotaleS(e.segments.map((x) => x.dureeMs), fps) : s(totalMs), '-f', 'mp4', sortie,
    );
    const r = await lancer(ffmpeg, args, { delaiMs, env: o.env });
    if (r.absent) return { ok: false, motif: 'ffmpeg absent du serveur · aucun assemblage possible', cause: 'binaire' };
    // Un filtre absent de CE ffmpeg (paquet du serveur) · dit et nommé, ce n'est pas une erreur du projet.
    const filtre = /No such filter: '([\w-]+)'/.exec(r.stderr)?.[1];
    if (r.code !== 0 && filtre) return { ok: false, motif: `filtre audio ${filtre} absent de ffmpeg sur ce serveur`, cause: 'filtre' };
    if (r.code !== 0) return { ok: false, motif: `ffmpeg a refusé l’assemblage · ${r.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 400) || `code ${r.code}`}`, cause: 'rendu' };
    const taille = (await stat(sortie).catch(() => null))?.size ?? 0;
    if (taille === 0 || taille > OCTETS_MAX_RENDU) return { ok: false, motif: `fichier produit vide ou trop volumineux (${taille} octets)`, cause: 'verification' };

    // Relecture du fichier produit · jamais supposé conforme.
    const p = await lancer(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'mp4', '-show_entries', 'stream=codec_type,codec_name,width,height,duration:format=duration', '-of', 'json', sortie], { delaiMs, env: o.env });
    if (p.absent) return { ok: false, motif: 'ffprobe absent du serveur · le fichier produit ne peut pas être vérifié', cause: 'binaire' };
    let info: { streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string }>; format?: { duration?: string } } = {};
    try { info = JSON.parse(p.stdout); } catch { return { ok: false, motif: 'relecture du fichier produit illisible', cause: 'verification' }; }
    const video = info.streams?.find((x) => x.codec_type === 'video');
    const audio = info.streams?.find((x) => x.codec_type === 'audio');
    const dureeMs = Math.round(Number(info.format?.duration ?? 'NaN') * 1000);
    const uneImageMs = (1000 * e.fps.den) / e.fps.num;
    if (!video || video.codec_name !== 'h264' || !audio || audio.codec_name !== 'aac') return { ok: false, motif: 'flux vidéo H.264 ou audio AAC absent du fichier produit', cause: 'verification' };
    if (video.width !== e.largeur || video.height !== e.hauteur) return { ok: false, motif: `dimensions produites ${video.width}×${video.height}, attendues ${e.largeur}×${e.hauteur}`, cause: 'verification' };
    if (!Number.isFinite(dureeMs) || Math.abs(dureeMs - totalMs) > uneImageMs + 100) return { ok: false, motif: `durée produite ${dureeMs} ms, attendue ${totalMs} ms`, cause: 'verification' };
    // La bande son couvre les images · une voix décalée ou coupée ne sort jamais.
    const dureeVideoMs = Math.round(Number(video.duration ?? 'NaN') * 1000);
    const dureeAudioMs = Math.round(Number(audio.duration ?? 'NaN') * 1000);
    if (!Number.isFinite(dureeAudioMs) || !Number.isFinite(dureeVideoMs) || Math.abs(dureeAudioMs - dureeVideoMs) > uneImageMs + ECART_AAC_MS) {
      return { ok: false, motif: `bande son de ${dureeAudioMs} ms pour ${dureeVideoMs} ms d’images`, cause: 'verification' };
    }
    const octets = new Uint8Array(await readFile(sortie));
    let chemin: string | null = null;
    if (o.dossierSortie) {
      chemin = join(o.dossierSortie, NOM_MP4_ASSEMBLE);
      await writeFile(chemin, octets, { mode: 0o600 });
    }
    return { ok: true, octets, mesure: { largeur: video.width!, hauteur: video.height!, dureeMs, dureeAudioMs, sonDesSegments }, chemin };
  } finally {
    await rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
}
