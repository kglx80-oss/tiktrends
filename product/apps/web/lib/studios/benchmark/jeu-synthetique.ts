/**
 * Benchmark Studios · jeu de données SYNTHÉTIQUE (`datasetPolicy` : « créer
 * médias originaux synthétiques locaux, figer hashes et droits »).
 *
 * Chaque média est dessiné au pixel près par le noyau (`raster.ts`) : mêmes
 * octets bruts à chaque génération, donc même `pixelsSha256`, quelle que soit
 * la version de l'encodeur. Le PNG (encodé par sharp) et sa propre empreinte
 * sont figés dans `docs/studios-v2/benchmark/jeu-synthetique/manifeste.json`.
 * Les sons sont des sinusoïdes PCM écrites à la main (WAV).
 *
 * Droits : tout est créé pour ce test, sans aucune source client, marque
 * réelle, personne réelle ni contenu tiers. La « référence contaminante » de
 * F02 (une silhouette et un logo) est elle aussi dessinée ici.
 */

import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  copier, ellipse, imageVide, quadrillage, rectangle,
  type Couleur, type Image,
} from '@tiktrends/core';

export const DROITS_SYNTHETIQUES = 'Créé pour le test par le lot F-C · synthétique, dessiné par code · aucune source client, marque, personne ni contenu tiers · usage interne de recette.';

export interface MediaSynthetique {
  id: string;
  fichier: string;
  mime: 'image/png' | 'audio/wav';
  description: string;
  cas: string[];
  largeur: number | null;
  hauteur: number | null;
  dureeMs: number | null;
  /** RGBA brut (images) · `null` pour un son. */
  image: Image | null;
  octets: Buffer;
  /** SHA-256 du fichier encodé. */
  sha256: string;
  /** SHA-256 des pixels bruts RGBA (images) ou du fichier (sons) · indépendant de l'encodeur. */
  contenuSha256: string;
}

export interface EntreeManifeste {
  id: string; fichier: string; mime: string; description: string; cas: string[];
  largeur: number | null; hauteur: number | null; dureeMs: number | null;
  octets: number; sha256: string; contenuSha256: string; droits: string; generateur: string;
}

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

const BLEU: Couleur = [30, 80, 200, 255];
const BLEU_CLAIR: Couleur = [90, 140, 230, 255];

/* ─────────────────────────────── images ─────────────────────────────────── */

export function lunettes(): Image {
  const img = imageVide(240, 120);
  ellipse(img, 60, 60, 50, 40, BLEU, 8);
  ellipse(img, 180, 60, 50, 40, BLEU, 8);
  rectangle(img, 108, 52, 24, 8, BLEU);
  return img;
}

export function bandeau(): Image {
  const img = imageVide(240, 60);
  rectangle(img, 0, 15, 240, 30, BLEU_CLAIR);
  rectangle(img, 0, 27, 240, 6, BLEU);
  return img;
}

function produitBleu(): Image {
  const img = imageVide(160, 160);
  ellipse(img, 80, 80, 70, 70, BLEU);
  ellipse(img, 80, 80, 30, 30, BLEU_CLAIR);
  return img;
}

/** Référence « clay » contaminante : fond argile, silhouette et logo tiers dessinés. */
function referenceClay(): Image {
  const img = imageVide(256, 256, [196, 150, 112, 255]);
  ellipse(img, 70, 80, 22, 22, [235, 190, 170, 255]);          // tête de la silhouette
  rectangle(img, 52, 104, 36, 80, [220, 90, 140, 255]);        // robe
  rectangle(img, 170, 30, 60, 60, [20, 20, 20, 255]);          // logo tiers
  rectangle(img, 185, 45, 30, 30, [250, 250, 250, 255]);
  return img;
}

