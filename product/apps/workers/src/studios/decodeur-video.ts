import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TIMEBASE_VIDEO, type ImageExtraite, type InfosVideo, type ResultatDecodage } from '@tiktrends/core';

/**
 * Décodeur VIDÉO réel du worker (L7-B) · ffprobe PUIS ffmpeg.
 *
 * ffprobe seul ne prouve rien : il lit les en-têtes du conteneur, comme le
 * premier filtre pur (`inspecterMedia`). Un MP4 aux boîtes parfaites mais à la
 * charge utile abîmée passe ffprobe. Ici, chaque vidéo est LUE EN ENTIER :
 *
 *  1. ffprobe · flux vidéo présent, codec, dimensions, durée, images annoncées,
 *     débit d'images rationnel, piste audio éventuelle ;
 *  2. ffmpeg · décodage COMPLET de toutes les images (et de l'audio) :
 *     `-xerror -err_detect explode`, et la moindre ligne d'erreur ⇒ refus
 *     `cause: 'contenu'`. Les images décodées sont COMPTÉES (`framecrc`) et
 *     comparées à celles qu'annonce le conteneur ;
 *  3. images début, milieu, fin extraites en PNG, puis décodées pixel par
 *     pixel par sharp (`failOn: 'warning'`) : des pixels, pas un en-tête ;
 *  4. audio · crête mesurée (`volumedetect`), saturation signalée.
 *
 * Binaire absent (ENOENT) ⇒ `cause: 'decodeur'` : le média reste en attente,
 * comme sharp absent. Processus enfants SANS shell (`execFile`, arguments en
 * tableau), délai borné et tué par SIGKILL, sortie bornée, entrée par fichier
 * temporaire (mode 600) supprimé dans `finally`. Le démultiplexeur est FORCÉ
 * (`-f mp4`, protocole `file` seul) : un fichier ne peut pas se faire passer
 * pour une liste de lecture qui irait lire ailleurs.
 */

export interface OptionsDecodeurVideo {
  /** Chemins des binaires · défaut : `ffmpeg`/`ffprobe` du PATH. */
  ffmpeg?: string;
  ffprobe?: string;
  /** Délai par processus enfant. */
  delaiMs?: number;
  /** Taille maximale lue. */
  octetsMax?: number;
  /** Environnement des processus enfants (tests : PATH vidé). */
  env?: NodeJS.ProcessEnv;
}

/**
 * Mesures (conteneur de développement, 4 cœurs, ffmpeg 6.1.1, 3 passages,
 * min-max) :
 *
 *   | vidéo                              | ffprobe       | décodage complet |
 *   | 64×48, 24 i/s, 1 s, H.264          | 0,05-0,06 s   | 0,06 s           |
 *   | 1080×1920, 30 i/s, 10 s, H.264+AAC | 0,06-0,08 s   | 1,15-1,29 s      |
 *
 * Un clip de fournisseur dure au plus une dizaine de secondes : 60 s laissent
 * une marge d'un facteur 45 sur la plus lourde mesure (VPS plus lent, chargé).
 */
export const DELAI_PROCESSUS_VIDEO_MS = 60_000;
/** Le plafond de relecture du worker (sortie fal, 64 Mio). */
export const OCTETS_MAX_VIDEO = 64 * 1024 * 1024;
/** Sortie texte d'un processus enfant (une ligne `framecrc` par image ≈ 80 octets). */
const SORTIE_MAX = 16 * 1024 * 1024;
const ARGS_ENTREE = ['-nostdin', '-hide_banner', '-protocol_whitelist', 'file', '-f', 'mp4'] as const;

type Sortie = { code: number; stdout: string; stderr: string; absent: boolean; delai: boolean };

function lancer(bin: string, args: readonly string[], o: { delaiMs: number; env?: NodeJS.ProcessEnv }): Promise<Sortie> {
  return new Promise((resolve) => {
    execFile(bin, [...args], { timeout: o.delaiMs, killSignal: 'SIGKILL', maxBuffer: SORTIE_MAX, windowsHide: true, env: o.env ?? process.env, encoding: 'utf8' }, (err, stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null;
      resolve({
        code: e ? (typeof e.code === 'number' ? e.code : -1) : 0,
        stdout: String(stdout ?? ''), stderr: String(stderr ?? ''),
        absent: e?.code === 'ENOENT',
        delai: !!e?.killed,
      });
    });
  });
}

