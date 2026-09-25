/**
 * L'accueil, enfin branché sur l'expérience.
 *
 * ── Ce qui n'allait pas ──────────────────────────────────────────────────────
 *
 * Le questionnaire d'accueil demande pour qui l'on crée, à quel niveau, et par
 * quoi commencer · puis RANGE les réponses dans `workspaces.onboarding` et ne
 * s'en sert plus, sauf pour créer la première marque et nourrir le marketing.
 * L'utilisateur répond à des questions qui n'ont aucun effet visible · c'est la
 * définition d'un formulaire pour rien.
 *
 * Ici, on traduit ces réponses en deux réglages que Jarvis peut appliquer :
 * l'OBJECTIF (par quoi commencer) oriente ses trois suggestions et sa première
 * question ; le NIVEAU règle sa densité d'explication. Rien de plus · ce module
 * ne décide pas, il traduit. Pur : ni base, ni réseau, ni modèle.
 *
 * ── Ce qu'on NE fait pas ─────────────────────────────────────────────────────
 *
 * On ne bloque aucune fonction selon le niveau (la spec l'interdit) · le niveau
 * ne touche que le TON. Et une réponse absente ou inconnue rend `null` · le
 * défaut est le comportement générique d'avant, jamais une personnalisation
 * devinée.
 */

/** Par quoi l'utilisateur veut commencer · oriente les suggestions du chat. */
export type ObjectifAccueil = 'creer' | 'idees' | 'resultats' | 'concurrents';

/** Son aisance · règle la densité d'explication de Jarvis, jamais l'accès. */
export type NiveauAccueil = 'debut' | 'intermediaire' | 'avance';

export interface PersonnalisationAccueil {
  objectif: ObjectifAccueil | null;
  niveau: NiveauAccueil | null;
}

/**
 * Les buts du questionnaire (`OnboardingData.goals`) → un objectif de travail.
 * Plusieurs buts mènent au même objectif · « créer », « cloner », « scaler »,
 * « vidéo » et « multi-marques » sont tous des variantes de FABRIQUER, tandis
 * qu'« analyser » vise les RÉSULTATS. Un but non listé ne mappe rien.
 */
const OBJECTIF_PAR_BUT: Readonly<Record<string, ObjectifAccueil>> = {
  ads: 'creer',
  clone: 'creer',
  scale: 'creer',
  video: 'creer',
  multi: 'creer',
  analyze: 'resultats',
};

/** Le niveau d'aisance IA du questionnaire → un registre d'explication. */
const NIVEAU_PAR_IA: Readonly<Record<string, NiveauAccueil>> = {
  starter: 'debut',
  exploring: 'debut',
  comfortable: 'intermediaire',
  advanced: 'avance',
};

/**
 * Lit les réponses d'accueil (jsonb libre) et en tire l'objectif et le niveau.
 *
 * L'entrée est `unknown` à dessein · elle vient d'une colonne jsonb qui peut
 * être vide, partielle ou d'une version ancienne. On ne fait confiance à rien ·
 * tout ce qui n'est pas reconnu retombe sur `null`.
 *
 * L'objectif prend le PREMIER but sélectionné qui porte un sens · le
 * questionnaire les propose par priorité, le premier est donc le plus fort.
 */
export function personnalisationAccueil(onboarding: unknown): PersonnalisationAccueil {
  if (!onboarding || typeof onboarding !== 'object') return { objectif: null, niveau: null };
  const o = onboarding as { goals?: unknown; aiLevel?: unknown };

  let objectif: ObjectifAccueil | null = null;
  if (Array.isArray(o.goals)) {
    for (const but of o.goals) {
      if (typeof but === 'string' && but in OBJECTIF_PAR_BUT) {
        objectif = OBJECTIF_PAR_BUT[but]!;
        break;
      }
    }
  }

  const niveau = typeof o.aiLevel === 'string' && o.aiLevel in NIVEAU_PAR_IA
    ? NIVEAU_PAR_IA[o.aiLevel]!
    : null;

  return { objectif, niveau };
}
