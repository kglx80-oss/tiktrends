/**
 * Studios · L5-A · mode « Produit fidèle » (cahier 01 §4.4 point 5 ; recette IMG-02).
 *
 * Pur. Par défaut pour un packshot : le produit est un calque image dont les
 * pixels viennent de la PHOTO SOURCE ; il n'est jamais régénéré. Le décor est
 * un autre calque (généré séparément), placé DESSOUS, et l'assemblage est
 * déterministe (compositeur serveur). Une génération de décor « en place »
 * (mise en scène sur toute l'image) passe par un masque qui PROTÈGE le produit
 * (`masqueDecorProtegeantProduit`) : le contrôle hors zone garantit alors au
 * pixel que le produit n'a pas bougé.
 *
 * Ce module dit si un document respecte ce mode ; il ne corrige rien en silence.
 */

import type { CalqueImage, CalqueStudio, DocumentStudio, ViolationStudio } from '../document';
import { etirementPx, intersection, boiteEnglobante, type Rect } from './geometrie';
import { distanceAuSupport, type MasqueBrut } from './masque';

/** Tolérance d'étirement · l'arrondi au pixel d'une hauteur proportionnelle (≤ 1 px, IMG-05). */
export const ETIREMENT_TOLERE_PX = 1;

export interface PlanProduitFidele {
  produitId: string;
  /** Calques image sous le produit · le décor, régénérable sans toucher au produit. */
  decors: string[];
  /** Calques au-dessus qui recouvrent le produit (texte, forme, logo) · signalés, pas interdits. */
  recouvrements: string[];
  violations: ViolationStudio[];
}

export function verifierProduitFidele(doc: Pick<DocumentStudio, 'layers'>, produitId: string): PlanProduitFidele {
  const v: ViolationStudio[] = [];
  const p = Object.prototype.hasOwnProperty.call(doc.layers, produitId) ? doc.layers[produitId] : undefined;
  const ch = `/document/layers/${produitId}`;
  if (!p || p.kind !== 'image') {
    return { produitId, decors: [], recouvrements: [], violations: [{ chemin: ch, raison: 'le calque produit doit être un calque image du document' }] };
  }
  if (!p.visible) v.push({ chemin: `${ch}/visible`, raison: 'le produit doit être visible' });
  if (p.opacity !== 1) v.push({ chemin: `${ch}/opacity`, raison: 'le produit doit être opaque (opacité 1) · le décor transparaîtrait sur ses pixels' });
  if (p.mask !== null) v.push({ chemin: `${ch}/mask`, raison: 'un masque de retouche sur le produit le ferait régénérer · retouche le décor, pas le produit' });
  if (etirementPx(p) > ETIREMENT_TOLERE_PX) v.push({ chemin: ch, raison: `produit étiré de ${etirementPx(p).toFixed(1)} px · garde les proportions de la photo source` });

  const boite = boiteEnglobante(p);
  const decors: string[] = [];
  const recouvrements: string[] = [];
  for (const l of Object.values(doc.layers) as CalqueStudio[]) {
    if (l.id === p.id || !l.visible) continue;
    if (l.z < p.z) { if (l.kind === 'image') decors.push(l.id); continue; }
    if (!intersection(boite, boiteEnglobante(l))) continue;
    if (l.kind === 'image') v.push({ chemin: `/document/layers/${l.id}`, raison: 'une image recouvre le produit · le décor doit rester SOUS le produit' });
    else recouvrements.push(l.id);
  }
  return { produitId, decors: decors.sort(), recouvrements: recouvrements.sort(), violations: v };
}

/**
 * Masque d'une génération de décor « en place » : 255 partout, 0 sur
 * l'empreinte du produit (alpha > 0 dans le document) ÉLARGIE de
 * `margePx + featherPx`, pour que même la bande de fondu n'atteigne jamais le
 * produit. Dimensions = document (la source de cette retouche est le rendu).
 */
export function masqueDecorProtegeantProduit(
  largeur: number,
  hauteur: number,
  alphaProduit: Uint8Array,
  margePx: number,
  featherPx: number,
): MasqueBrut {
  if (alphaProduit.length !== largeur * hauteur) throw new Error('empreinte du produit aux dimensions du document attendue');
  const empreinte = { largeur, hauteur, donnees: alphaProduit };
  const d2 = distanceAuSupport(empreinte);
  const r = margePx + featherPx;
  const out = new Uint8Array(largeur * hauteur);
  for (let i = 0; i < out.length; i++) out[i] = d2[i]! <= r * r ? 0 : 255;
  return { format: 'grayscale8', largeur, hauteur, donnees: out };
}

/** Rectangle entier du produit, pour compter ses pixels dans un rendu. */
export function rectProduit(p: CalqueImage): Rect {
  return boiteEnglobante(p);
}
