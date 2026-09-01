import type { PrelaunchBrief } from './prelaunch';

/**
 * Ce que la mémoire dit AVANT de payer la génération.
 *
 * ── Où le brief arrivait trop tard ───────────────────────────────────────────
 *
 * Jarvis relit ses propres brouillons, et une créa rencontre son brief de
 * pré-lancement une fois posée dans un lot · c'est-à-dire **après** avoir été
 * fabriquée. Dire « cette accroche a déjà perdu » à ce moment-là économise le
 * test, pas la génération.
 *
 * Dans la barre de composition, la même phrase économise les deux.
 *
 * ── Interrompre quelqu'un qui écrit se mérite ────────────────────────────────
 *
 * Une ligne qui apparaît à chaque frappe devient un bruit qu'on cesse de lire,
 * et la fois où elle compte vraiment, elle est déjà invisible. On ne dit donc
 * quelque chose que dans deux cas :
 *
 * - **une accroche déjà réfutée** · un fait, pas une préférence ;
 * - **une réserve explicite** de la mémoire sur ce qu'on s'apprête à faire.
 *
 * Un profil simplement moyen ne dit rien. Un concept neuf non plus · il a par
 * construction un profil qu'on ne connaît pas, et c'est souvent lui qui ouvre
 * quelque chose.
 *
 * ── Elle éclaire, elle n'interdit jamais ─────────────────────────────────────
 *
 * Le bouton reste actif dans tous les cas. Le jour où l'outil empêche de lancer
 * une créa parce qu'un chiffre lui déplaît, il a cessé d'être un outil.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export type PreflightTone = 'stop' | 'warn';

export interface Preflight {
  tone: PreflightTone;
  /** Une phrase, jamais deux · on est dans une barre, pas dans un rapport. */
  text: string;
}

/**
 * En dessous, on ne dit rien du tout.
 *
 * Une description de trois mots ne se compare à rien · et lancer une lecture de
 * mémoire à chaque caractère tapé ferait payer le confort de l'un par la
 * lenteur de tous.
 */
export const MIN_TEXT = 25;

/**
 * Traduit un brief de pré-lancement en une ligne de barre · `null` = silence.
 *
 * Le brief porte plusieurs signaux ; ici on n'en garde qu'un, le plus lourd.
 * Empiler trois réserves dans une barre de composition, c'est demander à
 * quelqu'un qui écrit de faire une revue de code.
 */
export function preflightLine(brief: PrelaunchBrief): Preflight | null {
  const refutee = brief.flags.find((f) => f.kind === 'hook_refuted');
  if (refutee) return { tone: 'stop', text: refutee.message };

  // Une réserve explicite de la mémoire · pas un simple profil moyen.
  const alerte = brief.flags.find((f) => f.tone === 'stop') ?? brief.flags.find((f) => f.tone === 'warn');
  if (alerte) return { tone: alerte.tone === 'stop' ? 'stop' : 'warn', text: alerte.message };

  return null;
}

/** Faut-il seulement interroger la mémoire ? */
export function worthChecking(text: string, measuredAds: number, minAds = 3): boolean {
  if (text.trim().length < MIN_TEXT) return false;
  // Sans tests mesurés, la mémoire n'a rien à confronter · l'appeler produirait
  // un silence coûteux à chaque frappe.
  return measuredAds >= minAds;
}
