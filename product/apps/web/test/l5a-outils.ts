import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DocumentStudio, CalqueImage, CalqueTexte, CalqueLogo } from '@tiktrends/core';

// Un seul fil libvips par processus de test : les tests de pixels restent lourds
// (rendus 1080 × 1920), ils ne doivent pas affamer les autres fichiers en parallèle.
sharp.concurrency(1);

/**
 * Outils des tests L5-A · images de recette fabriquées par `sharp` (aucun
 * fichier binaire versionné) et document publicitaire 1:1.
 */

export interface Brut { largeur: number; hauteur: number; donnees: Uint8Array }

export async function png(l: number, h: number, pixel: (x: number, y: number) => [number, number, number, number]): Promise<Buffer> {
  const d = Buffer.alloc(l * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) d.set(pixel(x, y), (y * l + x) * 4);
  return sharp(d, { raw: { width: l, height: h, channels: 4 } }).png().toBuffer();
}

export async function decoder(b: Uint8Array): Promise<Brut> {
  const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { largeur: info.width, hauteur: info.height, donnees: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

/** Décor A · dégradé bleu. */
export const decorA = () => png(1080, 1080, (x, y) => [20, Math.round((y / 1080) * 120), 160 + Math.round((x / 1080) * 80), 255]);
/** Décor B · damier vert et sable. */
export const decorB = () => png(1080, 1080, (x, y) => (((x >> 5) + (y >> 5)) & 1 ? [40, 140, 70, 255] : [230, 210, 160, 255]));
/** Produit · flacon rouge rayé 800 × 1200, fond transparent, bords doux (8 px de marge transparente). */
export const produit = () => png(800, 1200, (x, y) => {
  const dedans = x >= 8 && x < 792 && y >= 8 && y < 1192;
  if (!dedans) return [0, 0, 0, 0];
  return (y >> 4) & 1 ? [220, 20, 40, 255] : [180, 10, 30, 255];
});
/** Produit plein (aucune transparence) · pour mesurer sa largeur au pixel. */
export const produitPlein = () => png(800, 1200, (x, y) => ((y >> 4) & 1 ? [220, 20, 40, 255] : [180, 10, 30, 255]));
export const logo = () => png(240, 120, (x, y) => (x > 10 && x < 230 && y > 10 && y < 110 ? [255, 255, 255, 255] : [0, 0, 0, 0]));

export function pub11(ids: { fond: string; produit: string; logo: string }): DocumentStudio {
  const fond: CalqueImage = { id: 'fond', kind: 'image', name: 'Décor', visible: true, locked: false, x: 0, y: 0, width: 1080, height: 1080, rotationDeg: 0, opacity: 1, z: 0, assetId: ids.fond, sourceWidth: 1080, sourceHeight: 1080, mask: null };
  const prod: CalqueImage = { id: 'produit', kind: 'image', name: 'Produit', visible: true, locked: true, x: 330, y: 260, width: 420, height: 630, rotationDeg: 0, opacity: 1, z: 10, assetId: ids.produit, sourceWidth: 800, sourceHeight: 1200, mask: null };
  const titre: CalqueTexte = { id: 'titre', kind: 'text', name: 'Titre', visible: true, locked: false, x: 60, y: 60, width: 960, height: 150, rotationDeg: 0, opacity: 1, z: 20, text: 'La crème qui tient 24 h', fontId: 'f_titre', fontSizePx: 64, color: '#ffffff', align: 'center', lineHeight: 1.1 };
  const cta: CalqueTexte = { id: 'cta', kind: 'text', name: 'Appel', visible: true, locked: false, x: 290, y: 940, width: 500, height: 60, rotationDeg: 0, opacity: 1, z: 21, text: 'Je la teste', fontId: 'f_corps', fontSizePx: 40, color: '#ffffff', align: 'center', lineHeight: 1.2 };
  const lg: CalqueLogo = { id: 'logo', kind: 'logo', name: 'Logo', visible: true, locked: false, x: 900, y: 960, width: 120, height: 60, rotationDeg: 0, opacity: 1, z: 22, assetId: ids.logo };
  return {
    width: 1080, height: 1080, colorSpace: 'sRGB',
    layers: { fond, produit: prod, titre, cta, logo: lg },
    fonts: { f_titre: { family: 'Sans Bold', assetId: null }, f_corps: { family: 'Sans', assetId: null } },
  };
}

/** Écrit une capture si `L5A_CAPTURES` désigne un dossier (recette locale ; inerte en CI). */
export function capture(nom: string, octets: Uint8Array): void {
  const dir = process.env.L5A_CAPTURES;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, nom), octets);
}

/** Boîte d'encre des pixels qui vérifient `test`. */
export function boite(b: Brut, test: (p: Uint8Array, i: number) => boolean): { x0: number; x1: number; y0: number; y1: number } | null {
  let x0 = Infinity; let x1 = -1; let y0 = Infinity; let y1 = -1;
  for (let y = 0; y < b.hauteur; y++) for (let x = 0; x < b.largeur; x++) {
    if (!test(b.donnees, (y * b.largeur + x) * 4)) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return x1 < 0 ? null : { x0, x1, y0, y1 };
}
