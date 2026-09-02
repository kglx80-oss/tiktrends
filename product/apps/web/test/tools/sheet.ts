import { deflateSync } from 'node:zlib';
import type { Image } from '../png';

/**
 * Encode une image RVBA en PNG · juste assez pour fabriquer une planche.
 *
 * ── Pourquoi ça existe ───────────────────────────────────────────────────────
 *
 * On mesure des rendus depuis des semaines. Mesurer répond aux questions qu'on
 * pense à poser · une mise en page effondrée en ligne au lieu d'en colonne a
 * traversé trois gardes verts, et n'a été vue qu'en OUVRANT l'image.
 *
 * Une planche de contact met les vingt-six combinaisons sur une seule image.
 * C'est le seul outil qui répond aux questions qu'on n'a pas pensé à poser.
 */
export function encodePng(img: Image): Buffer {
  const brut = Buffer.alloc((img.width * 4 + 1) * img.height);
  let p = 0;
  for (let y = 0; y < img.height; y++) {
    brut[p++] = 0; // filtre « none » · la planche n'a pas besoin d'être compacte
    img.rgba.subarray(y * img.width * 4, (y + 1) * img.width * 4).forEach((v) => { brut[p++] = v; });
  }
  const morceau = (type: string, data: Buffer) => {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0); ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr), morceau('IDAT', deflateSync(brut)), morceau('IEND', Buffer.alloc(0)),
  ]);
}

let TABLE: number[] | null = null;
function crc32(buf: Buffer): number {
  if (!TABLE) {
    TABLE = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return c ^ 0xffffffff;
}

/** Colle des vignettes en grille, avec une gouttière claire pour lire les bords. */
export function planche(cells: Image[], perRow: number, gap = 6): Image {
  const w = cells[0]!.width, h = cells[0]!.height;
  const rows = Math.ceil(cells.length / perRow);
  const W = perRow * w + (perRow + 1) * gap;
  const H = rows * h + (rows + 1) * gap;
  const rgba = new Uint8Array(W * H * 4).fill(60);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;

  cells.forEach((c, i) => {
    const cx = gap + (i % perRow) * (w + gap);
    const cy = gap + Math.floor(i / perRow) * (h + gap);
    for (let y = 0; y < h; y++) {
      const src = y * w * 4;
      const dst = ((cy + y) * W + cx) * 4;
      rgba.set(c.rgba.subarray(src, src + w * 4), dst);
    }
  });
  return { width: W, height: H, rgba };
}
