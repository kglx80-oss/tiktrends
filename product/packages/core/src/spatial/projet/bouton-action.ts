/**
 * Spatial · Projet · le bouton qui lance une ACTION SERVEUR · la règle unique
 * des passes design de l'Export (#1024), de l'Éditeur (#1027), de l'atelier
 * vidéo (#1031) et de la fiche projet (#1032), qui la recopiaient chacune.
 * Pur · ni navigateur, ni React. La brique de la rubrique
 * (`apps/web/spatial/vues/projet/action-serveur.ts`) la traduit en attributs.
 *
 * Trois raisons de ne pas agir, à ne pas confondre :
 *  · `presse` · CE bouton a lancé l'action en cours · il reste FOCALISABLE
 *    (`aria-disabled`, `aria-busy`), jamais `disabled` · un bouton `disabled`
 *    sous le focus le rend au document et le clavier repart du haut de la
 *    page. Son second clic est ignoré ;
 *  · `occupe` · une action du même geste est en cours (lancée par lui ou par
 *    un autre bouton) ;
 *  · `ferme` · le bouton est fermé pour une autre raison (rien à enregistrer,
 *    hors ligne, rôle, contrôle avant export, appel payant en cours…).
 *
 * `focalisable` dit, écran par écran, comment `occupe` et `ferme` ferment le
 * bouton · ce choix était déjà celui de chaque écran, la règle ne le change pas :
 *  · `aucun` (défaut · Export, restauration de l'Éditeur, fiche) · fermé =
 *    `disabled`, sauf le bouton pressé ;
 *  · `occupe` (atelier vidéo · assembler, enregistrer un changement, storyboard)
 *    · pendant une action, les AUTRES boutons restent focalisables et
 *    atténués ; une fermeture pour une autre raison reste `disabled` ;
 *  · `tout` (« Enregistrer » de l'Éditeur, geste du plan vidéo, puces et
 *    « Envoyer » de Jarvis) · jamais `disabled` · le bouton se ferme sous le
 *    doigt après un clic et doit GARDER le focus.
 */

export type FocalisableBoutonAction = 'aucun' | 'occupe' | 'tout';

export interface EntreeBoutonAction {
  /** Ce bouton a lancé l'action en cours. */
  presse?: boolean;
  /** Une action du même geste est en cours (lancée par ce bouton ou un autre). */
  occupe?: boolean;
  /** Fermé pour une raison qui n'est pas l'action en cours. */
  ferme?: boolean;
  focalisable?: FocalisableBoutonAction;
}

export interface EtatBoutonAction {
  /** `disabled` · le bouton sort de l'ordre de tabulation. Jamais vrai pour le bouton pressé. */
  disabled: boolean;
  /** `aria-disabled` · fermé mais focalisable (ou pressé). */
  ariaDisabled: boolean;
  /** `aria-busy` · seul le bouton pressé le porte. */
  ariaBusy: boolean;
  /**
   * L'aspect fermé (`FERME`) · un bouton `aria-disabled` qui n'est pas pressé
   * n'est pas atténué par la feuille (`.btn[disabled]` ne le voit pas) · le
   * pressé, lui, garde son aspect, son libellé dit qu'il travaille.
   */
  aspectFerme: boolean;
  /** Un clic part-il ? Faux pendant une action (second clic ignoré) et pour un bouton fermé. */
  clicPermis: boolean;
}

export function etatBoutonAction({ presse = false, occupe = false, ferme = false, focalisable = 'aucun' }: EntreeBoutonAction): EtatBoutonAction {
  const enAction = presse || occupe;
  const occupeFocalisable = focalisable !== 'aucun';
  const fermeFocalisable = focalisable === 'tout';
  const disabled = !presse && ((ferme && !fermeFocalisable) || (enAction && !occupeFocalisable));
  const ariaDisabled = presse || (enAction && occupeFocalisable) || (ferme && fermeFocalisable);
  return {
    disabled,
    ariaDisabled,
    ariaBusy: presse,
    aspectFerme: ariaDisabled && !presse,
    clicPermis: !enAction && !ferme,
  };
}

/**
 * Où va le focus quand son contrôle disparaît (UX-02) · deux usages voulus :
 *  · `toujours` (Éditeur, fiche) · le premier sélecteur présent et ouvert le
 *    prend, même si quelque chose l'a déjà repris ;
 *  · `si-perdu` (atelier vidéo) · seulement si le focus est PERDU (sur
 *    `<body>`, ou sur un élément retiré du document) · l'aperçu ou le message
 *    qui l'a repris (`useFocusApresGeste`) le garde.
 */
export type ModeReplacementFocus = 'toujours' | 'si-perdu';

export function focusAReplacer(mode: ModeReplacementFocus, actif: { estCorps: boolean; connecte: boolean } | null): boolean {
  if (mode === 'toujours') return true;
  return !actif || actif.estCorps || !actif.connecte;
}

/** Le premier candidat présent et OUVERT (`disabled` ne prend pas le focus) · son rang, ou -1. */
export function premiereCibleFocus(candidats: ReadonlyArray<{ present: boolean; disabled: boolean }>): number {
  return candidats.findIndex((c) => c.present && !c.disabled);
}
