/**
 * Ce qu'on paie quand l'image ne sort pas.
 *
 * ── Le défaut que ça répare ──────────────────────────────────────────────────
 *
 * La barrière de dépense enregistrait le coût AVANT l'appel :
 *
 *     await guardFixedCost('fal_image', …);   // 0,08 $ comptés
 *     const { images } = await falGenerateImage(…);  // ← peut échouer
 *
 * L'ordre est bon · compter après aurait laissé passer, le temps de l'appel,
 * autant de dépenses simultanées que d'images en vol. Un plafond qu'on peut
 * dépasser en lançant tout d'un coup ne protège de rien.
 *
 * Ce qui manquait, c'est le retour en arrière. Un modèle inconnu, une référence
 * illisible, une clé refusée · le fournisseur n'a rien produit, ne facture rien,
 * et notre compteur retenait quand même 0,08 $. Avec un réessai, 0,16 $. Un lot
 * de quatre qui échoue entièrement : 0,64 $ pour zéro publicité.
 *
 * Un plafond dur de 10 $ se vide donc en une poignée de lots ratés, et le
 * produit se verrouille tout seul **sans avoir produit une seule image**.
 *
 * ── L'asymétrie, et de quel côté on se trompe ────────────────────────────────
 *
 * Deux erreurs possibles, et elles ne se valent pas :
 *
 * - **compter en trop** bloque un produit qui n'a rien dépensé · c'est le
 *   défaut qu'on corrige ;
 * - **compter en moins** laisse filer une facture réelle au-delà du plafond ·
 *   c'est précisément ce que le plafond existe pour empêcher.
 *
 * On ne rend donc que ce dont on est SÛR : les refus qui arrivent avant tout
 * calcul. Dans le doute, la dépense reste comptée. « Le fournisseur n'a rien
 * produit » et « le fournisseur ne facture rien » sont deux affirmations
 * différentes, et seule la seconde autorise à rendre.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

/**
 * Les familles d'échec où la demande est refusée AVANT le moindre calcul.
 *
 * Chacune est là pour une raison qu'on peut dire à voix haute :
 *
 * - `requete` · la demande est malformée (400, 422). Elle est rejetée à la
 *   porte, aucun GPU ne démarre.
 * - `acces` · clé absente ou révoquée (401, 403). Refusée avant d'entrer.
 * - `image` · l'image de référence n'a pas pu être chargée. Le travail ne peut
 *   pas commencer sans elle.
 * - `adresse` · c'est NOTRE garde réseau qui a refusé · l'appel n'est jamais
 *   parti.
 * - `saturation` · 429. Le fournisseur dit « pas maintenant », il ne commence
 *   pas.
 * - `contenu` · la consigne est refusée par la modération, avant génération.
 */
export const FAMILLES_SANS_FACTURE = [
  'requete', 'acces', 'image', 'adresse', 'saturation', 'contenu',
] as const;

/**
 * Les familles où la dépense RESTE comptée, et pourquoi.
 *
 * - `delai` · notre échéance est tombée, pas celle du fournisseur. Il finit
 *   l'image et la facture. C'est déjà la raison pour laquelle on ne rejoue pas
 *   un délai dépassé.
 * - `service` · une 5xx peut tomber après que le calcul a commencé. Ambigu,
 *   donc compté.
 * - `quota` · le fournisseur parle de facturation · on ne va pas décider à sa
 *   place que rien n'est dû.
 * - `reseau` · une coupure peut survenir pendant la réponse, l'image étant déjà
 *   faite. Ambigu, donc compté.
 * - `autre` · non classé. Le doute se paie.
 */
export const FAMILLES_FACTUREES = [
  'delai', 'service', 'quota', 'reseau', 'autre',
] as const;

/**
 * Cet échec autorise-t-il à rendre la dépense enregistrée ?
 *
 * Une famille inconnue renvoie `false` · une famille qu'on n'a pas su nommer
 * n'est pas une famille dont on sait qu'elle ne facture rien.
 */
export function rienNaEteFacture(famille: string): boolean {
  return (FAMILLES_SANS_FACTURE as readonly string[]).includes(famille);
}

/**
 * Toutes les familles classées · sert à vérifier qu'aucune n'a été oubliée.
 *
 * Le jour où une nouvelle famille d'erreur apparaît, elle tombe dans « on
 * compte » par défaut · c'est le bon côté, mais silencieusement. Un test
 * compare cette liste à celle de l'application pour que l'oubli se voie.
 */
export const FAMILLES_CLASSEES: readonly string[] = [
  ...FAMILLES_SANS_FACTURE, ...FAMILLES_FACTUREES,
];
