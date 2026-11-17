/**
 * ADSMAP · quand la lecture paginée de l'API Graph de Meta est COMPLÈTE, et
 * quand elle ne l'est pas.
 *
 * ── Le défaut que ce module ferme ───────────────────────────────────────────
 *
 * `graphAll` (`packages/integrations/src/meta-daily.ts`) suivait la pagination
 * sur 25 pages au plus, puis rendait ce qu'il avait lu comme si c'était tout.
 * Il s'arrêtait aussi, sans rien dire, sur une page qui annonçait une suite
 * (`paging.next`) sans curseur pour la lire. La synchro écrivait alors un jeu
 * partiel, datait la mesure (`brands.adsmap_synced_at`) et journalisait une
 * remontée RÉUSSIE · les verdicts se calculaient sur des journées manquantes et
 * aucun écran ne le disait.
 *
 * 25 pages × 500 lignes = 12 500 lignes. Une ligne d'insights vaut une annonce
 * un jour (`level: ad`, `time_increment: 1`) · sur la fenêtre de 121 jours,
 * il suffisait de 104 annonces diffusées chaque jour pour la dépasser. Le
 * chiffre 25 n'était dérivé de rien.
 *
 * ── La règle ────────────────────────────────────────────────────────────────
 *
 *  - pas de `paging.next` · la lecture est finie ;
 *  - un `paging.next` sans curseur `after` · INCOMPLÈTE (`curseur_absent`) ·
 *    on ne sait pas lire la suite, on ne fait pas comme si elle n'existait pas ;
 *  - un `paging.next` alors que la borne de pages est atteinte · INCOMPLÈTE
 *    (`borne`) ;
 *  - sinon, page suivante.
 *
 * Une lecture incomplète FAIT ÉCHOUER la synchro de la marque, avant toute
 * écriture · les mesures précédentes restent en place, la raison est
 * journalisée et dite à l'écran (Connexions, Importer, bouton « Mesurer
 * maintenant »). Un jeu partiel n'est jamais écrit.
 *
 * ── D'où vient la borne ─────────────────────────────────────────────────────
 *
 * Elle n'est plus qu'un filet contre une pagination sans fin · la justesse ne
 * dépend pas d'elle, puisque la dépasser se DIT au lieu de tronquer. Elle est
 * dérivée du plus gros volume qu'une lecture légitime peut rendre :
 *
 *   lignes max = annonces max d'un compte × jours de la fenêtre
 *              = 5 000 × 121 = 605 000 lignes
 *   pages      = ⌈605 000 / 500⌉ = 1 210 pages
 *
 *  - 500 · la taille de page DEMANDÉE (`limit`), écrite une fois ici et lue
 *    par `graphAll` · la borne suit si elle change ;
 *  - 121 · `FENETRE_SYNCHRO_JOURS` (120) + 1, les deux bornes de `time_range`
 *    étant inclusives · la synchro lit cette constante, la borne la suit ;
 *  - 5 000 · le plafond d'annonces non supprimées d'un compte publicitaire
 *    ordinaire, tel qu'il est relayé (guides annonceurs). La documentation
 *    Meta n'est pas joignable depuis la session de développement
 *    (developers.facebook.com bloqué), le chiffre n'y a donc pas été relu ·
 *    une erreur sur lui ne tronque plus rien, elle fait échouer la synchro
 *    d'un compte hors norme avec sa raison écrite.
 *
 * Les ensembles (`/adsets`, une ligne par ensemble) passent sous la même borne ·
 * leur volume est inférieur d'un facteur 121 à celui des insights.
 *
 * Pur · ni base, ni réseau.
 */

/** La taille de page demandée à l'API Graph (`limit`). */
export const TAILLE_PAGE_META = 500;

/** Au-delà, on ne redemande pas l'historique : les lots anciens sont clos. Lu par la synchro (`adsmap-sync.ts`). */
export const FENETRE_SYNCHRO_JOURS = 120;

/** Annonces non supprimées d'un compte publicitaire ordinaire · chiffre relayé, voir l'en-tête. */
export const ANNONCES_MAX_COMPTE_META = 5_000;

/** La borne de pages d'une lecture Graph · ⌈5 000 × 121 / 500⌉ = 1 210. */
export const BORNE_PAGES_META = Math.ceil((ANNONCES_MAX_COMPTE_META * (FENETRE_SYNCHRO_JOURS + 1)) / TAILLE_PAGE_META);

export type RaisonLectureIncomplete = 'borne' | 'curseur_absent';

export type SuitePagination =
  | { suite: 'page'; after: string }
  | { suite: 'fin' }
  | { suite: 'incomplete'; raison: RaisonLectureIncomplete };

/** Après la page n° `pagesLues` (1 pour la première) · lire la suivante, s'arrêter, ou dire que la lecture est incomplète. */
export function suitePagination(p: { pagesLues: number; next?: string | null; after?: string | null; borne?: number }): SuitePagination {
  if (!p.next) return { suite: 'fin' };
  if (!p.after) return { suite: 'incomplete', raison: 'curseur_absent' };
  if (p.pagesLues >= (p.borne ?? BORNE_PAGES_META)) return { suite: 'incomplete', raison: 'borne' };
  return { suite: 'page', after: p.after };
}

const MARQUE = 'meta_lecture_incomplete';

/** Le message de l'erreur levée par `graphAll` · un code et des nombres, jamais le jeton ni le compte. */
export function erreurLectureIncomplete(raison: RaisonLectureIncomplete, pagesLues: number): string {
  return `${MARQUE} raison=${raison} pages=${pagesLues}`;
}

/** Relit une erreur de lecture incomplète sur son message · `null` pour toute autre erreur. */
export function lireLectureIncomplete(message: string | null | undefined): { raison: RaisonLectureIncomplete; pages: number } | null {
  const m = /meta_lecture_incomplete raison=(borne|curseur_absent) pages=(\d+)/.exec(message ?? '');
  return m ? { raison: m[1] as RaisonLectureIncomplete, pages: Number(m[2]) } : null;
}

/** La phrase de l'écran · ce qui s'est passé, et que rien n'a été écrit. */
export function phraseLectureIncomplete(l: { raison: RaisonLectureIncomplete; pages: number }): string {
  const cause = l.raison === 'borne'
    ? `Meta renvoie plus de ${l.pages} pages de mesures pour ce compte, la lecture a été arrêtée`
    : `Meta a annoncé une suite de mesures sans moyen de la lire (page ${l.pages})`;
  return `${cause} · rien n’a été écrit, les mesures précédentes restent en place`;
}
