/**
 * Le clavier de la fiche projet · deux règles portées de l'Éditeur (#1027) et
 * de l'Export (#1024), locales à la fiche (Brief, Propositions, panneau Jarvis,
 * Créations, Canvas) en attendant une brique commune de la rubrique.
 *
 * Rien de métier ici · seulement OÙ va le focus et comment un bouton dit qu'il
 * travaille.
 */

/**
 * Le focus ne tombe jamais sur `<body>` quand son élément disparaît (UX-02) ·
 * au rendu suivant, le premier sélecteur présent et ouvert le prend.
 */
export function focaliserApres(...selecteurs: string[]) {
  setTimeout(() => {
    for (const s of selecteurs) {
      const el = document.querySelector<HTMLElement>(s);
      if (el && !(el as HTMLButtonElement).disabled) { el.focus(); return; }
    }
  }, 0);
}

/**
 * Un bouton qui lance une action serveur · pendant l'action, celui qu'on a
 * pressé reste FOCALISABLE (`aria-disabled`, `aria-busy`, le clic est ignoré
 * par l'appelant) · un bouton `disabled` sous le focus le rend au document et
 * le clavier repart du haut de la page. Les autres boutons du même geste sont
 * fermés (`disabled`) comme avant, tout comme un bouton fermé pour une autre
 * raison (`ferme`).
 */
export function pendantAction({ presse, occupe, ferme = false }: { presse: boolean; occupe: boolean; ferme?: boolean }) {
  return {
    disabled: !presse && (ferme || occupe),
    'aria-disabled': presse || undefined,
    'aria-busy': presse || undefined,
  } as const;
}

/** L'aspect d'un bouton `.btn` fermé mais FOCALISABLE (`aria-disabled`) · les valeurs de `.btn[disabled]` de la maquette. */
export const FERME = { opacity: 0.5, cursor: 'default' } as const;
