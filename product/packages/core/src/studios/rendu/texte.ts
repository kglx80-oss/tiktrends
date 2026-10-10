/**
 * Studios · L5-A · mise en page du texte d'un calque (cahier 01 §11.1 : « texte
 * reste éditable », « mêmes métriques au rendu »).
 *
 * Pur. Le noyau coupe les lignes et place chaque glyphe ; le rendu serveur
 * dessine EXACTEMENT ces positions (contours lus dans le même fichier de
 * police). Aucun moteur de texte tiers ne décide d'une coupure.
 *
 * Règles · retours à la ligne explicites respectés ; coupure gloutonne aux
 * espaces ordinaires (U+0020) ; l'espace insécable et l'espace fine insécable
 * ne coupent jamais ; un mot plus large que la boîte est coupé entre deux
 * caractères (`coupureForcee`). Interligne « à la CSS » : boîte de ligne =
 * taille × interligne, ascendant + descendant centrés dedans. Alignement
 * horizontal dans la largeur du calque ; le texte part du HAUT de la boîte.
 */

import type { CalqueTexte } from '../document';
import { metriqueCaractere, type MetriquesPolice } from './polices';

export interface GlyphePlace { codePoint: number; x: number; couvert: boolean }

export interface LigneTexte {
  texte: string;
  /** Origine de la ligne (avance), relative au bord gauche du calque, en pixels. */
  x: number;
  /** Ligne de base, relative au haut du calque, en pixels. */
  ligneDeBase: number;
  /** Somme des avances, en pixels. */
  largeur: number;
  /** Étendue horizontale de l'ENCRE (relative au calque), `null` pour une ligne vide. */
  encre: { gauche: number; droite: number } | null;
  glyphes: GlyphePlace[];
}

export interface MiseEnPage {
  lignes: LigneTexte[];
  taillePx: number;
  /** Pixels par unité de police. */
  echelle: number;
  boiteLigne: number;
  hauteurTexte: number;
  /** Le texte dépasse la hauteur du calque, ou une ligne sa largeur. */
  deborde: boolean;
  coupureForcee: boolean;
  /** Caractères sans glyphe dans la police · dessinés en boîte .notdef, jamais remplacés en silence. */
  nonCouverts: number[];
}

const EPS = 1e-6;

function avanceUnites(m: MetriquesPolice, cp: number): number {
  return (metriqueCaractere(m, cp) ?? m.notdef)[0];
}

function largeurUnites(m: MetriquesPolice, t: string): number {
  let s = 0;
  for (const ch of t) s += avanceUnites(m, ch.codePointAt(0)!);
  return s;
}

/** Coupe un paragraphe en lignes d'au plus `max` unités de police. */
function couper(m: MetriquesPolice, paragraphe: string, max: number): { lignes: string[]; force: boolean } {
  const mots = paragraphe.split(' ');
  const lignes: string[] = [];
  let force = false;
  let courante = '';
  const pousserMotLong = (mot: string) => {
    let morceau = '';
    for (const ch of mot) {
      if (morceau && largeurUnites(m, morceau + ch) > max + EPS) { lignes.push(morceau); morceau = ''; force = true; }
      morceau += ch;
    }
    return morceau;
  };
  for (const mot of mots) {
    const essai = courante === '' ? mot : `${courante} ${mot}`;
    if (largeurUnites(m, essai) <= max + EPS) { courante = essai; continue; }
    if (courante !== '') lignes.push(courante);
    courante = largeurUnites(m, mot) <= max + EPS ? mot : pousserMotLong(mot);
  }
  lignes.push(courante);
  return { lignes, force };
}

export function mettreEnPage(
  c: Pick<CalqueTexte, 'text' | 'fontSizePx' | 'lineHeight' | 'align' | 'width' | 'height'>,
  m: MetriquesPolice,
): MiseEnPage {
  const echelle = c.fontSizePx / m.unitesParEm;
  const maxUnites = c.width / echelle;
  const boiteLigne = c.fontSizePx * c.lineHeight;
  const demiInterligne = (boiteLigne - (m.ascendant + m.descendant) * echelle) / 2;
  const nonCouverts = new Set<number>();
  let coupureForcee = false;
  const brutes: string[] = [];
  for (const p of c.text.replace(/\r\n?/g, '\n').split('\n')) {
    const r = couper(m, p, maxUnites);
    coupureForcee ||= r.force;
    brutes.push(...r.lignes);
  }
  let deborde = false;
  const lignes = brutes.map((texte, i): LigneTexte => {
    const largeur = largeurUnites(m, texte) * echelle;
    if (largeur > c.width + EPS) deborde = true;
    const x = c.align === 'left' ? 0 : c.align === 'center' ? (c.width - largeur) / 2 : c.width - largeur;
    const glyphes: GlyphePlace[] = [];
    let stylo = 0;
    let gauche = Infinity;
    let droite = -Infinity;
    for (const ch of texte) {
      const cp = ch.codePointAt(0)!;
      const met = metriqueCaractere(m, cp);
      if (!met) nonCouverts.add(cp);
      const g = met ?? m.notdef;
      const gx = x + stylo * echelle;
      glyphes.push({ codePoint: cp, x: gx, couvert: !!met });
      if (g.length === 3) { gauche = Math.min(gauche, gx + g[1] * echelle); droite = Math.max(droite, gx + g[2] * echelle); }
      stylo += g[0];
    }
    return {
      texte, x, largeur, glyphes,
      ligneDeBase: i * boiteLigne + demiInterligne + m.ascendant * echelle,
      encre: Number.isFinite(gauche) ? { gauche, droite } : null,
    };
  });
  const hauteurTexte = lignes.length * boiteLigne;
  if (hauteurTexte > c.height + 0.5) deborde = true;
  return { lignes, taillePx: c.fontSizePx, echelle, boiteLigne, hauteurTexte, deborde, coupureForcee, nonCouverts: [...nonCouverts].sort((a, b) => a - b) };
}

/** Hauteur minimale (pixels entiers) pour que le texte tienne dans cette largeur. */
export function hauteurNecessaire(c: Pick<CalqueTexte, 'text' | 'fontSizePx' | 'lineHeight' | 'align' | 'width'>, m: MetriquesPolice): number {
  return Math.ceil(mettreEnPage({ ...c, height: Number.MAX_SAFE_INTEGER }, m).hauteurTexte - EPS);
}
