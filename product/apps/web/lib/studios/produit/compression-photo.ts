import { etapesCompression, verdictDataUriPhoto, type MotifRefusPhoto } from '@tiktrends/core';

/**
 * Compression d'une photo produit DANS le navigateur (lot 3a) · l'échelle et
 * la borne viennent du noyau (`etapesCompression`, `verdictDataUriPhoto`) ;
 * ce module ne fait que dessiner. On s'arrête à la première sortie qui passe
 * la même règle que le serveur. Un JPEG est posé sur fond blanc (un PNG
 * détouré ne devient pas noir).
 */

export type ResultatCompression = { ok: true; dataUri: string } | { ok: false; motif: MotifRefusPhoto };

function charger(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('illisible'));
    img.src = url;
  });
}

export async function compresserPhoto(fichier: File): Promise<ResultatCompression> {
  const url = URL.createObjectURL(fichier);
  let img: HTMLImageElement;
  try {
    img = await charger(url);
  } catch {
    return { ok: false, motif: 'illisible' };
  } finally {
    URL.revokeObjectURL(url);
  }
  const l = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!l || !h) return { ok: false, motif: 'illisible' };
  for (const e of etapesCompression(fichier.type)) {
    const k = Math.min(1, e.cote / Math.max(l, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(l * k));
    canvas.height = Math.max(1, Math.round(h * k));
    const c = canvas.getContext('2d');
    if (!c) return { ok: false, motif: 'illisible' };
    if (e.format === 'image/jpeg') { c.fillStyle = '#ffffff'; c.fillRect(0, 0, canvas.width, canvas.height); }
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    const d = e.qualite === null ? canvas.toDataURL(e.format) : canvas.toDataURL(e.format, e.qualite);
    // Un navigateur qui ne sait pas produire ce format rend du PNG · l'étape suivante s'en charge.
    if (!d.startsWith(`data:${e.format};`)) continue;
    const v = verdictDataUriPhoto(d);
    if (v.ok) return { ok: true, dataUri: d };
    if (v.motif !== 'trop_lourd') return { ok: false, motif: v.motif };
  }
  return { ok: false, motif: 'trop_lourd' };
}
