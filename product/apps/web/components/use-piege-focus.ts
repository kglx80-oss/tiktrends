'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Le piège à focus d'une fenêtre modale · une seule fois, partagé.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Une modale au clavier doit : porter le focus DANS la fenêtre à l'ouverture,
 * garder le Tab piégé derrière elle, fermer sur Échap, verrouiller le défilement
 * du fond, et RENDRE le focus au déclencheur à la fermeture (sinon le clavier
 * repart en haut de page). Le `Modal` partagé le faisait ; l'assistant Pubs IA,
 * lui, ne gérait qu'Échap · le focus restait sur le bouton d'ouverture et le Tab
 * s'échappait derrière la fenêtre. On extrait le comportement pour que les deux
 * dialogues partagent le MÊME, éprouvé une fois.
 *
 * DOM par nature (focus, écouteurs) · non pur · vérifié par un test d'interaction
 * (`apps/web/test/piege-focus.test.tsx`, environnement jsdom).
 *
 * @param ref     le panneau de la fenêtre · doit porter `tabIndex={-1}`.
 * @param actif   la fenêtre est-elle ouverte.
 * @param onFermer fermeture demandée (Échap).
 */
export function usePiegeFocus(
  ref: RefObject<HTMLElement | null>,
  { actif, onFermer }: { actif: boolean; onFermer: () => void },
): void {
  // `onFermer` est presque toujours une lambda INLINE (identité neuve à chaque
  // rendu). S'il entrait dans les dépendances de l'effet, celui-ci se
  // désabonnerait et se réabonnerait à CHAQUE rendu du parent · dans un écran
  // lourd comme le studio (le détail porte des outils qui posent de l'état), cela
  // fait des centaines de cycles addEventListener/removeEventListener et de
  // re-focus tant que la fenêtre est ouverte · une fragilité qui pouvait faire
  // manquer Échap (CDC v8 · F04). On garde `onFermer` dans une ref TOUJOURS à
  // jour · l'effet ne dépend plus que de `actif`, s'abonne UNE fois à l'ouverture
  // et se ferme UNE fois à la fermeture, sans jamais rater une frappe.
  const onFermerRef = useRef(onFermer);
  onFermerRef.current = onFermer;

  useEffect(() => {
    if (!actif) return;
    // Qui avait le focus avant l'ouverture · on le lui rend à la fermeture.
    const rendreA = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(
      ref.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((el) => el.offsetParent !== null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onFermerRef.current(); return; }
      // Piège à focus · le Tab ne doit pas s'échapper derrière la fenêtre.
      if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) { e.preventDefault(); ref.current?.focus(); return; }
        const premier = els[0]!, dernier = els[els.length - 1]!;
        const actifEl = document.activeElement;
        if (e.shiftKey && (actifEl === premier || !ref.current?.contains(actifEl))) {
          e.preventDefault(); dernier.focus();
        } else if (!e.shiftKey && actifEl === dernier) {
          e.preventDefault(); premier.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Porter le focus dans la fenêtre à l'ouverture · premier champ utile, sinon
    // le panneau lui-même (il est `tabIndex=-1`).
    const t = setTimeout(() => { (focusables()[0] ?? ref.current)?.focus(); }, 20);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
      rendreA?.focus?.();
    };
    // Dépend de `actif` SEULEMENT · `onFermer` passe par la ref, `ref` est stable ·
    // l'abonnement ne se rejoue plus à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif]);
}
