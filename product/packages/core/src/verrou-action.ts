/**
 * Un verrou d'action · empêche qu'un même geste parte deux fois.
 *
 * ── Pourquoi un objet, et pas juste un booléen dans le composant ──────────────
 *
 * Le motif « je pose un drapeau, je lance l'action, je relâche à la fin » se
 * réécrivait à la main partout, et son point faible ne se voyait pas : l'état
 * `isPending` d'un `useTransition` ne bascule qu'AU RENDU SUIVANT · deux clics du
 * MÊME tick le lisent tous les deux à `false` et passent. Seul un drapeau posé de
 * façon SYNCHRONE, dans le tick du clic, les arrête.
 *
 * On en fait une primitive pure (ni base, ni réseau, ni React) · donc éprouvable
 * par résultat, ce qu'un `useRef` inline dans un composant n'est pas dans ce
 * dépôt (pas de DOM en test). Le composant se contente de la tenir dans un ref.
 *
 * Contrat : `tenter()` rend `true` UNE fois puis `false` tant qu'on n'a pas
 * `relacher()`. `relacher()` est idempotent. À appeler dans un `finally` pour
 * couvrir succès ET échec.
 */
export interface VerrouAction {
  /** Prend le verrou · `true` s'il était libre (on peut agir), `false` sinon. */
  tenter(): boolean;
  /** Rend le verrou · le prochain `tenter()` réussira. Idempotent. */
  relacher(): void;
  /** Lecture seule · le verrou est-il pris ? */
  readonly occupe: boolean;
}

export function verrouAction(): VerrouAction {
  let occupe = false;
  return {
    tenter() {
      if (occupe) return false;
      occupe = true;
      return true;
    },
    relacher() {
      occupe = false;
    },
    get occupe() {
      return occupe;
    },
  };
}
