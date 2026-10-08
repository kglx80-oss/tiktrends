/**
 * Benchmark Studios · pixels bruts RGBA, sans dépendance.
 *
 * Sert deux choses, toutes deux DÉTERMINISTES :
 *  - fabriquer le jeu de données synthétique (formes simples dessinées au
 *    pixel près : le même code rend toujours les mêmes octets, donc la même
 *    empreinte, quelle que soit la version de l'encodeur PNG) ;
 *  - mesurer les oracles qui ne demandent aucun jugement : pixels changés hors
 *    d'un masque (F05), boîte englobante d'un calque rendu (F06).
 *
 * Pur : ni fichier, ni réseau, ni horloge. L'encodage PNG reste au serveur.
 */

export interface Image {
  largeur: number;
  hauteur: number;
  /** RGBA, 4 octets par pixel, ligne par ligne. */
  pixels: Uint8Array;
}

export type Couleur = readonly [number, number, number, number];

export function imageVide(largeur: number, hauteur: number, fond: Couleur = [0, 0, 0, 0]): Image {
  if (!Number.isInteger(largeur) || !Number.isInteger(hauteur) || largeur <= 0 || hauteur <= 0 || largeur > 4096 || hauteur > 4096) {
    throw new Error(`Dimensions invalides ${largeur}×${hauteur}`);
  }
  const pixels = new Uint8Array(largeur * hauteur * 4);
  for (let i = 0; i < largeur * hauteur; i++) pixels.set(fond, i * 4);
  return { largeur, hauteur, pixels };
}

export function copier(img: Image): Image {
  return { largeur: img.largeur, hauteur: img.hauteur, pixels: new Uint8Array(img.pixels) };
}

function poser(img: Image, x: number, y: number, c: Couleur): void {
  if (x < 0 || y < 0 || x >= img.largeur || y >= img.hauteur) return;
  img.pixels.set(c, (y * img.largeur + x) * 4);
}

export function rectangle(img: Image, x: number, y: number, l: number, h: number, c: Couleur): Image {
  for (let j = Math.max(0, y); j < Math.min(img.hauteur, y + h); j++) {
    for (let i = Math.max(0, x); i < Math.min(img.largeur, x + l); i++) poser(img, i, j, c);
  }
  return img;
}

/** Ellipse pleine (ou anneau si `epaisseur` est donnée), centre et demi-axes entiers. */
export function ellipse(img: Image, cx: number, cy: number, rx: number, ry: number, c: Couleur, epaisseur?: number): Image {
  for (let j = cy - ry; j <= cy + ry; j++) {
    for (let i = cx - rx; i <= cx + rx; i++) {
      const d = ((i - cx) * (i - cx)) / (rx * rx) + ((j - cy) * (j - cy)) / (ry * ry);
      if (d > 1) continue;
      if (epaisseur !== undefined) {
        const ix = Math.max(1, rx - epaisseur);
        const iy = Math.max(1, ry - epaisseur);
        const di = ((i - cx) * (i - cx)) / (ix * ix) + ((j - cy) * (j - cy)) / (iy * iy);
        if (di < 1) continue;
      }
      poser(img, i, j, c);
    }
  }
  return img;
}

/** Quadrillage : une ligne de `couleur` tous les `pas` pixels. */
export function quadrillage(img: Image, pas: number, c: Couleur): Image {
  for (let j = 0; j < img.hauteur; j++) {
    for (let i = 0; i < img.largeur; i++) if (i % pas === 0 || j % pas === 0) poser(img, i, j, c);
  }
  return img;
}

/** Étoile simple à cinq branches, tracée par rayons (déterministe). */
export function etoile(img: Image, cx: number, cy: number, r: number, c: Couleur): Image {
  for (let j = cy - r; j <= cy + r; j++) {
    for (let i = cx - r; i <= cx + r; i++) {
      const dx = i - cx;
      const dy = j - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      const a = Math.atan2(dy, dx);
      const branche = Math.abs(Math.cos((5 * a) / 2));
      if (d <= r * (0.38 + 0.62 * branche)) poser(img, i, j, c);
    }
  }
  return img;
}

/** Colle `src` sur `dst` en (x, y), alpha simple (opaque si alpha > 0). */
export function coller(dst: Image, src: Image, x: number, y: number): Image {
  for (let j = 0; j < src.hauteur; j++) {
    for (let i = 0; i < src.largeur; i++) {
      const o = (j * src.largeur + i) * 4;
      if (src.pixels[o + 3]! === 0) continue;
      poser(dst, x + i, y + j, [src.pixels[o]!, src.pixels[o + 1]!, src.pixels[o + 2]!, src.pixels[o + 3]!]);
    }
  }
  return dst;
}

/** Redimensionnement au plus proche voisin · aucune interpolation, donc aucune couleur inventée. */
export function redimensionner(src: Image, largeur: number, hauteur: number): Image {
  const out = imageVide(largeur, hauteur);
  for (let j = 0; j < hauteur; j++) {
    for (let i = 0; i < largeur; i++) {
      const si = Math.min(src.largeur - 1, Math.floor((i * src.largeur) / largeur));
      const sj = Math.min(src.hauteur - 1, Math.floor((j * src.hauteur) / hauteur));
      out.pixels.set(src.pixels.subarray((sj * src.largeur + si) * 4, (sj * src.largeur + si) * 4 + 4), (j * largeur + i) * 4);
    }
  }
  return out;
}

/** Boîte englobante des pixels non transparents · `null` si l'image est vide. */
export function boiteOpaque(img: Image, seuilAlpha = 0): { x: number; y: number; largeur: number; hauteur: number } | null {
  let x0 = Infinity; let y0 = Infinity; let x1 = -1; let y1 = -1;
  for (let j = 0; j < img.hauteur; j++) {
    for (let i = 0; i < img.largeur; i++) {
      if (img.pixels[(j * img.largeur + i) * 4 + 3]! > seuilAlpha) {
        if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, largeur: x1 - x0 + 1, hauteur: y1 - y0 + 1 };
}

/**
 * Pixels changés entre deux images de même taille, séparés selon un masque
 * (pixel du masque « dans la zone » si sa composante rouge dépasse 127).
 * Oracle F05 : AUCUN pixel hors masque ne doit changer avant encodage.
 */
export function comparerSousMasque(avant: Image, apres: Image, masque: Image): { horsMasque: number; dansMasque: number } | null {
  if (avant.largeur !== apres.largeur || avant.hauteur !== apres.hauteur || masque.largeur !== avant.largeur || masque.hauteur !== avant.hauteur) return null;
  let horsMasque = 0;
  let dansMasque = 0;
  for (let p = 0; p < avant.largeur * avant.hauteur; p++) {
    const o = p * 4;
    const change = avant.pixels[o] !== apres.pixels[o] || avant.pixels[o + 1] !== apres.pixels[o + 1] || avant.pixels[o + 2] !== apres.pixels[o + 2] || avant.pixels[o + 3] !== apres.pixels[o + 3];
    if (!change) continue;
    if (masque.pixels[o]! > 127) dansMasque++;
    else horsMasque++;
  }
  return { horsMasque, dansMasque };
}