const premiereLigne = (t: string) => (t.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, 200);
const refus = (raison: string): ResultatDecodage => ({ ok: false, cause: 'contenu', raison });
const indisponible = (bin: string): ResultatDecodage => ({ ok: false, cause: 'decodeur', raison: `décodeur vidéo indisponible · ${bin} introuvable` });

/** « 24/1 » → { num: 24, den: 1 } · `null` si illisible ou nul. */
export function fpsRationnel(t: unknown): { num: number; den: number } | null {
  const m = typeof t === 'string' ? /^(\d+)\/(\d+)$/.exec(t) : null;
  if (!m) return null;
  const num = Number(m[1]);
  const den = Number(m[2]);
  return num > 0 && den > 0 ? { num, den } : null;
}

/** Secondes décimales de ffprobe (« 1.000000 ») → ticks entiers, sans flottant cumulé. */
export function secondesVersTicks(t: unknown): number | null {
  const m = typeof t === 'string' ? /^(\d+)(?:\.(\d{1,9}))?$/.exec(t) : null;
  if (!m) return null;
  const frac = (m[2] ?? '').padEnd(6, '0').slice(0, 6);
  return Number(m[1]) * TIMEBASE_VIDEO + Number(frac);
}

interface FluxProbe { codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string; avg_frame_rate?: string; duration?: string; nb_frames?: string }