/** Étalon F05 : quadrillage interne, rectangle gauche (la zone retouchable). */
export const ZONE_F05 = { x: 16, y: 64, largeur: 96, hauteur: 128 } as const;
function etalonF05(): Image {
  const img = quadrillage(imageVide(256, 256, [255, 255, 255, 255]), 16, [180, 180, 180, 255]);
  return rectangle(img, ZONE_F05.x, ZONE_F05.y, ZONE_F05.largeur, ZONE_F05.hauteur, [60, 60, 60, 255]);
}
function masqueF05(): Image {
  return rectangle(imageVide(256, 256, [0, 0, 0, 255]), ZONE_F05.x, ZONE_F05.y, ZONE_F05.largeur, ZONE_F05.hauteur, [255, 255, 255, 255]);
}

export function produitF06(): Image {
  const img = imageVide(400, 300);
  rectangle(img, 0, 0, 400, 300, [40, 120, 90, 255]);
  rectangle(img, 40, 40, 320, 60, [230, 230, 230, 255]);
  return img;
}

function boiteF07(): Image {
  const img = imageVide(256, 256, [245, 245, 245, 255]);
  rectangle(img, 48, 80, 160, 120, [150, 100, 60, 255]);
  rectangle(img, 48, 80, 160, 16, [120, 80, 45, 255]);
  return img;
}

function afficheF13(): Image {
  const img = imageVide(256, 256, [250, 240, 220, 255]);
  ellipse(img, 128, 110, 60, 60, BLEU);
  rectangle(img, 48, 200, 160, 20, [40, 40, 40, 255]);
  return img;
}

/** Flacon transparent (alpha 110) à l'étiquette fine opaque. */
function flaconF15(): Image {
  const img = imageVide(200, 300);
  rectangle(img, 50, 80, 100, 200, [200, 230, 240, 110]);
  rectangle(img, 80, 40, 40, 40, [200, 230, 240, 110]);
  rectangle(img, 55, 170, 90, 10, [20, 40, 120, 255]);
  return img;
}

/** Personnage original : cheveux courts noirs, veste verte, tient un flacon. */
function personnageF20(): Image {
  const img = imageVide(200, 300);
  ellipse(img, 100, 60, 34, 38, [230, 190, 160, 255]);
  rectangle(img, 66, 22, 68, 22, [15, 15, 15, 255]);
  rectangle(img, 60, 100, 80, 120, [40, 140, 70, 255]);
  rectangle(img, 140, 140, 20, 50, [200, 230, 240, 255]);
  rectangle(img, 70, 220, 25, 70, [40, 40, 60, 255]);
  rectangle(img, 105, 220, 25, 70, [40, 40, 60, 255]);
  return img;
}

/* ──────────────────────────────── sons ──────────────────────────────────── */

/** WAV PCM 16 bits mono 8 kHz d'une sinusoïde · octets entièrement déterminés. */
export function wavSinus(frequence: number, dureeMs: number, amplitude = 8000): Buffer {
  const taux = 8000;
  const n = Math.round((taux * dureeMs) / 1000);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(taux, 24);
  b.writeUInt32LE(taux * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(amplitude * Math.sin((2 * Math.PI * frequence * i) / taux)), 44 + i * 2);
  return b;
}

/* ─────────────────────────────── catalogue ──────────────────────────────── */

interface Recette { id: string; description: string; cas: string[]; image?: () => Image; son?: { frequence: number; dureeMs: number } }

