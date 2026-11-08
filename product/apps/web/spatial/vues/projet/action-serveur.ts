import type { CSSProperties } from 'react';
import { etatBoutonAction, focusAReplacer, premiereCibleFocus, type EntreeBoutonAction, type ModeReplacementFocus } from '@tiktrends/core';

/**
 * LA brique « bouton d'action serveur » de la rubrique projet · Export,
 * Éditeur, atelier vidéo et fiche (Brief, Propositions, Jarvis, Créations)
 * la partagent, aucune n'en garde de copie (garde de source
 * `studios-brique-action-serveur`). La règle vit dans le noyau
 * (`etatBoutonAction`, `focusAReplacer`) · ici, seulement sa traduction en
 * attributs et le geste du focus.
 */

/** L'aspect d'un bouton `.btn` fermé mais FOCALISABLE (`aria-disabled`) · les valeurs de `.btn[disabled]` de la maquette. */
export const FERME = { opacity: 0.5, cursor: 'default' } as const;

export interface OptionsBoutonAction extends EntreeBoutonAction {
  /**
   * Le geste · appelé seulement si le clic est permis (ni action en cours, ni
   * bouton fermé) · le second clic est ignoré ICI. Absent · le bouton garde son
   * propre `onClick` (un bouton qui se ferme seulement pendant l'action d'un autre).
   */
  surClic?: () => void;
  /**
   * `style` (défaut) · l'aspect `FERME` est posé en ligne sur un `.btn`
   * focalisable fermé · `feuille` · la feuille l'atténue déjà
   * (`.chip[aria-disabled=true]`), rien n'est posé.
   */
  aspect?: 'style' | 'feuille';
}

export interface AttributsBoutonAction {
  disabled: boolean;
  'aria-disabled'?: true;
  'aria-busy'?: true;
  style?: CSSProperties;
  onClick?: () => void;
}

/**
 * Les attributs d'un bouton qui lance (ou attend) une action serveur · à
 * étaler sur le `<button>` (`{...boutonAction({ … })}`). Seules les clés
 * utiles sont posées · un `style` ou un `onClick` écrit avant l'étalement
 * n'est jamais écrasé par un `undefined`.
 */
export function boutonAction({ surClic, aspect = 'style', ...entree }: OptionsBoutonAction): AttributsBoutonAction {
  const e = etatBoutonAction(entree);
  const attributs: AttributsBoutonAction = { disabled: e.disabled };
  if (e.ariaDisabled) attributs['aria-disabled'] = true;
  if (e.ariaBusy) attributs['aria-busy'] = true;
  if (e.aspectFerme && aspect === 'style') attributs.style = FERME;
  if (surClic) attributs.onClick = () => { if (e.clicPermis) surClic(); };
  return attributs;
}

/**
 * Le motif de la fiche (#1032) · `boutonAction` sans clic ni aspect, mode
 * `aucun`. Gardé pour les écrans hors rubrique qui l'importent encore.
 */
export function pendantAction({ presse, occupe, ferme = false }: { presse: boolean; occupe: boolean; ferme?: boolean }) {
  const e = etatBoutonAction({ presse, occupe, ferme });
  return {
    disabled: e.disabled,
    'aria-disabled': e.ariaDisabled || undefined,
    'aria-busy': e.ariaBusy || undefined,
  } as const;
}

/**
 * Le focus ne tombe jamais sur `<body>` quand son contrôle disparaît (UX-02) ·
 * au rendu suivant (`setTimeout` 0), le premier sélecteur présent et ouvert le
 * prend · `toujours` (Éditeur, fiche) ou `si-perdu` (atelier vidéo · l'aperçu
 * ou le message qui l'a repris le garde).
 */
export function replacerFocus(mode: ModeReplacementFocus, ...selecteurs: string[]) {
  setTimeout(() => {
    const a = document.activeElement;
    if (!focusAReplacer(mode, a ? { estCorps: a === document.body, connecte: a.isConnected } : null)) return;
    const elements = selecteurs.map((s) => document.querySelector<HTMLElement>(s));
    const i = premiereCibleFocus(elements.map((el) => ({ present: !!el, disabled: !!el && !!(el as HTMLButtonElement).disabled })));
    if (i >= 0) elements[i]!.focus();
  }, 0);
}

/** `replacerFocus('toujours', …)` · le nom des passes #1027 et #1032, gardé pour les écrans hors rubrique. */
export const focaliserApres = (...selecteurs: string[]) => replacerFocus('toujours', ...selecteurs);
