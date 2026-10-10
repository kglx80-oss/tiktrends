import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspecterMedia, etatFichierMedia, verdictDecodage, capaciteVideo, type EnteteMedia } from '@tiktrends/core';
import { decoderVideoFfmpeg, fpsRationnel, secondesVersTicks } from '../src/studios/decodeur-video';
import { sonderVideo, encodeursPresents } from '../src/studios/sonde-video';
import { DecodeurSharp } from '../src/studios/decodeur';
import { mp4Recette88, mp4StructurePlausible } from '../../../packages/core/test/l3-fixtures-media';

/**
 * L7-B · décodage vidéo RÉEL au worker (ffprobe PUIS ffmpeg, toutes les
 * images). Vidéos VRAIES générées par ffmpeg dans le test ; la CI sans ffmpeg
 * saute ces cas (`skipIf`), la règle pure est couverte côté noyau.
 *
 * LA preuve que ffprobe seul ne suffit pas : un MP4 aux boîtes parfaites, à
 * la charge utile abîmée, passe le premier filtre pur ET ffprobe, et n'est
 * refusé que par le décodage complet.
 */

const FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const H264 = FFMPEG && /\blibx264\b/.test(spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout ?? '');

let dossier = '';
/** Génère une vraie vidéo MP4 par ffmpeg (arguments en tableau, aucun shell). */
function generer(nom: string, args: string[]): Uint8Array {
  const sortie = join(dossier, nom);
  const r = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args, '-c:v', H264 ? 'libx264' : 'mpeg4', '-pix_fmt', 'yuv420p', '-f', 'mp4', sortie], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg n’a pas généré ${nom} · ${r.stderr}`);
  return new Uint8Array(readFileSync(sortie));
}

/**
 * Octets de `mdat` abîmés (un sur sept dans la seconde moitié), boîtes
 * intactes. La première moitié reste saine : ffprobe, qui ne lit que le début
 * pour annoncer les flux, ne voit RIEN (stderr vide, mesuré).
 */
function mdatAbime(o: Uint8Array): Uint8Array {
  const c = new Uint8Array(o);
  const dv = new DataView(c.buffer);
  let i = 0;
  while (i + 8 <= c.length) {
    const t = dv.getUint32(i);
    const type = String.fromCharCode(...c.subarray(i + 4, i + 8));
    if (type === 'mdat') {
      const d = i + 8;
      for (let k = d + Math.floor((t - 8) * 0.5); k < i + t; k += 7) c[k] = c[k]! ^ 0x5a;
      return c;
    }
    i += t;
  }
  throw new Error('pas de mdat');
}

let TESTSRC = new Uint8Array();
let MOTIF = new Uint8Array();
let SATURE = new Uint8Array();

beforeAll(() => {
  if (!FFMPEG) return;
  dossier = mkdtempSync(join(tmpdir(), 'l7b-test-'));
  TESTSRC = generer('testsrc.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=64x48:rate=24:duration=1']);
  // Une couleur unie par image, qui dépend de son rang : début, milieu, fin se reconnaissent aux pixels.
  MOTIF = generer('motif.mp4', [
    '-f', 'lavfi', '-i', "color=c=black:s=64x48:r=24:d=1,format=rgb24,geq=r='N*10':g='255-N*10':b='128'",
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
    ...(H264 ? ['-crf', '10'] : ['-q:v', '2']), '-c:a', 'aac', '-shortest',
  ]);
  SATURE = generer('sature.mp4', ['-f', 'lavfi', '-i', 'color=c=gray:s=64x48:r=24:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1,volume=8', '-c:a', 'aac', '-shortest']);
  return () => rmSync(dossier, { recursive: true, force: true });
});

const tempsRestants = () => readdirSync(tmpdir()).filter((f) => f.startsWith('tt-video-'));

describe.skipIf(!FFMPEG)('(a) vraie vidéo ffmpeg ⇒ décodée en entier, mesures justes', () => {
  it('testsrc 64×48, 24 i/s, 1 s ⇒ 24 images lues, 1 s en ticks, 3 extraits aux dimensions', async () => {
    const r = await decoderVideoFfmpeg(TESTSRC);
    expect(r, `vraie vidéo refusée · ${!r.ok ? r.raison : ''}`).toMatchObject({ ok: true, largeur: 64, hauteur: 48 });
    if (!r.ok) return;
    expect(r.video).toMatchObject({ codec: H264 ? 'h264' : 'mpeg4', fps: { num: 24, den: 1 }, images: 24, imagesAnnoncees: 24, dureeTicks: 1_000_000, audio: null });
    expect(r.video!.extraits.map((x) => [x.rang, x.largeur, x.hauteur, x.octetsPixels])).toEqual([[0, 64, 48, 64 * 48 * 3], [11, 64, 48, 64 * 48 * 3], [23, 64, 48, 64 * 48 * 3]]);
    const entete = inspecterMedia(TESTSRC) as EnteteMedia;
    expect(verdictDecodage(entete, r)).toEqual({ livrable: true, largeur: 64, hauteur: 48 });
  });

  it('les images extraites sont les BONNES · début, milieu, fin reconnues à leurs pixels', async () => {
    const r = await decoderVideoFfmpeg(MOTIF);
    expect(r.ok, !r.ok ? r.raison : '').toBe(true);
    if (!r.ok) return;
    const attendu = (n: number) => [n * 10, 255 - n * 10, 128];
    for (const x of r.video!.extraits) {
      const ecart = x.moyenne.map((m, i) => Math.abs(m - attendu(x.rang)[i]!));
      expect(Math.max(...ecart), `image ${x.rang} · moyenne ${x.moyenne} attendue ≈ ${attendu(x.rang)}`).toBeLessThanOrEqual(8);
    }
    expect(r.video!.extraits.map((x) => x.rang)).toEqual([0, 11, 23]);
    // Contrôle audio · AAC décodé, crête mesurée, aucune saturation.
    expect(r.video!.audio).toMatchObject({ codec: 'aac', sature: false });
    expect(r.video!.audio!.creteDb).toBeLessThan(-1);
  });

  it('un son qui sature est SIGNALÉ (crête ≥ 0 dBFS)', async () => {
    const r = await decoderVideoFfmpeg(SATURE);
    expect(r.ok && r.video!.audio).toMatchObject({ codec: 'aac', sature: true });
  });

  it('aucun fichier temporaire ne reste après décodage', async () => {
    const avant = tempsRestants();
    await decoderVideoFfmpeg(TESTSRC);
    await decoderVideoFfmpeg(mdatAbime(TESTSRC));
    expect(tempsRestants()).toEqual(avant);
  });
});

describe.skipIf(!FFMPEG)('(b) le faux MP4 de 88 octets et le MP4 fabriqué à zéro ⇒ refusés', () => {
  it('88 octets (ftyp + moov/mdat à zéro) ⇒ refus, cause contenu', async () => {
    expect(mp4Recette88().length).toBe(88);
    const r = await decoderVideoFfmpeg(mp4Recette88());
    expect(r, 'le faux MP4 de la recette a été décodé').toMatchObject({ ok: false, cause: 'contenu' });
  });
  it('boîtes cohérentes, données à zéro ⇒ refus, cause contenu', async () => {
    expect(etatFichierMedia(mp4StructurePlausible())).toBe('structure_plausible');
    expect(await decoderVideoFfmpeg(mp4StructurePlausible())).toMatchObject({ ok: false, cause: 'contenu' });
  });
});

describe.skipIf(!FFMPEG)('(c) structure parfaite, charge utile abîmée ⇒ seul le décodage COMPLET refuse', () => {
  it('le premier filtre ET ffprobe l’acceptent, le décodage complet le refuse', async () => {
    const abime = mdatAbime(TESTSRC);
    const entete = inspecterMedia(abime);
    expect(entete, 'précondition : structure plausible pour le filtre pur').toMatchObject({ mime: 'video/mp4', largeur: 64, hauteur: 48 });
    // ffprobe seul (en-têtes) ne voit rien.
    const f = join(dossier, 'abime.mp4');
    writeFileSync(f, abime);
    const p = spawnSync('ffprobe', ['-v', 'error', '-of', 'json', '-show_streams', f], { encoding: 'utf8' });
    expect([p.status, p.stderr.trim()], 'précondition : ffprobe accepte le fichier abîmé').toEqual([0, '']);
    expect(JSON.parse(p.stdout).streams[0]).toMatchObject({ codec_type: 'video', width: 64, height: 48, nb_frames: '24' });

    const r = await decoderVideoFfmpeg(abime);
    expect(r, 'une vidéo à charge utile abîmée a été déclarée lisible').toMatchObject({ ok: false, cause: 'contenu' });
    expect(!r.ok && r.raison).toMatch(/décodage refusé|lecture incomplète|aucune image/);
    expect(verdictDecodage(entete!, r)).toMatchObject({ livrable: false, suite: 'retelecharger' });
  });

  it('au-delà de la taille maximale lue ⇒ refus sans lancer ffmpeg', async () => {
    expect(await decoderVideoFfmpeg(TESTSRC, { octetsMax: 100 })).toMatchObject({ ok: false, cause: 'contenu', raison: expect.stringMatching(/trop volumineuse/) });
  });
});

describe('(d) binaire absent ⇒ cause decodeur, le média reste en attente', () => {
  it('chemin injecté inexistant ⇒ cause decodeur', async () => {
    const r = await decoderVideoFfmpeg(mp4StructurePlausible(), { ffmpeg: '/nulle-part/ffmpeg', ffprobe: '/nulle-part/ffprobe' });
    expect(r).toMatchObject({ ok: false, cause: 'decodeur', raison: expect.stringMatching(/introuvable/) });
    expect(verdictDecodage(inspecterMedia(mp4StructurePlausible())!, r)).toMatchObject({ livrable: false, suite: 'attendre' });
  });
  it('PATH vidé ⇒ cause decodeur', async () => {
    expect(await decoderVideoFfmpeg(mp4StructurePlausible(), { env: { PATH: '' } })).toMatchObject({ ok: false, cause: 'decodeur' });
  });
  it('la sonde sans ffmpeg ne prouve rien ⇒ capacité fausse', async () => {
    const s = await sonderVideo({ ffmpeg: '/nulle-part/ffmpeg', workerId: 'test' });
    expect(s).toMatchObject({ ffmpeg: null, decodage: { ok: false }, encodeurs: { libx264: false, aac: false } });
    expect(capaciteVideo(s, new Date())).toMatchObject({ decodage: false, raison: expect.stringMatching(/ffmpeg absent/) });
  });
});

describe.skipIf(!FFMPEG)('sonde réelle · échantillon généré puis décodé en entier', () => {
  it('ffmpeg présent ⇒ décodage prouvé, encodeurs constatés, capacité fraîche', async () => {
    const s = await sonderVideo({ workerId: 'test' });
    expect(s.decodage, s.decodage.raison).toMatchObject({ ok: true });
    expect(s.ffmpeg).toMatch(/^ffmpeg version /);
    expect(s.encodeurs).toEqual({ libx264: H264, aac: true });
    expect(capaciteVideo(s, new Date())).toMatchObject({ decodage: true, encodeurs: { libx264: H264, aac: true } });
  });
});

describe('branchement · le décodeur vidéo n’existe que sous preuve', () => {
  const faux = async () => ({ ok: false as const, cause: 'decodeur' as const, raison: 'x' });
  it('videoActif faux ⇒ aucun décodeur vidéo exposé (le moteur refuse l’animation avant soumission)', () => {
    let actif = false;
    const d = new DecodeurSharp({ video: faux, videoActif: () => actif });
    expect(d.decoderVideo).toBeUndefined();
    actif = true;
    expect(d.decoderVideo).toBe(faux);
  });
  it('lectures pures de ffprobe · débit rationnel, secondes en ticks entiers, encodeurs', () => {
    expect(fpsRationnel('30000/1001')).toEqual({ num: 30000, den: 1001 });
    expect(fpsRationnel('0/0')).toBeNull();
    expect(secondesVersTicks('1.000000')).toBe(1_000_000);
    expect(secondesVersTicks('2.0416667')).toBe(2_041_666);
    expect(secondesVersTicks('N/A')).toBeNull();
    expect(encodeursPresents(' V....D libx264              libx264 H.264\n A....D aac                  AAC\n V....D libx264rgb  x')).toEqual({ libx264: true, aac: true });
    expect(encodeursPresents(' V....D libx264rgb  x\n A....D aac_at  y')).toEqual({ libx264: false, aac: false });
  });
});
