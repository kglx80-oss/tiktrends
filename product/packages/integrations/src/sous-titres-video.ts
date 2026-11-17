import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConstatSousTitres } from '@tiktrends/core';

/**
 * Studios · passe SÉPARÉE des sous-titres · brûle un fichier ASS (libass,
 * filtre `ass` d'ffmpeg) dans un MP4 déjà assemblé, puis RELIT le fichier
 * produit pour dire si le texte est réellement sur l'image.
 *
 * L'assemblage (`rendu-video.ts`) n'est pas touché : cette passe prend ses
 * octets en entrée et rend d'autres octets, la piste audio copiée telle
 * quelle. Les polices viennent du dossier `fontsdir` (les fichiers Liberation
 * Sans du dépôt) : l'image Alpine n'a aucune police système, et une police de
 * repli dessinerait d'autres métriques que la mise en page calculée.
 *
 * ── Constat lu dans le fichier, jamais un drapeau ────────────────────────────
 *
 * Pour quelques cartons (premier, milieu, dernier), l'image à mi-carton est
 * extraite de l'entrée ET de la sortie (niveaux de gris) : dans la bande du
 * texte, des pixels doivent avoir changé (`PIXELS_TEXTE_MIN`), et dans les
 * 20 % bas (zone laissée libre) presque aucun (`PIXELS_ZONE_LIBRE_MAX`). Hors
 * carton, la même bande ne doit presque pas changer : seul le bruit du
 * réencodage y est toléré.
 *
 * Mêmes précautions que l'assemblage : processus SANS shell, délai borné et
 * SIGKILL, dossier temporaire privé supprimé, entrées limitées au protocole
 * `file`, binaire absent ⇒ refus dit.
 */

export interface EntreeSousTitres {
  /**
   * Le MP4 assemblé · ses octets, OU le chemin du fichier que l'assemblage a
   * laissé sur disque (lu tel quel, jamais modifié). Exactement l'un des deux.
   */
  octets?: Uint8Array;
  chemin?: string;
  ass: string;
  largeur: number;
  hauteur: number;
  dureeMs: number;
  fps: { num: number; den: number };
  /** Bande du texte · [haut, bas[ en pixels (`miseEnPageSousTitres(...).zone`). */
  zone: { haut: number; bas: number };
  /** Instants à contrôler · un par carton retenu (mi-carton), et des instants SANS carton. */
  controles: { avecTexteMs: number[]; sansTexteMs: number[] };
  /** Dossier des polices (`sans-700.ttf`). */
  dossierPolices: string;
}

export type ResultatSousTitresVideo =
  | { ok: true; octets: Uint8Array; constat: ConstatSousTitres & { brules: true }; mesures: MesureImage[]; /** Durée RELUE du fichier brûlé (même que l'entrée à une image près, sinon refus). */ dureeMs: number }
  | {
    ok: false; motif: string; cause: 'binaire' | 'entree' | 'rendu' | 'verification'; constat: ConstatSousTitres & { brules: false }; mesures: MesureImage[];
    /** Fin de la sortie d'erreur d'ffmpeg · pour le JOURNAL du serveur seulement, jamais montrée à l'écran. */
    detail?: string;
  };

export interface MesureImage { instantMs: number; carton: boolean; pixelsTexte: number; pixelsZoneLibre: number }

export interface OptionsSousTitres { ffmpeg?: string; ffprobe?: string; delaiMs?: number; env?: NodeJS.ProcessEnv }

/**
 * Écart de gris qui fait un pixel « changé » · un trait de texte blanc à
 * contour noir s'écarte de l'image de plus de 100 niveaux ; le bruit du
 * réencodage (crf 20) reste sous 30 (mesures ci-dessous).
 */
export const ECART_GRIS_PIXEL = 64;
/**
 * Seuils MESURÉS (`packages/integrations/test/sous-titres-video.test.ts`,
 * ffmpeg 6.1.1, libx264 crf 20, preset veryfast, 2026-11-16), pixels changés
 * de plus de `ECART_GRIS_PIXEL` :
 *
 *   | image                                   | bande du texte | 20 % bas |
 *   |-----------------------------------------|----------------|----------|
 *   | 360×640, mire, carton « Un test »       |          1 102 |        0 |
 *   | 360×640, mire, hors carton              |              0 |        0 |
 *   | 360×640, aplat, carton « Un test »      |          1 409 |        0 |
 *   | 1080×1920, mire, carton « Un test »     |         10 856 |        0 |
 *   | 1080×1920, mire, hors carton            |              0 |        0 |
 *   | 360×640, mire, police absente           |              0 |        0 |
 *
 * Le plus petit carton mesuré (2 mots courts, 360×640) change 1 102 pixels ;
 * hors carton et sans police, 0. `PIXELS_TEXTE_MIN = 200` garde un facteur
 * 5,5 sous ce carton et reste très au-dessus du bruit (0). Dans la zone libre,
 * 0 partout : `PIXELS_ZONE_LIBRE_MAX = 20` tolère quelques pixels de bruit.
 */
