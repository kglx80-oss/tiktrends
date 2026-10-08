import 'server-only';
import sharp from 'sharp';
import {
  alphaAvecFondu, composerParMasque, controlerHorsZone, encodageAutorise, validerMasqueBrut, zoneAutorisee,
  type ControleMasque, type MasqueBrut, type PixelsBruts,
} from '@tiktrends/core';

/**
 * Studios · L5-A · retouche ciblée en conservation stricte, sur pixels DÉCODÉS
 * (cahier 01 §11.1 ; recette IMG-06).
 *
 * Ordre imposé, dans une seule fonction pour qu'aucun appelant ne saute une
 * étape : décoder l'original et la génération en RVBA → vérifier le masque
 * (grayscale8, dimensions de la source, fondu borné) → composer
 * (`masque × génération + (1 − masque) × original`) → CONTRÔLER hors zone
 * (doit valoir zéro) → seulement alors encoder. En PNG (sans perte), le fichier
 * encodé est redécodé et recontrôlé : la preuve porte sur ce qui sera stocké.
 *
 * Aucune dépense, aucun appel externe : la génération est déjà là (octets).
 */

export type FormatSortie = 'png' | 'jpeg' | 'webp';

export type ResultatRetouche =
  | { ok: true; octets: Buffer; mime: string; controle: ControleMasque; controleApresEncodage: ControleMasque | null }
  | { ok: false; raison: string; controle: ControleMasque | null };

export async function decoderRvba(octets: Uint8Array, redimension?: { largeur: number; hauteur: number }): Promise<PixelsBruts> {
  let s = sharp(octets).ensureAlpha();
  if (redimension) s = s.resize(redimension.largeur, redimension.hauteur, { fit: 'fill', kernel: 'lanczos3' });
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  return { largeur: info.width, hauteur: info.height, canaux: 4, donnees: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

/** Compteur d'encodages · la garde vérifie qu'un contrôle non conforme n'encode RIEN. */
export const statistiquesEncodage = { encodages: 0 };

async function encoder(p: PixelsBruts, format: FormatSortie): Promise<{ octets: Buffer; mime: string }> {
  statistiquesEncodage.encodages++;
  const s = sharp(Buffer.from(p.donnees), { raw: { width: p.largeur, height: p.hauteur, channels: 4 } });
  if (format === 'png') return { octets: await s.png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer(), mime: 'image/png' };
  if (format === 'jpeg') return { octets: await s.flatten({ background: '#ffffff' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer(), mime: 'image/jpeg' };
  return { octets: await s.webp({ quality: 92 }).toBuffer(), mime: 'image/webp' };
}

export interface EntreeRetouche {
  /** Octets encodés de la source (le média à retoucher). */
  original: Uint8Array;
  /** Octets encodés renvoyés par la génération. */
  generation: Uint8Array;
  masque: MasqueBrut;
  featherPx: number;
  format: FormatSortie;
  /**
   * Ramène explicitement la génération aux dimensions de la source avant la
   * composition (un fournisseur rend souvent une autre taille). Sans cette
   * option, des dimensions différentes sont un refus.
   */
  redimensionnerGeneration?: boolean;
  /** Point d'injection pour la garde de mutation · jamais utilisé en production. */
  composer?: typeof composerParMasque;
}

export async function appliquerMasqueAuxPixels(e: EntreeRetouche): Promise<ResultatRetouche> {
  const original = await decoderRvba(e.original);
  const refus = validerMasqueBrut(e.masque, original, e.featherPx);
  if (refus.length) return { ok: false, raison: refus.join(' · '), controle: null };
  const generation = await decoderRvba(e.generation, e.redimensionnerGeneration ? original : undefined);
  if (generation.largeur !== original.largeur || generation.hauteur !== original.hauteur) {
    return { ok: false, raison: `génération ${generation.largeur}×${generation.hauteur} aux dimensions différentes de la source ${original.largeur}×${original.hauteur}`, controle: null };
  }
  const resultat = (e.composer ?? composerParMasque)(original, generation, alphaAvecFondu(e.masque, e.featherPx));
  const zone = zoneAutorisee(e.masque, e.featherPx);
  const controle = controlerHorsZone(original, resultat, zone);
  if (!encodageAutorise(controle)) {
    return { ok: false, raison: `${controle.pixelsHorsZone} pixel(s) modifié(s) hors de la zone autorisée · rien n’est encodé`, controle };
  }
  const { octets, mime } = await encoder(resultat, e.format);
  let controleApresEncodage: ControleMasque | null = null;
  if (e.format === 'png') {
    controleApresEncodage = controlerHorsZone(original, await decoderRvba(octets), zone);
    if (!controleApresEncodage.conforme) return { ok: false, raison: 'le fichier encodé diffère du résultat contrôlé', controle: controleApresEncodage };
  }
  return { ok: true, octets, mime, controle, controleApresEncodage };
}
