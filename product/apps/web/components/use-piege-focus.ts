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

  // Qui avait le focus avant l'ouverture · lu au RENDU qui ouvre la fenêtre.
  // Un effet arrive trop tard : un champ `autoFocus` de la fenêtre a déjà pris
  // le focus pendant le commit, et c'est lui qu'on « rendait » à la fermeture
  // (un nœud retiré · le focus tombait sur <body>, mesuré sur l'invitation
  // d'Équipe, lot 8).
  const rendreARef = useRef<HTMLElement | null>(null);
  if (actif && rendreARef.current === null && typeof document !== 'undefined') {
    rendreARef.current = document.activeElement as HTMLElement | null;
  }

  useEffect(() => {
    if (!actif) return;
    const rendreA = rendreARef.current;

    const focusables = () => Array.from(
      ref.current?.querySelectorAll<HTMLElement>(
        // `summary` · un <details> en fin de fenêtre était le dernier arrêt du Tab
        // sans être compté · le Tab suivant sortait de la fenêtre (assistant
        // image, lot 9).
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])',
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
    // Porter le focus dans la fenêtre à l'ouverture · le champ `autoFocus` s'il
    // l'a déjà pris, sinon le premier focusable, sinon le panneau (`tabIndex=-1`).
    const t = setTimeout(() => {
      if (ref.current?.contains(document.activeElement)) return;
      (focusables()[0] ?? ref.current)?.focus();
    }, 20);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
      rendreARef.current = null;
      rendreA?.focus?.();
    };
    // Dépend de `actif` SEULEMENT · `onFermer` passe par la ref, `ref` est stable ·
    // l'abonnement ne se rejoue plus à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif]);
}