const RECETTES: Recette[] = [
  { id: 'f01-lunettes-bleues', description: 'Lunettes synthétiques bleues (calque produit)', cas: ['F01', 'F07'], image: lunettes },
  { id: 'f01-bandeau-bleu', description: 'Bandeau bleu requis (accessoire)', cas: ['F01'], image: bandeau },
  { id: 'f02-produit-bleu', description: 'Produit bleu à la matière protégée', cas: ['F02'], image: produitBleu },
  { id: 'f02-reference-clay', description: 'Référence clay contaminante : silhouette et logo tiers dessinés', cas: ['F02'], image: referenceClay },
  { id: 'f05-etalon', description: 'Image étalon : quadrillage interne et rectangle gauche', cas: ['F05'], image: etalonF05 },
  { id: 'f05-masque', description: 'Masque du rectangle gauche (blanc = zone retouchable)', cas: ['F05'], image: masqueF05 },
  { id: 'f06-produit', description: 'Produit 400×300 pour la géométrie exacte', cas: ['F06', 'F14'], image: produitF06 },
  { id: 'f07-boite', description: 'Sortie fautive : une boîte au lieu des lunettes', cas: ['F07'], image: boiteF07 },
  { id: 'f13-affiche', description: 'Source image seule, sans audio ni vidéo', cas: ['F13'], image: afficheF13 },
  { id: 'f15-flacon', description: 'Flacon transparent à l’étiquette fine', cas: ['F15'], image: flaconF15 },
  { id: 'f20-personnage', description: 'Personnage original : cheveux courts noirs, veste verte, flacon tenu', cas: ['F16', 'F20'], image: personnageF20 },
  { id: 'f09-narration', description: 'Narration existante du projet de F09 (sinusoïde 440 Hz, 1 s)', cas: ['F09'], son: { frequence: 440, dureeMs: 1000 } },
  { id: 'f24-narration', description: 'Narration à conserver de F24 (sinusoïde 330 Hz, 1 s)', cas: ['F16', 'F24'], son: { frequence: 330, dureeMs: 1000 } },
];

async function png(img: Image): Promise<Buffer> {
  return sharp(Buffer.from(img.pixels), { raw: { width: img.largeur, height: img.hauteur, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

/** Décode un PNG en RGBA brut (pour relire un fichier ou une sortie fournisseur). */
export async function decoder(octets: Buffer): Promise<Image> {
  const { data, info } = await sharp(octets).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { largeur: info.width, hauteur: info.height, pixels: new Uint8Array(data) };
}

export async function encoder(img: Image): Promise<Buffer> {
  return png(img);
}

export const empreintePixels = (img: Image) => sha(img.pixels);

/** Génère tout le jeu en mémoire · déterministe. */
export async function genererJeu(): Promise<Map<string, MediaSynthetique>> {
  const out = new Map<string, MediaSynthetique>();
  for (const r of RECETTES) {
    if (r.image) {
      const image = r.image();
      const octets = await png(image);
      out.set(r.id, { id: r.id, fichier: `${r.id}.png`, mime: 'image/png', description: r.description, cas: r.cas, largeur: image.largeur, hauteur: image.hauteur, dureeMs: null, image, octets, sha256: sha(octets), contenuSha256: sha(image.pixels) });
    } else if (r.son) {
      const octets = wavSinus(r.son.frequence, r.son.dureeMs);
      out.set(r.id, { id: r.id, fichier: `${r.id}.wav`, mime: 'audio/wav', description: r.description, cas: r.cas, largeur: null, hauteur: null, dureeMs: r.son.dureeMs, image: null, octets, sha256: sha(octets), contenuSha256: sha(octets) });
    }
  }
  return out;
}

export function manifeste(jeu: Map<string, MediaSynthetique>): EntreeManifeste[] {
  return [...jeu.values()].map((m) => ({
    id: m.id, fichier: m.fichier, mime: m.mime, description: m.description, cas: m.cas,
    largeur: m.largeur, hauteur: m.hauteur, dureeMs: m.dureeMs, octets: m.octets.length, sha256: m.sha256, contenuSha256: m.contenuSha256,
    droits: DROITS_SYNTHETIQUES, generateur: m.image ? 'raster du noyau (packages/core/src/studios/benchmark/raster.ts) + sharp PNG' : 'WAV PCM écrit par code',
  }));
}

/** Copie de travail d'une image du jeu (jamais l'original). */
export function imageDuJeu(jeu: Map<string, MediaSynthetique>, id: string): Image {
  const m = jeu.get(id);
  if (!m?.image) throw new Error(`Image « ${id} » absente du jeu synthétique`);
  return copier(m.image);
}

