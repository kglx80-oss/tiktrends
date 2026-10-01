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
  const actifAvant = useRef(false);
  if (actif && !actifAvant.current && typeof document !== 'undefined') {
    // Fenêtres EMPILÉES (Pubs IA · détail puis aperçu) · la fenêtre du dessous
    // se désactive le temps de l'aperçu, puis se réactive · à ce moment le focus
    // est dans l'aperçu qui se ferme, un nœud promis à disparaître. On garde
    // alors le déclencheur d'origine au lieu de l'écraser (lot 9 · le second
    // Échap renvoyait le focus sur <body>).
    const c = document.activeElement as HTMLElement | null;
    const valable = !!c && c !== document.body && !c.closest?.('[role="dialog"],[aria-modal="true"]');
    if (valable || rendreARef.current === null) rendreARef.current = c;
  }
  actifAvant.current = actif;

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
    ).filter((el) => el.offsetParent !== null
      // Un champ dans un <details> fermé garde un offsetParent dans Chromium ·
      // compté visible, il devenait le « dernier » et le Tab sortait (lot 9).
      && (typeof el.checkVisibility !== 'function' || el.checkVisibility()));

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
    // Filet · si le focus atterrit HORS de la fenêtre malgré tout (un arrêt de
    // Tab que le décompte n'a pas prévu), on le ramène dedans.
    const onFocusIn = (e: FocusEvent) => {
      const cible = e.target as Node | null;
      if (!ref.current || !cible || ref.current.contains(cible)) return;
      // Une autre fenêtre (imbriquée, rendue en portail) garde son focus.
      if (cible instanceof Element && cible.closest('[role="dialog"],[aria-modal="true"]')) return;
      (focusables()[0] ?? ref.current).focus();
    };
    document.addEventListener('focusin', onFocusIn);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Porter le focus dans la fenêtre à l'ouverture · le champ `autoFocus` s'il
    // l'a déjà pris, sinon le premier focusable, sinon le panneau (`tabIndex=-1`).
    // Tenace · un panneau rendu par `Portail` est monté EN PLACE puis déplacé sur
    // <body> (nœud recréé) · ouvert par lien profond, le focus posé tombait avec
    // l'ancien nœud et restait sur la page (tiroir Adsmap, lot 9). On réessaie
    // tant que le panneau n'a pas le focus, une seconde au plus.
    let t: ReturnType<typeof setTimeout>;
    let essais = 0;
    let pose = false;
    // On SURVEILLE toute la seconde, même après un premier succès · le déplacement
    // par le portail survient après, et le focus retombe alors sur <body>.
    const porter = () => {
      const panneau = ref.current;
      const actifEl = document.activeElement;
      const perdu = !actifEl || actifEl === document.body;
      if (panneau && !panneau.contains(actifEl) && (!pose || perdu)) (focusables()[0] ?? panneau).focus();
      if (panneau?.contains(document.activeElement)) pose = true;
      if (essais++ < 16) t = setTimeout(porter, 60);
    };
    t = setTimeout(porter, 20);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      document.body.style.overflow = prev;
      clearTimeout(t);
      if (rendreA?.isConnected) rendreA.focus();
    };
    // Dépend de `actif` SEULEMENT · `onFermer` passe par la ref, `ref` est stable ·
    // l'abonnement ne se rejoue plus à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif]);
}
