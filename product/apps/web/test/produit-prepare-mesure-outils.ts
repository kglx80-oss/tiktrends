import sharp from 'sharp';

/**
 * Mesure reproductible · que devient l'étiquette d'un produit quand la photo
 * est réduite et compressée avant d'entrer au catalogue ?
 *
 * Trois photos SYNTHÉTIQUES (aucun fichier, aucun réseau, graine fixe) :
 * une scène texturée (bruit de valeur multi-échelles + grain, calé pour
 * peser comme la « photo texturée » mesurée dans Chromium), un produit dont
 * l'étiquette claire porte trois lignes de « texte » · des fûts sombres de la
 * hauteur de capitale voulue, épais de 0,14 h et espacés de 0,2 h (le fût et
 * l'œil d'une linéale courante). Pas de police : le rendu ne dépend d'aucune
 * fonte installée.
 *
 * Pour chaque côté candidat, la photo est réduite (sharp, noyau linéaire,
 * plus proche du lissage d'un canevas que Lanczos) puis encodée en JPEG 0,85,
 * décodée et relue : hauteur de capitale RÉELLE en pixels (lignes sombres
 * contiguës), fûts encore séparés (sur 12), et longueur de la data URI.
 */

export interface LigneEtiquette { nom: string; capitale: number }
export interface PhotoSynthetique { cle: 'packshot' | 'telephone' | 'scene'; nom: string; largeur: number; hauteur: number; graine: number; etiquette: { x: number; y: number; largeur: number; hauteur: number }; lignes: LigneEtiquette[] }

export const FUTS_PAR_LIGNE = 12;
const BLANC = 238;
const NOIR = 28;

/** Trois cas de source, du plus favorable au plus dur. */
export const PHOTOS_SYNTHETIQUES: readonly PhotoSynthetique[] = [
  {
    cle: 'packshot', nom: 'Packshot carré 2048 · produit plein cadre', largeur: 2048, hauteur: 2048, graine: 11,
    etiquette: { x: 520, y: 560, largeur: 1000, hauteur: 900 },
    lignes: [{ nom: 'nom du produit', capitale: 96 }, { nom: 'bénéfice', capitale: 40 }, { nom: 'mentions (contenance)', capitale: 22 }],
  },
  {
    cle: 'telephone', nom: 'Téléphone 4032 × 3024 · produit en main', largeur: 4032, hauteur: 3024, graine: 23,
    etiquette: { x: 1500, y: 900, largeur: 900, hauteur: 900 },
    lignes: [{ nom: 'nom du produit', capitale: 70 }, { nom: 'bénéfice', capitale: 30 }, { nom: 'mentions (contenance)', capitale: 16 }],
  },
  {
    cle: 'scene', nom: 'Téléphone 3024 × 4032 · mise en scène', largeur: 3024, hauteur: 4032, graine: 37,
    etiquette: { x: 1200, y: 1700, largeur: 620, hauteur: 560 },
    lignes: [{ nom: 'nom du produit', capitale: 48 }, { nom: 'bénéfice', capitale: 20 }, { nom: 'mentions (contenance)', capitale: 11 }],
  },
];

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Géométrie d'une ligne dans la source · fût, œil, origine. */
export function geometrieLigne(p: PhotoSynthetique, i: number): { x0: number; y0: number; fut: number; oeil: number; h: number } {
  const e = p.etiquette;
  let y = e.y + Math.round(e.hauteur * 0.12);
  for (let k = 0; k < i; k++) y += Math.round(p.lignes[k]!.capitale * 1.8);
  const h = p.lignes[i]!.capitale;
  return { x0: e.x + Math.round(e.largeur * 0.08), y0: y, fut: Math.max(1, Math.round(h * 0.14)), oeil: Math.max(1, Math.round(h * 0.2)), h };
}

