'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { cibleFocusApresGeste, type InstantFocus } from '@tiktrends/core';

/**
 * L8-B · UX-02 · rend le focus clavier là où le geste a mené (règle pure
 * `cibleFocusApresGeste`, noyau). Mesuré avant : après « Voir l'impact »,
 * « Enregistrer », « Nouvelle fiche » ou « Proposer », le focus tombait sur
 * le document (BODY) et l'aperçu ou le message s'affichait hors de la vue.
 *
 * `focus()` fait défiler jusqu'à la zone sans animation · rien à faire de plus
 * pour `prefers-reduced-motion`.
 */

export interface ZonesFocus {
  /** Le conteneur de l'écran · on y suit le dernier élément focalisé (le geste). */
  conteneur: RefObject<HTMLElement | null>;
  apercu?: RefObject<HTMLElement | null>;
  retour?: RefObject<HTMLElement | null>;
  formulaire?: RefObject<HTMLElement | null>;
  /** Quand le geste d'ouverture a disparu de l'écran, où revenir (ex. « Nouvelle fiche » remonté). */
  repli?: () => HTMLElement | null;
}

const ids = new WeakMap<object, number>();
let suivant = 0;
/** Clé d'un message de retour · un NOUVEL objet est un nouveau message, même au texte identique. */
export function cleRetour(r: object | null | undefined): string | null {
  if (!r) return null;
  let n = ids.get(r);
  if (n === undefined) { n = ++suivant; ids.set(r, n); }
  return `r${n}`;
}

const vivant = (e: HTMLElement | null | undefined): HTMLElement | null =>
  e && e.isConnected && !(e as HTMLButtonElement).disabled ? e : null;

function premierChamp(z: HTMLElement | null | undefined): HTMLElement | null {
  if (!z) return null;
  return z.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? z;
}

export function useFocusApresGeste(instant: InstantFocus, zones: ZonesFocus): void {
  const avant = useRef<InstantFocus>(instant);
  const dernier = useRef<HTMLElement | null>(null);
  const ouvreur = useRef<HTMLElement | null>(null);
  const z = useRef(zones);
  z.current = zones;

  // Écoute au niveau du document · le conteneur peut naître après le composant (panneau en portail).
  useEffect(() => {
    const suivre = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && z.current.conteneur.current?.contains(t)) dernier.current = t;
    };
    document.addEventListener('focusin', suivre);
    return () => document.removeEventListener('focusin', suivre);
  }, []);

  useEffect(() => {
    const cible = cibleFocusApresGeste(avant.current, instant);
    const ouvre = (instant.apercu && !avant.current.apercu) || (instant.formulaire && !avant.current.formulaire);
    avant.current = instant;
    const zz = z.current;
    if (ouvre) ouvreur.current = dernier.current;
    let el: HTMLElement | null = null;
    if (cible === 'apercu') el = zz.apercu?.current ?? null;
    else if (cible === 'retour') el = zz.retour?.current ?? null;
    else if (cible === 'formulaire') el = premierChamp(zz.formulaire?.current);
    else if (cible === 'declencheur') el = vivant(ouvreur.current) ?? vivant(zz.repli?.() ?? null);
    if (el) el.focus();
  }, [instant.apercu, instant.retour, instant.formulaire]); // eslint-disable-line react-hooks/exhaustive-deps
}