export async function decoderVideoFfmpeg(octets: Uint8Array, o: OptionsDecodeurVideo = {}): Promise<ResultatDecodage> {
  const ffmpeg = o.ffmpeg ?? 'ffmpeg';
  const ffprobe = o.ffprobe ?? 'ffprobe';
  const delaiMs = o.delaiMs ?? DELAI_PROCESSUS_VIDEO_MS;
  const max = o.octetsMax ?? OCTETS_MAX_VIDEO;
  if (octets.length === 0) return refus('vidéo vide');
  if (octets.length > max) return refus(`vidéo trop volumineuse · ${octets.length} octets, plafond ${max}`);

  let dossier: string | null = null;
  try {
    dossier = await mkdtemp(join(tmpdir(), 'tt-video-'));
    const entree = join(dossier, 'entree.mp4');
    await writeFile(entree, octets, { mode: 0o600 });
    const run = (bin: string, args: readonly string[]) => lancer(bin, args, { delaiMs, env: o.env });

    // 1 · ffprobe : ce que le conteneur ANNONCE.
    const p = await run(ffprobe, ['-v', 'error', ...ARGS_ENTREE.slice(2), '-of', 'json', '-show_streams', '-show_format', entree]);
    if (p.absent) return indisponible(ffprobe);
    if (p.delai) return refus(`ffprobe · délai de ${delaiMs} ms dépassé`);
    if (p.code !== 0 || p.stderr.trim()) return refus(`ffprobe refuse · ${premiereLigne(p.stderr) || `code ${p.code}`}`);
    let flux: FluxProbe[];
    try { flux = ((JSON.parse(p.stdout) as { streams?: FluxProbe[] }).streams ?? []); } catch { return refus('ffprobe · sortie illisible'); }
    const v = flux.find((f) => f.codec_type === 'video');
    const a = flux.find((f) => f.codec_type === 'audio');
    if (!v) return refus('aucun flux vidéo');
    const largeur = Number(v.width);
    const hauteur = Number(v.height);
    if (!(largeur > 0 && hauteur > 0)) return refus('flux vidéo sans dimensions');
    const fps = fpsRationnel(v.avg_frame_rate) ?? fpsRationnel(v.r_frame_rate);
    if (!fps) return refus('débit d’images illisible');
    const imagesAnnoncees = typeof v.nb_frames === 'string' && /^\d+$/.test(v.nb_frames) ? Number(v.nb_frames) : null;

    // 2 · ffmpeg : TOUTES les images (et l'audio) décodées, comptées.
    const d = await run(ffmpeg, ['-v', 'error', '-xerror', '-err_detect', 'explode', ...ARGS_ENTREE, '-i', entree, '-map', '0:v:0', ...(a ? ['-map', '0:a:0'] : []), '-f', 'framecrc', '-']);
    if (d.absent) return indisponible(ffmpeg);
    if (d.delai) return refus(`décodage · délai de ${delaiMs} ms dépassé`);
    if (d.code !== 0 || d.stderr.trim()) return refus(`décodage refusé · ${premiereLigne(d.stderr) || `code ${d.code}`}`);
    const lignes = d.stdout.split('\n').filter((l) => l && !l.startsWith('#'));
    const images = lignes.filter((l) => l.startsWith('0,')).length;
    const echantillonsAudio = lignes.filter((l) => l.startsWith('1,')).length;
    if (images === 0) return refus('aucune image décodée');
    if (imagesAnnoncees !== null && imagesAnnoncees !== images) return refus(`lecture incomplète · ${images} images décodées sur ${imagesAnnoncees} annoncées`);
    if (a && echantillonsAudio === 0) return refus('piste audio annoncée, aucun échantillon décodé');
    // Durée = images décodées / débit, en ticks entiers.
    const dureeTicks = Number((BigInt(images) * BigInt(TIMEBASE_VIDEO) * BigInt(fps.den)) / BigInt(fps.num));

    // 3 · images début, milieu, fin · PNG, puis pixels décodés par sharp.
    const rangs = [...new Set([0, Math.floor((images - 1) / 2), images - 1])];
    const choix = rangs.map((r) => `eq(n\\,${r})`).join('+');
    const x = await run(ffmpeg, ['-v', 'error', '-xerror', ...ARGS_ENTREE, '-i', entree, '-map', '0:v:0', '-vf', `select=${choix}`, '-fps_mode', 'passthrough', '-c:v', 'png', '-f', 'image2', join(dossier, 'extrait-%03d.png')]);
    if (x.absent) return indisponible(ffmpeg);
    if (x.delai) return refus(`extraction · délai de ${delaiMs} ms dépassé`);
    if (x.code !== 0 || x.stderr.trim()) return refus(`extraction refusée · ${premiereLigne(x.stderr) || `code ${x.code}`}`);
    const fichiers = (await readdir(dossier)).filter((f) => f.startsWith('extrait-')).sort();
    if (fichiers.length !== rangs.length) return refus(`images début, milieu, fin · ${fichiers.length} extraites sur ${rangs.length}`);
    let sharp: typeof import('sharp');
    try {
      ({ default: sharp } = await import('sharp'));
    } catch (e) {
      return { ok: false, cause: 'decodeur', raison: `décodeur d'images indisponible · ${(e as Error).message}` };
    }
    const extraits: ImageExtraite[] = [];
    for (const [i, f] of fichiers.entries()) {
      try {
        const { data, info } = await sharp(await readFile(join(dossier, f)), { failOn: 'warning' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const somme = new Array<number>(info.channels).fill(0);
        for (let k = 0; k < data.length; k++) somme[k % info.channels]! += data[k]!;
        const n = info.width * info.height;
        extraits.push({ rang: rangs[i]!, largeur: info.width, hauteur: info.height, canaux: info.channels, octetsPixels: data.length, moyenne: somme.map((s) => Math.round(s / n)) });
      } catch (e) {
        return refus(`image ${rangs[i]} extraite illisible · ${((e as Error).message ?? '').split('\n')[0]!.slice(0, 160)}`);
      }
    }

    // 4 · audio · crête et saturation.
    let audio: InfosVideo['audio'] = null;
    if (a) {
      const s = await run(ffmpeg, ['-v', 'info', '-nostats', ...ARGS_ENTREE, '-i', entree, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-']);
      if (s.absent) return indisponible(ffmpeg);
      if (s.delai || s.code !== 0) return refus(`audio · mesure de crête impossible (${s.delai ? 'délai dépassé' : `code ${s.code}`})`);
      const m = /max_volume:\s*(-?\d+(?:\.\d+)?|-inf) dB/.exec(s.stderr);
      const crete = m && m[1] !== '-inf' ? Number(m[1]) : null;
      audio = { codec: String(a.codec_name ?? 'inconnu'), dureeTicks: secondesVersTicks(a.duration), creteDb: crete, sature: crete !== null && crete >= 0 };
    }

    const video: InfosVideo = { codec: String(v.codec_name ?? 'inconnu'), fps, images, imagesAnnoncees, dureeTicks, audio, extraits };
    const canaux = extraits[0]!.canaux;
    return { ok: true, largeur, hauteur, canaux, octetsPixels: extraits.reduce((t, e) => t + e.octetsPixels, 0), video };
  } catch (e) {
    return { ok: false, cause: 'decodeur', raison: `décodeur vidéo en panne · ${((e as Error).message ?? '').slice(0, 160)}` };
  } finally {
    if (dossier) await rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
}