export const PIXELS_TEXTE_MIN = 200;
export const PIXELS_ZONE_LIBRE_MAX = 20;
/** Hors carton, la bande du texte peut porter un peu de bruit de réencodage, jamais un carton. */
export const PIXELS_HORS_CARTON_MAX = 50;

/**
 * Délai d'une passe · même ordre que l'assemblage (une passe d'encodage, puis
 * quelques extractions d'image) : 180 s comme `DELAI_ASSEMBLAGE_MS`.
 */
export const DELAI_SOUS_TITRES_MS = 180_000;
const OCTETS_MAX = 256 * 1024 * 1024;

function lancer(bin: string, args: string[], o: { delaiMs: number; env?: NodeJS.ProcessEnv; binaire?: boolean }): Promise<{ code: number | null; stdout: Buffer; stderr: string; absent: boolean }> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: o.delaiMs, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024, env: o.env ?? process.env, windowsHide: true, encoding: 'buffer' }, (err, stdout, stderr) => {
      const absent = !!err && (err as NodeJS.ErrnoException).code === 'ENOENT';
      resolve({ code: err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0, stdout: Buffer.from(stdout ?? []), stderr: String(stderr ?? ''), absent });
    });
  });
}

/** Un chemin dans un filtre ffmpeg · entre apostrophes ; un chemin qui en contient (ou une barre inverse, un saut de ligne) est refusé. */
export function cheminFiltre(p: string): string | null {
  return /['\\\n\r]/.test(p) ? null : `'${p}'`;
}

/** Le filtre de brûlure · exporté pour être relu par les tests. `null` si un chemin n'est pas sûr. */
export function filtreSousTitres(fichierAss: string, dossierPolices: string): string | null {
  const a = cheminFiltre(fichierAss);
  const f = cheminFiltre(dossierPolices);
  return a && f ? `ass=filename=${a}:fontsdir=${f}` : null;
}

/** Une image en niveaux de gris, `largeur × hauteur` octets · `null` si l'extraction échoue. */
export async function imageGrise(ffmpeg: string, fichier: string, instantMs: number, largeur: number, hauteur: number, o: { delaiMs: number; env?: NodeJS.ProcessEnv }): Promise<Uint8Array | null> {
  const r = await lancer(ffmpeg, ['-nostdin', '-hide_banner', '-v', 'error', '-protocol_whitelist', 'file', '-ss', (instantMs / 1000).toFixed(3), '-f', 'mp4', '-i', fichier, '-frames:v', '1', '-vf', 'format=gray', '-f', 'rawvideo', 'pipe:1'], o);
  if (r.code !== 0 || r.stdout.length !== largeur * hauteur) return null;
  return new Uint8Array(r.stdout);
}

/** Pixels qui ont changé de plus de `ECART_GRIS_PIXEL` entre deux images, dans les lignes [haut, bas[. */
export function pixelsChanges(a: Uint8Array, b: Uint8Array, largeur: number, haut: number, bas: number): number {
  let n = 0;
  for (let y = Math.max(0, haut); y < bas; y++) {
    const o = y * largeur;
    for (let x = 0; x < largeur; x++) if (Math.abs(a[o + x]! - b[o + x]!) > ECART_GRIS_PIXEL) n += 1;
  }
  return n;
}

export async function brulerSousTitresFfmpeg(e: EntreeSousTitres, o: OptionsSousTitres = {}): Promise<ResultatSousTitresVideo> {
  const ffmpeg = o.ffmpeg ?? 'ffmpeg';
  const ffprobe = o.ffprobe ?? 'ffprobe';
  const delaiMs = o.delaiMs ?? DELAI_SOUS_TITRES_MS;
  const refus = (cause: 'binaire' | 'entree' | 'rendu' | 'verification', motif: string, mesures: MesureImage[] = []): Extract<ResultatSousTitresVideo, { ok: false }> =>
    ({ ok: false, motif, cause, constat: { brules: false, raison: motif }, mesures });
  if (!e.ass.includes('[Events]') || !/\nDialogue: /.test(e.ass)) return refus('entree', 'aucun carton à brûler');
  if (e.controles.avecTexteMs.length === 0) return refus('entree', 'aucun carton à contrôler');
  if (e.largeur % 2 || e.hauteur % 2 || e.largeur < 16 || e.hauteur < 16) return refus('entree', 'dimensions invalides');
  if (!(e.fps.num > 0 && e.fps.den > 0)) return refus('entree', 'débit d’images invalide');
  if ((e.octets ? 1 : 0) + (e.chemin ? 1 : 0) !== 1) return refus('entree', 'le MP4 assemblé est attendu par ses octets OU par son chemin');
  if (e.chemin && !cheminFiltre(e.chemin)) return refus('entree', 'chemin du MP4 assemblé non sûr');
  const dossier = await mkdtemp(join(tmpdir(), 'tt-sous-titres-'));
  try {
    const entree = e.chemin ?? join(dossier, 'entree.mp4');
    const ass = join(dossier, 'sous-titres.ass');
    const sortie = join(dossier, 'sortie.mp4');
    if (e.octets) await writeFile(entree, e.octets, { mode: 0o600 });
    await writeFile(ass, e.ass, { encoding: 'utf8', mode: 0o600 });
    const fps = `${e.fps.num}/${e.fps.den}`;
    const filtre = filtreSousTitres(ass, e.dossierPolices);
    if (!filtre) return refus('entree', 'chemin de police ou de fichier non sûr pour ffmpeg');
    const r = await lancer(ffmpeg, [
      '-nostdin', '-hide_banner', '-v', 'error', '-y', '-protocol_whitelist', 'file', '-f', 'mp4', '-i', entree,
      '-vf', filtre,
      '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', fps, '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'copy', '-movflags', '+faststart', '-f', 'mp4', sortie,
    ], { delaiMs, env: o.env });
    if (r.absent) return refus('binaire', 'ffmpeg absent du serveur');
    if (r.code !== 0) {
      // Le stderr brut (chemins temporaires, messages techniques) ne sort jamais vers l'écran.
      const detail = r.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300) || `code ${r.code}`;
      const motif = /No such filter: '?(ass|subtitles)'?|Filter not found/i.test(r.stderr) ? 'filtre ass absent du serveur (ffmpeg sans libass)' : 'ffmpeg a refusé la passe des sous-titres';
      return { ...refus('rendu', motif), detail };
    }
    const taille = (await stat(sortie).catch(() => null))?.size ?? 0;
    if (taille === 0 || taille > OCTETS_MAX) return refus('verification', `fichier produit vide ou trop volumineux (${taille} octets)`);

    // Relecture · flux, dimensions, durée.
    const p = await lancer(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'mp4', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', sortie], { delaiMs, env: o.env });
    if (p.absent) return refus('binaire', 'ffprobe absent du serveur');
    let info: { streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>; format?: { duration?: string } } = {};
    try { info = JSON.parse(p.stdout.toString('utf8')); } catch { return refus('verification', 'relecture du fichier produit illisible'); }
    const video = info.streams?.find((x) => x.codec_type === 'video');
    const dureeMs = Math.round(Number(info.format?.duration ?? 'NaN') * 1000);
    if (!video || video.codec_name !== 'h264' || video.width !== e.largeur || video.height !== e.hauteur) return refus('verification', 'flux vidéo produit non conforme (codec ou dimensions)');
    const uneImageMs = (1000 * e.fps.den) / e.fps.num;
    if (!Number.isFinite(dureeMs) || Math.abs(dureeMs - e.dureeMs) > uneImageMs + 100) return refus('verification', `durée produite ${dureeMs} ms, attendue ${e.dureeMs} ms`);

    // Le texte est-il sur l'image ? Entrée et sortie comparées au même instant.
    const mesures: MesureImage[] = [];
    const libreHaut = e.hauteur - Math.ceil(e.hauteur * 0.2);
    for (const [instants, carton] of [[e.controles.avecTexteMs, true], [e.controles.sansTexteMs, false]] as const) {
      for (const t of instants) {
        const [a, b] = await Promise.all([imageGrise(ffmpeg, entree, t, e.largeur, e.hauteur, { delaiMs, env: o.env }), imageGrise(ffmpeg, sortie, t, e.largeur, e.hauteur, { delaiMs, env: o.env })]);
        if (!a || !b) return refus('verification', `image à ${t} ms illisible`, mesures);
        mesures.push({ instantMs: t, carton, pixelsTexte: pixelsChanges(a, b, e.largeur, e.zone.haut, e.zone.bas), pixelsZoneLibre: pixelsChanges(a, b, e.largeur, libreHaut, e.hauteur) });
      }
    }
    const vus = mesures.filter((m) => m.carton && m.pixelsTexte >= PIXELS_TEXTE_MIN);
    const deborde = mesures.find((m) => m.pixelsZoneLibre > PIXELS_ZONE_LIBRE_MAX);
    const fantome = mesures.find((m) => !m.carton && m.pixelsTexte > PIXELS_HORS_CARTON_MAX);
    if (deborde) return refus('verification', `texte dans les 20 % bas de l’image à ${deborde.instantMs} ms (${deborde.pixelsZoneLibre} pixels)`, mesures);
    if (fantome) return refus('verification', `texte hors carton à ${fantome.instantMs} ms (${fantome.pixelsTexte} pixels)`, mesures);
    if (vus.length !== e.controles.avecTexteMs.length) {
      const absent = mesures.find((m) => m.carton && m.pixelsTexte < PIXELS_TEXTE_MIN)!;
      return refus('verification', `aucun texte visible à ${absent.instantMs} ms (${absent.pixelsTexte} pixels changés, ${PIXELS_TEXTE_MIN} attendus au moins)`, mesures);
    }
    const ass2 = e.ass.match(/\nDialogue: /g)?.length ?? 0;
    return { ok: true, octets: new Uint8Array(await readFile(sortie)), constat: { brules: true, cartons: ass2, cartonsVerifies: vus.length }, mesures, dureeMs };
  } finally {
    await rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
}
