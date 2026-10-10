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
 *  · les plans sont mis bout à bout ; la bande son est la musique à son gain,
 *    coupée à la durée et fondue en sortie, ou un silence stéréo ;
 *  · `+faststart` (lecture progressive).
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
export type ResultatAssemblage =
  | { ok: true; octets: Uint8Array; mesure: { largeur: number; hauteur: number; dureeMs: number } }
  | { ok: false; motif: string; cause: 'binaire' | 'entree' | 'rendu' | 'verification' };

export interface OptionsAssemblage { ffmpeg?: string; ffprobe?: string; delaiMs?: number; env?: NodeJS.ProcessEnv }

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

/** Le graphe de filtres ffmpeg · exporté pour être relu par les tests. */
export function grapheAssemblage(e: { n: number; dureesMs: number[]; largeur: number; hauteur: number; fps: string; musique: boolean; gainDb: number; totalMs: number }): string {
  const parts: string[] = [];
  for (let i = 0; i < e.n; i++) {
    const d = s(e.dureesMs[i]!);
    parts.push(`[${i}:v]fps=${e.fps},scale=${e.largeur}:${e.hauteur}:force_original_aspect_ratio=decrease,pad=${e.largeur}:${e.hauteur}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},setpts=PTS-STARTPTS[v${i}]`);
  }
  parts.push(`${Array.from({ length: e.n }, (_, i) => `[v${i}]`).join('')}concat=n=${e.n}:v=1:a=0[v]`);
  const t = s(e.totalMs);
  const fondu = s(Math.max(0, e.totalMs - 500));
  parts.push(e.musique
    ? `[${e.n}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${e.gainDb}dB,atrim=duration=${t},apad=whole_dur=${t},afade=t=out:st=${fondu}:d=0.5[a]`
    : `[${e.n}:a]atrim=duration=${t}[a]`);
  return parts.join(';');
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
    for (let i = 0; i < e.segments.length; i++) {
      const f = join(dossier, `plan-${i}.mp4`);
      await writeFile(f, e.segments[i]!.octets, { mode: 0o600 });
      args.push('-protocol_whitelist', 'file', '-f', 'mp4', '-i', f);
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
      '-filter_complex', grapheAssemblage({ n: e.segments.length, dureesMs: e.segments.map((x) => x.dureeMs), largeur: e.largeur, hauteur: e.hauteur, fps, musique: !!e.musique, gainDb: e.musique?.gainDb ?? 0, totalMs }),
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', fps, '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart', '-t', s(totalMs), '-f', 'mp4', sortie,
    );
    const r = await lancer(ffmpeg, args, { delaiMs, env: o.env });
    if (r.absent) return { ok: false, motif: 'ffmpeg absent du serveur · aucun assemblage possible', cause: 'binaire' };
    if (r.code !== 0) return { ok: false, motif: `ffmpeg a refusé l’assemblage · ${r.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 400) || `code ${r.code}`}`, cause: 'rendu' };
    const taille = (await stat(sortie).catch(() => null))?.size ?? 0;
    if (taille === 0 || taille > OCTETS_MAX_RENDU) return { ok: false, motif: `fichier produit vide ou trop volumineux (${taille} octets)`, cause: 'verification' };

    // Relecture du fichier produit · jamais supposé conforme.
    const p = await lancer(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'mp4', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', sortie], { delaiMs, env: o.env });
    if (p.absent) return { ok: false, motif: 'ffprobe absent du serveur · le fichier produit ne peut pas être vérifié', cause: 'binaire' };
    let info: { streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>; format?: { duration?: string } } = {};
    try { info = JSON.parse(p.stdout); } catch { return { ok: false, motif: 'relecture du fichier produit illisible', cause: 'verification' }; }
    const video = info.streams?.find((x) => x.codec_type === 'video');
    const audio = info.streams?.find((x) => x.codec_type === 'audio');
    const dureeMs = Math.round(Number(info.format?.duration ?? 'NaN') * 1000);
    const uneImageMs = (1000 * e.fps.den) / e.fps.num;
    if (!video || video.codec_name !== 'h264' || !audio || audio.codec_name !== 'aac') return { ok: false, motif: 'flux vidéo H.264 ou audio AAC absent du fichier produit', cause: 'verification' };
    if (video.width !== e.largeur || video.height !== e.hauteur) return { ok: false, motif: `dimensions produites ${video.width}×${video.height}, attendues ${e.largeur}×${e.hauteur}`, cause: 'verification' };
    if (!Number.isFinite(dureeMs) || Math.abs(dureeMs - totalMs) > uneImageMs + 100) return { ok: false, motif: `durée produite ${dureeMs} ms, attendue ${totalMs} ms`, cause: 'verification' };
    return { ok: true, octets: new Uint8Array(await readFile(sortie)), mesure: { largeur: video.width!, hauteur: video.height!, dureeMs } };
  } finally {
    await rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
}
