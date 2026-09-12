/**
 * La décision « faut-il rappeler la source, ou peut-on servir/attendre » pour le
 * brief d'un concurrent · pure, pour être tenue une fois et testée.
 *
 * ── Pourquoi durcir ──────────────────────────────────────────────────────────
 *
 * Le brief lit la bibliothèque publicitaire via une clé Trendtrack UNIQUE,
 * partagée par tous les espaces. Le geste est authentifié et sans IA, mais rien
 * n'empêchait un compte de le marteler et d'épuiser le quota commun. Deux garde-
 * fous, tous deux fondés sur du temps mesurable :
 *
 *   1. un CACHE court · le brief est déterministe et non personnalisé (mêmes
 *      pubs → même forme), donc deux demandes rapprochées sur la même marque
 *      n'ont pas à repayer la source ;
 *   2. un THROTTLE par utilisateur · un plafond d'appels RÉELS à la source sur
 *      une fenêtre glissante, qui laisse passer un usage humain (parcourir ses
 *      marques suivies) mais coupe la boucle.
 *
 * Ici, seulement l'arithmétique · l'état (les Map) vit côté application, comme le
 * cache de recherche de veille. Pur : ni horloge implicite (le temps est passé),
 * ni base, ni réseau.
 */

/** Cache · assez pour absorber un aller-retour de session, pas la veille d'hier. */
export const BRIEF_TTL_MS = 5 * 60_000;
/** Throttle · fenêtre glissante et plafond d'appels RÉELS à la source par utilisateur. */
export const BRIEF_FENETRE_MS = 60_000;
export const BRIEF_MAX_PAR_FENETRE = 30;

/**
 * La clé de cache d'un brief · normalisée pour que « Feel » et « feel  » (casse,
 * espaces) partagent la même entrée · sinon le cache ne mordrait jamais sur les
 * répétitions qui ne diffèrent que par la frappe.
 */
export function cleBrief(platform: string, name: string): string {
  const p = (platform || '').trim().toLowerCase();
  const n = (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${p}|${n}`;
}

/** Une entrée de cache est-elle encore fraîche ? (posée à `at`, lue à `maintenant`). */
export function briefFrais(at: number, maintenant: number, ttlMs = BRIEF_TTL_MS): boolean {
  return maintenant - at < ttlMs;
}

/** Les horodatages d'appels encore DANS la fenêtre glissante (les plus vieux tombent). */
export function appelsDansFenetre(horodatages: readonly number[], maintenant: number, fenetreMs = BRIEF_FENETRE_MS): number[] {
  return horodatages.filter((t) => maintenant - t < fenetreMs);
}

/**
 * Un nouvel appel à la source est-il autorisé ? Vrai tant que le nombre d'appels
 * déjà passés DANS la fenêtre reste sous le plafond · l'égalité bloque (le
 * plafond est un maximum atteint, pas dépassé).
 */
export function briefSousLimite(horodatages: readonly number[], maintenant: number, fenetreMs = BRIEF_FENETRE_MS, max = BRIEF_MAX_PAR_FENETRE): boolean {
  return appelsDansFenetre(horodatages, maintenant, fenetreMs).length < max;
}
