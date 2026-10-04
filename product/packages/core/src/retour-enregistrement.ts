/**
 * Ce que l'écran montre APRÈS un enregistrement · lot 16 (`router.refresh()`).
 *
 * ── Le défaut mesuré ─────────────────────────────────────────────────────────
 *
 * Plusieurs gestes enregistraient puis confiaient TOUT l'affichage à un
 * rafraîchissement souple du routeur client · le même qui cale dans le gabarit
 * `(app)` (lot 14, `bascule-marque.ts` · transition `pending` + `suspended`,
 * aucune relance). Mesuré en local, build propre `ad012d31`, 1280×720, 12
 * répétitions par geste, saisie vérifiée, rendu attendu sous 8 s :
 *
 * | Geste                                  | Base à jour | Écran faux                                  |
 * | -------------------------------------- | ----------- | ------------------------------------------- |
 * | Sauvegardes › « Ne plus suivre »       | 12/12       | 4/12 · puce et compteur restent             |
 * | … dernier concurrent retiré            | 6/6         | 1/6 · une puce reste, pas d'état vide       |
 * | Sauvegardes › « Tout marquer vu »      | 12/12       | 4/12 en retard de 3,8 s (badge et bouton)   |
 * | Réglages rapides › Enregistrer         | 12/12       | 6/12 · fenêtre figée « Enregistrement… »    |
 * | Mon profil › Enregistrer               | 12/12       | 3/12 · fenêtre figée                        |
 * | Réglages rapides, Mon profil · rouvrir | ·           | 12/12 et 12/12 · se referme aussitôt        |
 *
 * Les deux fenêtres lisaient leur résultat par `useActionState` · ce résultat
 * n'arrive qu'avec la transition qui cale, et il RESTE `ok` ensuite · l'effet
 * « ok → rafraîchir + fermer » se relançait à chaque rendu de la coquille
 * (`onClose` change d'identité) et refermait la fenêtre à la réouverture.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Ce que l'utilisateur vient d'enregistrer, l'écran le montre TOUT DE SUITE, à
 * partir du résultat de l'action (qui, lui, revient · ~50 ms au lot 14), sans
 * attendre le rendu serveur. Dès que le serveur renvoie autre chose que ce qu'il
 * montrait au moment de l'enregistrement, c'est lui qui fait foi.
 */

/** La valeur enregistrée localement, et ce que le serveur montrait à ce moment. */
export interface Enregistre<T> { valeur: T; serveurAvant: T }

/**
 * Valeur à afficher · l'enregistrement local tant que le serveur montre encore
 * l'ancienne valeur ; la valeur serveur dès qu'elle a changé (rendu frais).
 */
export function valeurAffichee<T>(serveur: T, local: Enregistre<T> | null | undefined): T {
  if (!local) return serveur;
  return Object.is(serveur, local.serveurAvant) ? local.valeur : serveur;
}

/**
 * Compteur d'un onglet après des retraits locaux · on ne retire que les
 * éléments que le serveur montre ENCORE (un rendu frais arrivé entre-temps les
 * a déjà décomptés · les soustraire deux fois ferait mentir le compteur).
 */
export function compteurApresRetraits(serveur: number, retiresEncoreServis: number): number {
  return Math.max(0, serveur - Math.max(0, retiresEncoreServis));
}

export const ECHEC_ENREGISTREMENT = 'L’enregistrement n’a pas abouti · rien n’a changé. Tu peux réessayer.';

/**
 * Message d'échec affiché · le texte du serveur quand il en donne un (il est
 * écrit pour l'écran), jamais « Erreur. » seul · mesuré au lot 16, la fenêtre
 * Réglages rapides traduisait par une table dont aucune clé ne correspondait
 * aux réponses du serveur et n'affichait que « Erreur. ».
 */
export function messageEchecEnregistrement(erreur: string | null | undefined): string {
  const e = (erreur ?? '').trim();
  return e || ECHEC_ENREGISTREMENT;
}

/**
 * Échec d'un retrait fait en avance (la puce disparaît au clic) · elle revient,
 * et on le DIT · sinon l'utilisateur la croit retirée et ne la voit pas revenir.
 */
export function echecRetraitSuivi(nom: string): string {
  return `Le retrait de « ${nom} » n’a pas abouti · ce concurrent est toujours suivi. Tu peux réessayer.`;
}
