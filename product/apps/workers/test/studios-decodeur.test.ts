import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { inspecterMedia, verdictDecodage, type EnteteMedia } from '@tiktrends/core';
import { DecodeurSharp } from '../src/studios/decodeur';
import { pngSimule } from '../../../packages/integrations/src/studios-simule';
import { mp4StructurePlausible, pngIdatCorrompu, jpegScanCoupe } from '../../../packages/core/test/l3-fixtures-media';

/**
 * Décodeur de PRODUCTION du worker (contre-recette du 8 octobre, P1).
 *
 * Il doit décoder TOUS les pixels : un fichier dont la structure est parfaite
 * (CRC justes, marqueur de fin présent) mais dont la charge utile est abîmée
 * passe le premier filtre pur et doit être refusé ICI. Images réelles
 * produites par sharp 0.34.5 (32×24, motif non uni).
 */

const d = new DecodeurSharp();
const IMAGES: Record<'png' | 'jpeg' | 'webp', Uint8Array> = { png: new Uint8Array(), jpeg: new Uint8Array(), webp: new Uint8Array() };

beforeAll(async () => {
  const brut = Buffer.alloc(32 * 24 * 3);
  for (let i = 0; i < brut.length; i++) brut[i] = (i * 37) & 0xff;
  const src = () => sharp(brut, { raw: { width: 32, height: 24, channels: 3 } });
  IMAGES.png = new Uint8Array(await src().png().toBuffer());
  IMAGES.jpeg = new Uint8Array(await src().jpeg({ quality: 90 }).toBuffer());
  IMAGES.webp = new Uint8Array(await src().webp({ quality: 80 }).toBuffer());
});

/** Le verdict complet du worker : premier filtre pur PUIS décodage réel. */
async function verdict(o: Uint8Array) {
  const entete = inspecterMedia(o) as EnteteMedia;
  expect(entete, 'précondition : structure plausible').not.toBeNull();
  return verdictDecodage(entete, await d.decoderImage(o));
}

describe('vraies images ⇒ décodées en entier, livrables', () => {
  for (const f of ['png', 'jpeg', 'webp'] as const) {
    it(`${f} réel ⇒ pixels complets 32×24`, async () => {
      const r = await d.decoderImage(IMAGES[f]);
      expect(r).toMatchObject({ ok: true, largeur: 32, hauteur: 24 });
      expect(r.ok && r.octetsPixels).toBe(32 * 24 * (r.ok ? r.canaux : 0));
      expect(await verdict(IMAGES[f])).toEqual({ livrable: true, largeur: 32, hauteur: 24 });
    });
  }
  it('le PNG simulé des tests se décode réellement (8×8)', async () => {
    expect(await verdict(pngSimule())).toEqual({ livrable: true, largeur: 8, hauteur: 8 });
  });
});

describe('structure parfaite, charge utile abîmée ⇒ refus du DÉCODEUR', () => {
  it('PNG à IDAT corrompu, CRC recalculés ⇒ refusé, cause contenu', async () => {
    const r = await d.decoderImage(pngIdatCorrompu(IMAGES.png));
    expect(r, 'PNG à pixels illisibles décodé').toMatchObject({ ok: false, cause: 'contenu' });
    expect(await verdict(pngIdatCorrompu(IMAGES.png))).toMatchObject({ livrable: false, suite: 'retelecharger' });
  });
  it('PNG simulé à IDAT corrompu ⇒ refusé', async () => {
    expect(await verdict(pngSimule(undefined, { corrompreIdat: true }))).toMatchObject({ livrable: false, suite: 'retelecharger' });
  });
  it('JPEG au scan coupé, EOI conservé ⇒ refusé, cause contenu', async () => {
    const r = await d.decoderImage(jpegScanCoupe(IMAGES.jpeg));
    expect(r, 'JPEG au scan coupé décodé').toMatchObject({ ok: false, cause: 'contenu' });
    expect(!r.ok && r.raison).toMatch(/Corrupt JPEG data|premature end/);
  });
});

describe('vidéo · aucun décodeur', () => {
  it('le décodeur de production n’a PAS de décodeur vidéo ⇒ une vidéo n’est jamais vérifiable', async () => {
    expect(d.decoderVideo).toBeUndefined();
    const entete = inspecterMedia(mp4StructurePlausible())!;
    expect(entete.mime).toBe('video/mp4');
    expect(verdictDecodage(entete, 'decodeur_absent')).toMatchObject({ livrable: false, suite: 'refuser' });
  });
  it('un MP4 n’est pas une image : le décodeur d’images le refuse aussi', async () => {
    expect(await d.decoderImage(mp4StructurePlausible())).toMatchObject({ ok: false, cause: 'contenu' });
  });
});
