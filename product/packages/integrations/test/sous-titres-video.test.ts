import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { sousTitresAss, instantsDeControle, PART_BASSE_LIBRE, type MotHorodate } from '@tiktrends/core';
import {
  brulerSousTitresFfmpeg, filtreSousTitres, imageGrise, PIXELS_TEXTE_MIN, ECART_GRIS_PIXEL,
} from '../src/sous-titres-video';

/**
 * Sous-titres · la passe RÉELLE (ffmpeg et libass du conteneur), sur un MP4
 * fabriqué ici. On vérifie un RÉSULTAT : l'image extraite à l'instant d'un
 * carton porte des pixels de texte dans la bande prévue (au-dessus des 20 %
 * bas), l'image hors carton n'en porte pas. Aucun réseau, 0 $.
 *
 * Fontconfig est VIDÉ (`FONTCONFIG_FILE` sans aucun dossier) : comme dans
 * l'image Alpine, aucune police système. Seul le dossier de polices du dépôt
 * (`apps/web/public/fonts`, `fontsdir`) peut dessiner le texte · sans lui, rien
 * n'apparaît (cas « police absente »).
 */

const FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0
  && /\bass\b/.test(spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' }).stdout ?? '');
const POLICES = join(__dirname, '..', '..', '..', 'apps', 'web', 'public', 'fonts');
const executer = promisify(execFile);
let dossier = '';
let env: NodeJS.ProcessEnv = {};
let APLAT = new Uint8Array();
let MIRE = new Uint8Array();
const L = 360;
const H = 640;
const DUREE = 3000;

/** Les mots connus · « Un test » de 500 à 1 100 ms, « Très, très bien » de 1 900 à 2 300 ms. */
const MOTS: MotHorodate[] = [
  { texte: 'Un', debutMs: 500, finMs: 700 }, { texte: 'test', debutMs: 710, finMs: 1100 },
  { texte: 'Très,', debutMs: 1900, finMs: 2000 }, { texte: 'très', debutMs: 2010, finMs: 2100 }, { texte: 'bien', debutMs: 2110, finMs: 2300 },
];

beforeAll(async () => {
  dossier = await mkdtemp(join(tmpdir(), 'sous-titres-video-'));
  await writeFile(join(dossier, 'fonts.conf'), '<?xml version="1.0"?>\n<fontconfig></fontconfig>\n');
  env = { ...process.env, FONTCONFIG_FILE: join(dossier, 'fonts.conf') };
  if (!FFMPEG) return;
  const fabriquer = async (nom: string, source: string) => {
    const f = join(dossier, nom);
    await executer('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `${source}:size=${L}x${H}:duration=3`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-f', 'mp4', f]);
    return new Uint8Array(await readFile(f));
  };
  [APLAT, MIRE] = await Promise.all([fabriquer('aplat.mp4', 'color=c=0x336699:rate=30'), fabriquer('mire.mp4', 'testsrc=rate=30')]);
});
afterAll(() => rm(dossier, { recursive: true, force: true }));

const preparer = (octets: Uint8Array, o: { ass?: (a: string) => string; polices?: string } = {}) => {
  const st = sousTitresAss(MOTS, { largeur: L, hauteur: H, dureeMs: DUREE });
  return {
    st,
    entree: {
      octets, ass: o.ass ? o.ass(st.ass) : st.ass, largeur: L, hauteur: H, dureeMs: DUREE, fps: { num: 30, den: 1 },
      zone: st.page.zone, controles: instantsDeControle(st.cartons, DUREE), dossierPolices: o.polices ?? POLICES,
    },
  };
};

/** Pixels de la bande [haut, bas[ qui s'écartent de plus de `ECART_GRIS_PIXEL` du gris de fond (aplat). */
const nonUniformes = (img: Uint8Array, fond: number, haut: number, bas: number) => {
  let n = 0;
  for (let y = haut; y < bas; y++) for (let x = 0; x < L; x++) if (Math.abs(img[y * L + x]! - fond) > ECART_GRIS_PIXEL) n += 1;
  return n;
};

/**
 * Limite des passes réelles · chaque cas encode (360×640, 3 s) puis extrait
 * 6 à 10 images. Mesuré le 2026-11-16 sur le conteneur de développement :
 * 1,4 à 2,2 s par cas, seul. 30 s laissent un facteur 13 pour une machine
 * très chargée.
 */
const DELAI_PASSE_REELLE_MS = 30_000;

describe('filtre de brûlure', () => {
  it('ass= avec fontsdir, chemins entre apostrophes · un chemin non sûr est refusé', () => {
    expect(filtreSousTitres('/tmp/a/sous-titres.ass', '/app/apps/web/public/fonts')).toBe("ass=filename='/tmp/a/sous-titres.ass':fontsdir='/app/apps/web/public/fonts'");
    expect(filtreSousTitres("/tmp/a'b.ass", '/f')).toBeNull();
    expect(filtreSousTitres('/tmp/a.ass', '/f\\x')).toBeNull();
  });
});

