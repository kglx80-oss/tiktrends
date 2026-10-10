/**
 * Studios · G-B · retouche masquée en conservation stricte, sur pixels DÉCODÉS
 * (cahier 01 §11.1 ; recette IMG-06, benchmark F05).
 *
 * Pur. La même suite que `appliquerMasqueAuxPixels` (L5-A, côté site), mais
 * sans décodeur ni encodeur : le worker (`apps/workers/src/studios/retouche.ts`)
 * décode avec `sharp`, appelle CETTE fonction, puis encode et recontrôle le
 * fichier. Le site ne peut pas être importé par le worker (`server-only`) :
 * la règle vit donc ici, une fois, pour les deux.
 *
 * Ordre imposé dans une seule fonction (aucun appelant ne saute une étape) :
 *   masque valide pour la source → génération aux dimensions de la source →
 *   composition `alpha × génération + (1 − alpha) × original` → CONTRÔLE hors
 *   zone (support + fondu), indépendant de la composition → refus si un seul
 *   pixel a bougé hors zone. Ce qui sort n'est jamais la génération brute.
 */

import {
  alphaAvecFondu, composerParMasque, controlerHorsZone, encodageAutorise, validerMasqueBrut, zoneAutorisee,
  type ControleMasque, type MasqueBrut, type PixelsBruts,
} from './masque';

export type ResultatRetoucheStricte =
  | { ok: true; resultat: PixelsBruts; zone: Uint8Array; controle: ControleMasque }
  | { ok: false; raison: string; controle: ControleMasque | null };

/**
 * Compose une génération dans la source sous le masque canonique, puis
 * contrôle. `original` et `generation` : mêmes dimensions, mêmes canaux
 * (le worker décode les deux en RVBA). `composer` : point d'injection des
 * gardes de mutation, jamais utilisé en production.
 */
export function composerRetoucheStricte(e: {
  original: PixelsBruts;
  generation: PixelsBruts;
  masque: MasqueBrut;
  featherPx: number;
  composer?: typeof composerParMasque;
}): ResultatRetoucheStricte {
  const refus = validerMasqueBrut(e.masque, e.original, e.featherPx);
  if (refus.length) return { ok: false, raison: refus.join(' · '), controle: null };
  if (e.generation.largeur !== e.original.largeur || e.generation.hauteur !== e.original.hauteur) {
    return { ok: false, raison: `génération ${e.generation.largeur}×${e.generation.hauteur} aux dimensions différentes de la source ${e.original.largeur}×${e.original.hauteur}`, controle: null };
  }
  if (e.generation.canaux !== e.original.canaux) {
    return { ok: false, raison: `canaux différents (${e.original.canaux} et ${e.generation.canaux})`, controle: null };
  }
  const resultat = (e.composer ?? composerParMasque)(e.original, e.generation, alphaAvecFondu(e.masque, e.featherPx));
  const zone = zoneAutorisee(e.masque, e.featherPx);
  const controle = controlerHorsZone(e.original, resultat, zone);
  if (!encodageAutorise(controle)) {
    return { ok: false, raison: `${controle.pixelsHorsZone} pixel(s) modifié(s) hors de la zone autorisée · rien n’est livré`, controle };
  }
  return { ok: true, resultat, zone, controle };
}

/** Un masque canonique depuis des octets gris décodés (un octet par pixel). */
export function masqueDepuisGris(largeur: number, hauteur: number, donnees: Uint8Array): MasqueBrut {
  return { format: 'grayscale8', largeur, hauteur, donnees: new Uint8Array(donnees) };
}

/**
 * Conversion EXPLICITE d'une image RVBA noir/blanc en masque canonique : un
 * pixel est dans la zone si sa composante rouge dépasse 127 (la convention de
 * l'oracle F05, `comparerSousMasque`). Sert au jeu synthétique du benchmark,
 * antérieur au format canonique ; jamais appliquée à un masque stocké.
 */
export function masqueDepuisRvba(largeur: number, hauteur: number, rvba: Uint8Array): MasqueBrut {
  if (rvba.length !== largeur * hauteur * 4) throw new Error('masque RVBA · taille des pixels incohérente');
  const d = new Uint8Array(largeur * hauteur);
  for (let p = 0; p < d.length; p++) d[p] = rvba[p * 4]! > 127 ? 255 : 0;
  return { format: 'grayscale8', largeur, hauteur, donnees: d };
}

/**
 * Boîte englobante du support (pixels non nuls), en pixels source, bords
 * exclus à droite et en bas · `null` pour un masque vide (rien à retoucher).
 */
export function boiteDuMasque(m: Pick<MasqueBrut, 'largeur' | 'hauteur' | 'donnees'>): { x0: number; y0: number; x1: number; y1: number; pixels: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, pixels = 0;
  for (let y = 0; y < m.hauteur; y++) {
    for (let x = 0; x < m.largeur; x++) {
      if (!m.donnees[y * m.largeur + x]) continue;
      pixels++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return pixels === 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1, pixels };
}
