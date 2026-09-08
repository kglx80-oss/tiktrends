/**
 * Durcir la consigne d'entière sur les défauts que CETTE marque a mesurément.
 *
 * ── Le précurseur, et ce qu'il devient ───────────────────────────────────────
 *
 * #260 a posé la mesure par marque : `bilanCopie` compte désormais les accents
 * perdus (le raté français le plus fréquent) et le texte illisible. La mesure
 * existait, elle ne PILOTAIT rien · durcir le prompt à l'aveugle, sur une
 * intuition, aurait été tirer sans viser. Ici, le signal mesuré décide.
 *
 * Ce module ne durcit QUE ce qu'on a constaté chez cette marque. Une marque qui
 * n'a jamais perdu d'accent ne reçoit aucun renfort sur les accents · charger le
 * prompt de consignes pour des défauts absents le diluerait, et le modèle
 * traiterait la vraie exigence comme une clause parmi d'autres.
 *
 * ── On ne durcit que quand la mesure est confiante ───────────────────────────
 *
 * Deux barrières, la même discipline que le reste de la carte :
 *
 * 1. **Un minimum d'effectif** · sous `MIN_RELECTURES`, l'intervalle couvre trop
 *    pour conclure quoi que ce soit. Le silence est la réponse.
 * 2. **La borne BASSE de Wilson au-dessus d'une tolérance** · on ne durcit que si
 *    on est confiant que la marque perd VRAIMENT ses accents plus d'une fois sur
 *    vingt, pas qu'un ou deux ratés isolés ont gonflé un taux ponctuel.
 *
 * Comparer à zéro ferait durcir sur le moindre accident · comparer à une
 * tolérance, avec la borne basse, ne durcit que sur un défaut installé.
 *
 * ── Un renfort ne peut que aider ─────────────────────────────────────────────
 *
 * Ajouter « vérifie chaque accent » ne peut pas dégrader une image · au pire
 * c'est neutre. La barrière de confiance ne protège donc pas contre un risque,
 * elle garde le prompt LÉGER · elle n'ajoute un renfort que là où il sert.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import { wilsonInterval } from './adsmap/stats';
import { MIN_RELECTURES } from './adsmap/bilan-copie';

/** Le niveau des intervalles · le même que partout ailleurs sur la carte. */
const NIVEAU = 0.8;

/**
 * En dessous de cette tolérance, le défaut n'est pas assez installé pour durcir.
 * Cinq pour cent · un défaut qu'un humain relisant le lot remarquerait. Provisoire,
 * à mesurer une fois que plusieurs marques auront franchi le minimum d'effectif ·
 * la structure (minimum + borne basse) tient, le chiffre s'affinera.
 */
export const TOLERANCE_DEFAUT = 0.05;

/** Ce que la marque a mesurément, réduit à ce qui décide s'il faut durcir. */
export interface SignalDefautsMarque {
  /** Publicités relues · le dénominateur des accents (chacune a du texte imposé). */
  relues: number;
  /** Combien ont perdu des accents. */
  accents: number;
  /** Relues où il y avait du texte à juger · le dénominateur de la lisibilité. */
  avecTexte: number;
  /** Combien ont rendu un texte illisible. */
  illisibles: number;
}

/** Un défaut est-il installé · effectif suffisant ET borne basse au-dessus de la tolérance. */
function installe(mauvais: number, n: number): boolean {
  if (n < MIN_RELECTURES) return false;
  return wilsonInterval(mauvais, n, NIVEAU).lo > TOLERANCE_DEFAUT;
}

/** Les renforts anglais à ajouter à `promptPubEntiere` · vide le plus souvent. */
export function durcirEntiere(s: SignalDefautsMarque): string[] {
  const clauses: string[] = [];
  if (installe(s.accents, s.relues)) {
    clauses.push('This brand has repeatedly lost French accents. Before finalizing, double-check EVERY accent and apostrophe: à â ä é è ê ë î ï ô ö û ù ü ÿ ç and the typographic apostrophe ’. A single missing or wrong accent makes the ad unusable.');
  }
  if (installe(s.illisibles, s.avecTexte)) {
    clauses.push('This brand has repeatedly produced ILLEGIBLE advertising text. Make every headline and line large, sharp, and high-contrast against whatever is behind it. Never place small type over a busy or low-contrast area.');
  }
  return clauses;
}
