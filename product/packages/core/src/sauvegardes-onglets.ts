/**
 * Sauvegardes · l'organisation de la page autour de son usage principal.
 *
 * ── Pourquoi au noyau ────────────────────────────────────────────────────────
 *
 * Les créas gardées arrivaient APRÈS plusieurs blocs de découverte et d'analyse ·
 * l'usage principal (retrouver ce qu'on a sauvegardé) était enterré, et plusieurs
 * actions roses se concurrençaient. Ce module NOMME les trois espaces de la page
 * — Créations, Marques suivies, Nouveautés — et dit lequel domine par défaut. Le
 * modèle d'onglets et la recherche sont des DÉCISIONS · elles vivent ici, pures
 * et testables, pas dans le JSX où on les découvre cassées en cliquant.
 */

export type OngletSauvegardes = 'creations' | 'marques' | 'nouveautes';

export interface DefOnglet {
  cle: OngletSauvegardes;
  label: string;
  /** Ce qu'on y retrouve, en une phrase · pour qu'on comprenne d'un coup d'œil. */
  description: string;
  icone: string;
}

/**
 * L'ordre EST une décision · « Créations » d'abord, parce que retrouver ses créas
 * gardées est l'usage principal · la découverte et l'analyse passent après.
 */
export const ONGLETS_SAUVEGARDES: readonly DefOnglet[] = [
  { cle: 'creations', label: 'Créations sauvegardées', description: 'Les créas que tu as gardées · retrouve-les, filtre-les, range-les en collections.', icone: 'bookmark' },
  { cle: 'marques', label: 'Concurrents suivis', description: 'Les concurrents que tu surveilles · une collection de sources choisies, pas une recherche.', icone: 'radar' },
  { cle: 'nouveautes', label: 'Nouveautés', description: 'Ton espace de suivi · les nouvelles pubs repérées chez tes concurrents suivis.', icone: 'spark' },
] as const;

/** L'onglet qui s'ouvre par défaut · l'usage principal, pas la découverte. */
export const ONGLET_DEFAUT: OngletSauvegardes = 'creations';

const CLES = new Set<string>(ONGLETS_SAUVEGARDES.map((o) => o.cle));

/** Valide un paramètre d'URL · retombe sur le défaut si absent ou inconnu · sert
 *  à rouvrir la page sur le même onglet (retour sans perdre sa position). */
export function ongletValide(param?: string | null): OngletSauvegardes {
  return typeof param === 'string' && CLES.has(param) ? (param as OngletSauvegardes) : ONGLET_DEFAUT;
}

export function defOnglet(cle: OngletSauvegardes): DefOnglet {
  return ONGLETS_SAUVEGARDES.find((o) => o.cle === cle)!;
}

/** Les champs sur lesquels une créa sauvegardée est cherchable. */
export interface CreaCherchable {
  advertiserName?: string | null;
  body?: string | null;
  callToAction?: string | null;
  landingDomain?: string | null;
  folder?: string | null;
}

/**
 * Une créa correspond-elle à la recherche · marque, texte, appel à l'action,
 * domaine ou board. Requête vide · tout correspond (on ne cache rien sans raison).
 * Insensible à la casse et aux accents pour ne pas rater « café » sur « cafe ».
 */
export function correspondSauvegarde(c: CreaCherchable, requete: string): boolean {
  const q = normaliser(requete);
  if (!q) return true;
  return [c.advertiserName, c.body, c.callToAction, c.landingDomain, c.folder]
    .some((v) => typeof v === 'string' && normaliser(v).includes(q));
}

function normaliser(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
