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

/* -------------------------------------------------------------------------- */
/*  Le concept complet, pas seulement sa description                          */
/* -------------------------------------------------------------------------- */

/** Un gabarit envisagé, avec ce que la mémoire en dit. */
export interface PreflightOption { label: string; brief: PrelaunchBrief }

const POIDS: Record<PreflightTone, number> = { stop: 2, warn: 1 };

/**
 * Ce que la mémoire dit du concept tel qu'il est composé.
 *
 * ── Ce qui manquait ──────────────────────────────────────────────────────────
 *
 * La barre ne transmettait que la description. `prelaunchScore` sait pourtant
 * situer un mécanisme, un format, un stade de conscience · on lui donnait une
 * phrase et on ignorait tout le reste du composeur, qui est renseigné à l'écran
 * juste au-dessus.
 *
 * Résultat : la seule réserve possible portait sur l'accroche. « Ce gabarit-là
 * n'a jamais rien donné ici » ne pouvait pas être dit, alors que c'est
 * exactement le genre de fait qui fait changer d'avis avant de payer.
 *
 * ── Nommer le gabarit, mais seulement quand ça sert ──────────────────────────
 *
 * Une réserve qui vaut pour TOUS les gabarits envisagés n'est pas réparable en
 * changeant de gabarit · la nommer enverrait sur une fausse piste, on la dit
 * telle quelle. Une réserve qui n'en touche qu'un est actionnable : on dit
 * lequel, et on dit que les autres passent.
 *
 * C'est la différence entre une information et une consigne.
 *
 * ── L'accroche l'emporte, et elle ne dépend d'aucun gabarit ──────────────────
 *
 * « Cette formulation a déjà perdu ici » est un souvenir, pas un profil. Elle
 * passe avant tout le reste et n'est jamais rattachée à un gabarit.
 */
export function preflightAcross(options: PreflightOption[]): Preflight | null {
  if (!options.length) return null;

  const refutee = options
    .flatMap((o) => o.brief.flags)
    .find((f) => f.kind === 'hook_refuted');
  if (refutee) return { tone: 'stop', text: refutee.message };

  const lignes = options.map((o) => ({ label: o.label, line: preflightLine(o.brief) }));
  const parlantes = lignes.filter((l): l is { label: string; line: Preflight } => l.line !== null);
  if (!parlantes.length) return null;

  // La plus lourde · empiler trois réserves dans une barre, c'est demander une
  // revue de code à quelqu'un qui écrit.
  const pire = parlantes.reduce((a, b) => (POIDS[b.line.tone] > POIDS[a.line.tone] ? b : a));

  // Toutes touchées, ou un seul gabarit en lice · le gabarit n'explique rien.
  if (parlantes.length === options.length || options.length === 1) return pire.line;

  // Le compte porte sur les gabarits MUETS, pas sur « les autres » · avec trois
  // gabarits dont deux parlent, « les autres ne déclenchent rien » serait faux.
  const propres = options.length - parlantes.length;
  const fait = /[.!?]$/.test(pire.line.text.trim()) ? pire.line.text.trim() : `${pire.line.text.trim()}.`;
  return {
    tone: pire.line.tone,
    text: `Avec « ${pire.label} » · ${fait} ${propres} gabarit(s) sur ${options.length} ne déclenchent rien.`,
  };
}
