import { inflateSync } from 'node:zlib';

/**
 * Décodeur PNG minimal · juste assez pour MESURER un rendu.
 *
 * ── Pourquoi on décode vraiment les pixels ───────────────────────────────────
 *
 * On a livré une maquette illisible en réduisant le canevas sans redimensionner
 * l'arbre, et rien ne l'a vu : la compilation passait, le lint passait, huit
 * cents tests passaient. Un rendu ne se vérifie pas en regardant le code qui
 * l'a produit · il se vérifie en regardant ce qui en sort.
 *
 * On ne compare pas des images (une différence d'un pixel ferait échouer pour
 * rien). On mesure **où se trouve l'encre**, en bandes horizontales relatives.
 * Deux rendus proportionnels ont le même profil, quelle que soit leur taille.
 *
 * Le décodeur ne gère que ce que resvg produit : 8 bits, RVBA, non entrelacé.
 */

export interface Image { width: number; height: number; rgba: Uint8Array }

export function decodePng(buf: Buffer): Image {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('pas un PNG');

  let width = 0, height = 0, depth = 0, couleur = 0, entrelace = 0;
  const morceaux: Buffer[] = [];

  let i = 8;
  while (i < buf.length) {
    const taille = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + taille);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8]!; couleur = data[9]!; entrelace = data[12]!;
    } else if (type === 'IDAT') {
      morceaux.push(data);
    } else if (type === 'IEND') break;
    i += 12 + taille;
  }

  if (depth !== 8 || couleur !== 6 || entrelace !== 0) {
    throw new Error(`PNG non géré : profondeur ${depth}, couleur ${couleur}, entrelacé ${entrelace}`);
  }

  const brut = inflateSync(Buffer.concat(morceaux));
  const canaux = 4;
  const parLigne = width * canaux;
  const rgba = new Uint8Array(width * height * canaux);

  // Défiltrage · chaque ligne porte son type de filtre en premier octet.
  for (let y = 0; y < height; y++) {
    const filtre = brut[y * (parLigne + 1)]!;
    const src = (y * (parLigne + 1)) + 1;
    const dst = y * parLigne;
    for (let x = 0; x < parLigne; x++) {
      const val = brut[src + x]!;
      const a = x >= canaux ? rgba[dst + x - canaux]! : 0;          // gauche
      const b = y > 0 ? rgba[dst - parLigne + x]! : 0;              // haut
      const c = (x >= canaux && y > 0) ? rgba[dst - parLigne + x - canaux]! : 0; // diagonale
      let out: number;
      switch (filtre) {
        case 0: out = val; break;
        case 1: out = val + a; break;
        case 2: out = val + b; break;
        case 3: out = val + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          out = val + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`filtre PNG inconnu : ${filtre}`);
      }
      rgba[dst + x] = out & 0xff;
    }
  }

  return { width, height, rgba };
}

/**
 * Où se trouve l'encre, en bandes horizontales.
 *
 * Rend, pour chaque bande, la part de pixels clairs · le texte et les boutons
 * d'une pub sont clairs sur un fond sombre. C'est grossier, et c'est exactement
 * ce qu'il faut : on cherche à savoir si la composition occupe les mêmes zones,
 * pas si deux images sont identiques.
 */
export function inkProfile(img: Image, bandes = 10): number[] {
  const out: number[] = [];
  const hauteurBande = Math.floor(img.height / bandes);

  for (let b = 0; b < bandes; b++) {
    let clairs = 0, total = 0;
    for (let y = b * hauteurBande; y < (b + 1) * hauteurBande; y++) {
      for (let x = 0; x < img.width; x++) {
        const p = (y * img.width + x) * 4;
        const lum = (img.rgba[p]! * 0.2126 + img.rgba[p + 1]! * 0.7152 + img.rgba[p + 2]! * 0.0722);
        if (lum > 140) clairs++;
        total++;
      }
    }
    out.push(total ? clairs / total : 0);
  }
  return out;
}

/**
 * Deux mesures qui résument une composition.
 *
 * ── Pourquoi pas le profil bande à bande ─────────────────────────────────────
 *
 * Un texte ne se recompose pas proportionnellement : à 40 %, une accroche peut
 * tenir sur deux lignes là où elle en prenait trois, et tout le bloc remonte
 * d'une bande. C'est correct, et le profil bande à bande le signale comme une
 * faute · il mesure trop finement pour ce qu'on veut savoir.
 *
 * ── Ce qui distingue vraiment les deux cas ───────────────────────────────────
 *
 * Une maquette qui se recompose garde **la même quantité d'encre** et **le même
 * centre de gravité**. Une maquette qui ne se redimensionne pas voit son texte
 * exploser : elle couvre bien plus de surface, et son centre remonte vers le
 * titre devenu géant. C'est exactement la régression qu'on a livrée.
 */
export interface Composition {
  /** Part de la surface occupée par des pixels clairs. */
  ink: number;
  /** Hauteur du centre de gravité de l'encre, de 0 (haut) à 1 (bas). */
  center: number;
}

export function composition(img: Image): Composition {
  let clairs = 0, sommeY = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const p = (y * img.width + x) * 4;
      const lum = img.rgba[p]! * 0.2126 + img.rgba[p + 1]! * 0.7152 + img.rgba[p + 2]! * 0.0722;
      if (lum > 140) { clairs++; sommeY += y; }
    }
  }
  const total = img.width * img.height;
  return {
    ink: clairs / total,
    center: clairs ? (sommeY / clairs) / img.height : 0.5,
  };
}

/**
 * La luminance médiane d'une bande horizontale.
 *
 * ── Une première version passait pour la mauvaise raison ─────────────────────
 *
 * J'ai d'abord mesuré l'ÉCART de luminance dans la bande. Vérifié en retirant le
 * voile sombre de la mise en page immersive : le test restait vert. Le bouton
 * d'action, coloré et saturé, fournissait l'écart à lui seul · la bande pouvait
 * être entièrement blanche derrière un titre blanc, la mesure ne s'en apercevait
 * pas.
 *
 * ── Ce qu'il faut mesurer ────────────────────────────────────────────────────
 *
 * Pas l'écart, mais **le fond sur lequel l'encre se pose**. Une encre blanche
 * exige un fond sombre, une encre sombre un fond clair · c'est exactement ce que
 * les voiles et les aplats sont censés garantir.
 *
 * La médiane, pas la moyenne : quelques pixels d'accent ne doivent pas déplacer
 * le verdict sur le fond.
 */
export function bandLuminance(img: Image, from: number, to: number): number {
  const y0 = Math.max(0, Math.floor(img.height * from));
  const y1 = Math.min(img.height, Math.ceil(img.height * to));
  const lum: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      // Luminance perçue · le vert pèse plus que le rouge et le bleu.
      lum.push((0.2126 * img.rgba[i]! + 0.7152 * img.rgba[i + 1]! + 0.0722 * img.rgba[i + 2]!) / 255);
    }
  }
  if (!lum.length) return 0;
  lum.sort((a, b) => a - b);
  return lum[Math.floor(lum.length / 2)]!;
}
