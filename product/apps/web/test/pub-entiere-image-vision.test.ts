import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { imagePourVision, OCTETS_IMAGE_VISION_MAX } from '../lib/studios/image/relecture-pub-entiere';

/**
 * Pub entière · une image envoyée à la relecture tient sous la limite par image
 * du fournisseur de vision (~5 Mo) · plus lourde, elle est réduite (sharp) ;
 * illisible, elle n'est pas envoyée et la raison est dite.
 */
describe('image pour la relecture · sous la limite du fournisseur', () => {
  it('une photo de plus de 5 Mo est réduite sous la limite, et reste une image', async () => {
    const bruit = Buffer.alloc(1800 * 1800 * 3);
    for (let i = 0; i < bruit.length; i++) bruit[i] = (i * 2654435761) >>> 24;
    const lourde = await sharp(bruit, { raw: { width: 1800, height: 1800, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
    expect(lourde.length).toBeGreaterThan(OCTETS_IMAGE_VISION_MAX);
    const r = await imagePourVision(new Uint8Array(lourde));
    if (!r.ok) throw new Error(r.motif);
    const octets = Buffer.from(r.image.base64, 'base64');
    expect(octets.length, 'image envoyée au-delà de la limite par image du fournisseur').toBeLessThanOrEqual(OCTETS_IMAGE_VISION_MAX);
    expect(r.image.mediaType).toBe('image/jpeg');
    expect((await sharp(octets).metadata()).width).toBeGreaterThan(0);
  }, 60_000);

  it('une image légère part telle quelle ; des octets qui ne sont pas une image sont refusés avec la raison', async () => {
    const petite = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
    const r = await imagePourVision(new Uint8Array(petite));
    expect(r.ok && [r.image.mediaType, r.image.base64]).toEqual(['image/png', petite.toString('base64')]);
    expect(await imagePourVision(new TextEncoder().encode('pas une image'))).toEqual({ ok: false, motif: 'fichier qui n’est pas une image lisible' });
  });
});
