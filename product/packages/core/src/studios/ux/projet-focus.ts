/**
 * L8-B · UX-02 · où va le focus clavier APRÈS un geste sur un écran de projet.
 * Pur · décidable sans navigateur.
 *
 * ── Ce que la recette a mesuré (local, Chromium, 390 × 720, au clavier) ─────
 *
 * | Geste (Entrée sur le bouton)                  | Focus après              | Ce qui a changé à l'écran        |
 * | --------------------------------------------- | ------------------------ | -------------------------------- |
 * | Vidéo · « Voir l'impact du scénario »          | BODY                     | aperçu affiché HORS de la vue    |
 * | Vidéo · « Enregistrer ce changement »          | BODY                     | message affiché hors de la vue   |
 * | Vidéo · « Reculer » un plan                    | BODY                     | aperçu affiché hors de la vue    |
 * | Identités · « Nouvelle fiche » / « Annuler »   | BODY                     | formulaire ouvert / refermé      |
 * | Identités · « Enregistrer la fiche »           | BODY                     | message hors de la vue           |
 * | Propositions · « Proposer cette modification » | BODY                     | message affiché                  |
 *
 * Le bouton du geste devient inactif pendant l'appel (ou disparaît) · le
 * navigateur rend alors le focus au document, et l'utilisateur au clavier
 * repart du HAUT de la page sans savoir ce qui s'est passé.
 *
 * La règle, par priorité : ce qui VIENT d'apparaître reçoit le focus (l'aperçu
 * d'impact à décider, sinon le message de retour, sinon le formulaire ouvert) ;
 * quand une zone se referme sans rien laisser, le focus revient au geste qui
 * l'avait ouverte. Rien d'autre ne bouge le focus · un rafraîchissement
 * périodique ne doit jamais l'arracher.
 */

export interface InstantFocus {
  /** Un aperçu à décider est affiché (impact avant enregistrement). */
  apercu: boolean;
  /** Clé du message de retour affiché · `null` sans message. Une NOUVELLE clé = un nouveau message. */
  retour: string | null;
  /** Un formulaire d'édition est ouvert. */
  formulaire: boolean;
}

export type CibleFocus = 'apercu' | 'retour' | 'formulaire' | 'declencheur' | 'rien';

export const INSTANT_FOCUS_VIDE: InstantFocus = { apercu: false, retour: null, formulaire: false };

export function cibleFocusApresGeste(avant: InstantFocus, apres: InstantFocus): CibleFocus {
  if (apres.apercu && !avant.apercu) return 'apercu';
  if (apres.retour !== null && apres.retour !== avant.retour) return 'retour';
  if (apres.formulaire && !avant.formulaire) return 'formulaire';
  if ((avant.apercu && !apres.apercu) || (avant.formulaire && !apres.formulaire)) return 'declencheur';
  return 'rien';
}