/** Les octets RVB de la photo synthétique · déterministes pour une graine. */
export function genererPhoto(p: PhotoSynthetique): Buffer {
  const { largeur: W, hauteur: H } = p;
  const rnd = mulberry32(p.graine);
  // Bruit de valeur · trois octaves sur des grilles grossières, interpolées.
  const octaves = [96, 24, 6].map((pas) => {
    const gw = Math.ceil(W / pas) + 2, gh = Math.ceil(H / pas) + 2;
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return { pas, gw, g };
  });
  const out = Buffer.alloc(W * H * 3);
  const amp = [70, 60, 56];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 96;
      for (let o = 0; o < 3; o++) {
        const { pas, gw, g } = octaves[o]!;
        const fx = x / pas, fy = y / pas, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const a = g[iy * gw + ix]!, b = g[iy * gw + ix + 1]!, c = g[(iy + 1) * gw + ix]!, d = g[(iy + 1) * gw + ix + 1]!;
        v += (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty - 0.5) * amp[o]!;
      }
      v += (rnd() - 0.5) * 30;
      const j = (y * W + x) * 3;
      out[j] = Math.max(0, Math.min(255, v + 18));
      out[j + 1] = Math.max(0, Math.min(255, v));
      out[j + 2] = Math.max(0, Math.min(255, v - 14));
    }
  }
  // L'étiquette claire, légèrement grainée (papier), puis les fûts.
  const e = p.etiquette;
  for (let y = e.y; y < e.y + e.hauteur; y++) for (let x = e.x; x < e.x + e.largeur; x++) {
    const j = (y * W + x) * 3; const v = BLANC + (rnd() - 0.5) * 6;
    out[j] = v; out[j + 1] = v; out[j + 2] = v;
  }
  p.lignes.forEach((_, i) => {
    const g = geometrieLigne(p, i);
    for (let s = 0; s < FUTS_PAR_LIGNE; s++) {
      const xs = g.x0 + s * (g.fut + g.oeil);
      for (let y = g.y0; y < g.y0 + g.h; y++) for (let x = xs; x < xs + g.fut; x++) {
        const j = (y * W + x) * 3; out[j] = NOIR; out[j + 1] = NOIR; out[j + 2] = NOIR;
      }
    }
  });
  return out;
}

export interface MesureLigne { nom: string; capitaleSource: number; capitalePx: number; futsSepares: number }
export interface MesureCote { cote: number; dataUri: number; lignes: MesureLigne[] }

/** Réduit au côté voulu, encode en JPEG 0,85, relit · ce que le catalogue garderait. */
export async function mesurerCote(p: PhotoSynthetique, brut: Buffer, cote: number, qualite = 0.85, noyau: 'linear' | 'cubic' | 'mitchell' | 'lanczos3' = 'linear'): Promise<MesureCote> {
  const k = Math.min(1, cote / Math.max(p.largeur, p.hauteur));
  const w = Math.max(1, Math.round(p.largeur * k)), h = Math.max(1, Math.round(p.hauteur * k));
  const jpeg = await sharp(brut, { raw: { width: p.largeur, height: p.hauteur, channels: 3 } })
    .resize(w, h, { kernel: noyau, fit: 'fill' }).jpeg({ quality: Math.round(qualite * 100), chromaSubsampling: '4:2:0' }).toBuffer();
  const gris = await sharp(jpeg).greyscale().raw().toBuffer();
  const seuil = (BLANC + NOIR) / 2;
  const lignes = p.lignes.map((l, i) => {
    const g = geometrieLigne(p, i);
    const xa = Math.floor(g.x0 * k), xb = Math.ceil((g.x0 + FUTS_PAR_LIGNE * (g.fut + g.oeil)) * k);
    const ya = Math.max(0, Math.floor((g.y0 - g.h * 0.4) * k)), yb = Math.min(h - 1, Math.ceil((g.y0 + g.h * 1.4) * k));
    // Hauteur de capitale réelle · lignes de la bande dont le pixel le plus sombre passe sous le seuil.
    const sombres: number[] = [];
    for (let y = ya; y <= yb; y++) {
      let m = 255; for (let x = xa; x <= xb; x++) m = Math.min(m, gris[y * w + x]!);
      if (m < seuil) sombres.push(y);
    }
    const capitalePx = sombres.length ? sombres[sombres.length - 1]! - sombres[0]! + 1 : 0;
    // Fûts encore séparés · profil horizontal au milieu de la ligne, runs sous le seuil.
    const ym = Math.round((g.y0 + g.h / 2) * k);
    let runs = 0, dans = false;
    for (let x = xa - 1; x <= xb + 1; x++) {
      const v = gris[ym * w + Math.max(0, Math.min(w - 1, x))]!;
      if (v < seuil && !dans) { runs++; dans = true; } else if (v >= seuil) dans = false;
    }
    return { nom: l.nom, capitaleSource: l.capitale, capitalePx, futsSepares: Math.min(runs, FUTS_PAR_LIGNE) };
  });
  return { cote, dataUri: 'data:image/jpeg;base64,'.length + Math.ceil(jpeg.length / 3) * 4, lignes };
}
