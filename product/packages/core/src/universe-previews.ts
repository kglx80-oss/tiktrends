/**
 * Fabriquer les aperçus d'univers · et ne les fabriquer qu'une fois.
 *
 * ── Le trou que ça comble ────────────────────────────────────────────────────
 *
 * Les vignettes d'univers montrent une créa de la marque quand il y en a une.
 * Une marque neuve n'en a aucune · elle voit huit dégradés, et la promesse
 * « choisis à l'œil » ne tient qu'après plusieurs séries payées à l'aveugle.
 *
 * Huit images fabriquées une fois comblent le trou immédiatement. Elles coûtent,
 * donc elles se méritent.
 *
 * ── La règle de dépense est ici, pas dans l'écran ────────────────────────────
 *
 * Un bouton peut être cliqué deux fois. Une page peut être rechargée. Un écran
 * qui décide seul de ce qu'il regénère finit par regénérer ce qu'il a déjà.
 *
 * **Ce qui existe n'est jamais refait.** Le plan est calculé ici, il est pur, et
 * il est testé · c'est la seule barrière qui ne dépend pas de l'attention de
 * celui qui clique.
 *
 * Le coût est annoncé au centime près AVANT le clic. Un prix qu'on découvre
 * après n'est pas un prix, c'est une facture.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

/**
 * Statut qui range une génération parmi les aperçus.
 *
 * Elles vivent dans la même table que les images du Studio · sans marqueur,
 * elles apparaîtraient dans la galerie de la marque comme si quelqu'un les avait
 * demandées.
 */
export const UNIVERSE_PREVIEW_STATUS = 'universe_preview';

/** Plafond dur · huit univers, et le nombre ne se négocie pas depuis le navigateur. */
export const MAX_PREVIEWS = 8;

export interface PreviewPlan {
  /** Les univers à fabriquer · vide quand tout est déjà là. */
  missing: string[];
  /** Ce que ça coûtera, en crédits · annoncé avant le clic. */
  credits: number;
  /** Ce qu'on dit à l'écran · toujours renseigné. */
  summary: string;
  /** Pourquoi il n'y a rien à faire · `null` quand le plan est exécutable. */
  blocked: string | null;
}

export function planUniversePreviews(input: {
  /** Toutes les clés d'univers du catalogue. */
  all: string[];
  /** Celles qui ont déjà un aperçu fabriqué. */
  existing: string[];
  creditsPerImage: number;
  /** Refaire aussi celles qui existent · geste explicite, jamais par défaut. */
  force?: boolean;
  max?: number;
}): PreviewPlan {
  const max = Math.max(0, Math.min(input.max ?? MAX_PREVIEWS, MAX_PREVIEWS));
  const deja = new Set(input.existing);

  // Le `force` ne dispense pas du plafond · refaire « tout » sur un catalogue qui
  // grandirait ne doit pas devenir une dépense qui grandit avec lui.
  const candidats = input.force ? input.all : input.all.filter((k) => !deja.has(k));
  const missing = candidats.slice(0, max);
  const credits = missing.length * Math.max(0, input.creditsPerImage);

  if (!missing.length) {
    return {
      missing: [], credits: 0, blocked: 'Tous les univers ont déjà un aperçu.',
      summary: 'Tous les univers ont déjà un aperçu · rien à fabriquer, rien à payer.',
    };
  }

  const reste = input.all.length - deja.size;
  return {
    missing, credits, blocked: null,
    summary: input.force
      ? `Refaire ${missing.length} aperçu(s) · ${credits} crédit(s). Ceux qui existent seront remplacés.`
      : `Fabriquer ${missing.length} aperçu(s) manquant(s) sur ${input.all.length} · ${credits} crédit(s).`
        + (reste > missing.length ? ` ${reste - missing.length} attendra un second passage.` : ''),
  };
}