describe.skipIf(!FFMPEG)('passe réelle · ffmpeg et libass du conteneur, aucune police système', { timeout: DELAI_PASSE_REELLE_MS }, () => {
  it('à l’instant d’un carton, la zone du sous-titre porte du texte ; hors carton, rien · au-dessus des 20 % bas', async () => {
    const { st, entree } = preparer(APLAT);
    const r = await brulerSousTitresFfmpeg(entree, { env });
    expect(r.ok, !r.ok ? r.motif : '').toBe(true);
    if (!r.ok) return;
    expect(r.constat).toEqual({ brules: true, cartons: st.cartons.length, cartonsVerifies: entree.controles.avecTexteMs.length });

    // Relecture INDÉPENDANTE du fichier produit · images extraites ici.
    const f = join(dossier, 'produit.mp4');
    await writeFile(f, r.octets);
    const fond = (await imageGrise('ffmpeg', join(dossier, 'aplat.mp4'), 800, L, H, { delaiMs: 10_000 }))![10]!;
    const pendant = (await imageGrise('ffmpeg', f, 800, L, H, { delaiMs: 10_000 }))!;
    const avant = (await imageGrise('ffmpeg', f, 200, L, H, { delaiMs: 10_000 }))!;
    const entre = (await imageGrise('ffmpeg', f, 1500, L, H, { delaiMs: 10_000 }))!;
    const libre = H - Math.ceil(H * PART_BASSE_LIBRE);
    const texte = nonUniformes(pendant, fond, 0, H);
    expect(texte, 'aucun pixel de texte à 800 ms (carton « Un test »)').toBeGreaterThanOrEqual(2 * PIXELS_TEXTE_MIN);
    expect(nonUniformes(pendant, fond, st.page.zone.haut, st.page.zone.bas), 'le texte n’est pas dans la bande prévue').toBe(texte);
    expect(nonUniformes(pendant, fond, libre, H), 'du texte dans les 20 % bas').toBe(0);
    expect(nonUniformes(avant, fond, 0, H), 'du texte à 200 ms, avant le premier mot').toBe(0);
    expect(nonUniformes(entre, fond, 0, H), 'du texte à 1 500 ms, entre deux cartons').toBe(0);
    // La bande son est copiée telle quelle.
    const p = JSON.parse((await executer('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', f], { encoding: 'utf8' })).stdout) as { streams: Array<{ codec_type: string }> };
    expect(p.streams.map((s) => s.codec_type).sort()).toEqual(['audio', 'video']);
  });

  it('sur une image animée (mire), le constat lu dans le fichier dit les cartons vus · mesures au-dessus du seuil avec un facteur 2', async () => {
    const r = await brulerSousTitresFfmpeg(preparer(MIRE).entree, { env });
    expect(r.ok, !r.ok ? r.motif : '').toBe(true);
    const avec = r.mesures.filter((m) => m.carton).map((m) => m.pixelsTexte);
    const sans = r.mesures.filter((m) => !m.carton).map((m) => m.pixelsTexte);
    expect(Math.min(...avec)).toBeGreaterThanOrEqual(2 * PIXELS_TEXTE_MIN);
    expect(sans.length).toBeGreaterThan(0);
    expect(Math.max(...sans)).toBe(0);
    expect(Math.max(...r.mesures.map((m) => m.pixelsZoneLibre))).toBe(0);
  });

  it('entrée par CHEMIN du MP4 assemblé (laissé sur disque par l’assemblage) · même constat, fichier d’entrée intact', async () => {
    const { entree } = preparer(MIRE);
    const chemin = join(dossier, 'mire.mp4');
    const avant = await readFile(chemin);
    const r = await brulerSousTitresFfmpeg({ ...entree, octets: undefined, chemin }, { env });
    expect(r.ok, !r.ok ? r.motif : '').toBe(true);
    expect(r.ok && r.constat.cartonsVerifies).toBe(entree.controles.avecTexteMs.length);
    expect(Buffer.compare(await readFile(chemin), avant)).toBe(0);
    expect(await brulerSousTitresFfmpeg({ ...entree, chemin }, { env })).toMatchObject({ ok: false, cause: 'entree' });
  });

  it('police absente (dossier sans Liberation Sans) ⇒ rien n’est dessiné, refus « aucun texte visible »', async () => {
    const vide = join(dossier, 'sans-police');
    await executer('mkdir', ['-p', vide]);
    const r = await brulerSousTitresFfmpeg(preparer(MIRE, { polices: vide }).entree, { env });
    expect(r).toMatchObject({ ok: false, cause: 'verification', constat: { brules: false } });
    expect(!r.ok && r.motif).toMatch(/aucun texte visible à \d+ ms/);
  });

  it('texte posé dans les 20 % bas (marge basse nulle) ⇒ refus', async () => {
    const r = await brulerSousTitresFfmpeg(preparer(MIRE, { ass: (a) => a.replace(/,2,(\d+),(\d+),\d+,1\n/, ',2,$1,$2,4,1\n') }).entree, { env });
    expect(r).toMatchObject({ ok: false, cause: 'verification' });
    expect(!r.ok && r.motif).toMatch(/texte dans les 20 % bas de l’image à \d+ ms/);
  });

  it('stderr brut d’ffmpeg jamais montré · filtre ass absent ⇒ phrase claire, le détail reste au journal', async () => {
    const faux = join(dossier, 'ffmpeg-sans-libass');
    await writeFile(faux, "#!/bin/sh\necho \"[AVFilterGraph @ 0x55] No such filter: 'ass'\" >&2\nexit 8\n", { mode: 0o755 });
    const r = await brulerSousTitresFfmpeg(preparer(MIRE).entree, { ffmpeg: faux, env });
    expect(r).toMatchObject({ ok: false, cause: 'rendu', motif: 'sous-titres indisponibles sur ce serveur' });
    expect(!r.ok && r.detail).toMatch(/No such filter/);
    const autre = join(dossier, 'ffmpeg-qui-casse');
    await writeFile(autre, '#!/bin/sh\necho "Error /tmp/tt-sous-titres-x/entree.mp4: Invalid data" >&2\nexit 1\n', { mode: 0o755 });
    const r2 = await brulerSousTitresFfmpeg(preparer(MIRE).entree, { ffmpeg: autre, env });
    expect(r2).toMatchObject({ ok: false, cause: 'rendu', motif: 'la passe des sous-titres a échoué sur ce serveur' });
    expect(!r2.ok && r2.constat.raison).not.toMatch(/tmp|Invalid/);
  });

  it.each([
    ['vidéo plus longue de deux images', { video: 3.067, audio: 3.0 }, /durée produite 3067 ms, attendue 3000 ms/],
    ['piste audio raccourcie', { video: 3.0, audio: 2.5 }, /durée audio produite 2500 ms, attendue 3000 ms/],
  ])('relecture · %s ⇒ refus (tolérance d’UNE image, audio relu aussi)', async (_, d, motif) => {
    const sonde = join(dossier, `ffprobe-${d.video}-${d.audio}`);
    // L'entrée (le MP4 assemblé) a 3 s de vidéo et d'audio ; la sortie, ce que dit le cas.
    const sortie = { streams: [{ codec_type: 'video', codec_name: 'h264', width: L, height: H, duration: String(d.video) }, { codec_type: 'audio', codec_name: 'aac', duration: String(d.audio) }], format: { duration: String(d.video) } };
    const entree = { streams: [{ codec_type: 'video', codec_name: 'h264', width: L, height: H, duration: '3.0' }, { codec_type: 'audio', codec_name: 'aac', duration: '3.0' }], format: { duration: '3.0' } };
    await writeFile(sonde, `#!/bin/sh\ncase "$*" in *sortie.mp4*) cat <<'FIN'\n${JSON.stringify(sortie)}\nFIN\n;; *) cat <<'FIN'\n${JSON.stringify(entree)}\nFIN\n;; esac\n`, { mode: 0o755 });
    const r = await brulerSousTitresFfmpeg(preparer(MIRE).entree, { ffprobe: sonde, env });
    expect(r).toMatchObject({ ok: false, cause: 'verification' });
    expect(!r.ok && r.motif).toMatch(motif);
  });

  it('ffmpeg absent ⇒ refus « binaire », jamais un faux fichier', async () => {
    const r = await brulerSousTitresFfmpeg(preparer(MIRE).entree, { ffmpeg: '/chemin/inexistant/ffmpeg', env });
    expect(r).toMatchObject({ ok: false, cause: 'binaire', constat: { brules: false } });
  });
});

describe('entrées refusées avant ffmpeg', () => {
  it('aucun carton ⇒ refus « entree »', async () => {
    const st = sousTitresAss([], { largeur: L, hauteur: H, dureeMs: DUREE });
    const r = await brulerSousTitresFfmpeg({ octets: new Uint8Array(), ass: st.ass, largeur: L, hauteur: H, dureeMs: DUREE, fps: { num: 30, den: 1 }, zone: st.page.zone, controles: { avecTexteMs: [], sansTexteMs: [] }, dossierPolices: POLICES });
    expect(r).toMatchObject({ ok: false, cause: 'entree', motif: 'aucun carton à brûler' });
  });
});
