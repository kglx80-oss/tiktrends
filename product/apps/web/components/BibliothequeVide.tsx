'use client';

import { useEffect, useRef } from 'react';
import { Empty } from './Empty';
import { prendreFocusApresVidage } from './focusVidage';
// L'anneau de focus épouse le cadre `vide` qu'il entoure (même rayon · lot 19D).
import { vide } from './ui';

/**
 * La bibliothèque ENTIÈREMENT vide · une seule activation, pas trois.
 *
 * Chaque onglet portait son propre « Ouvrir la veille » · à froid, la page en
 * répétait trois, et le geste unique (aller chercher des sources dans la Veille)
 * se lisait comme trois décisions. Quand rien n'est encore sauvegardé, suivi, ni
 * repéré, on montre UN seul point d'entrée · dès qu'un espace se remplit, les
 * onglets reprennent la main et la collection s'ouvre.
 *
 * On passe par le composant `Empty` (la forme commune des états vides) · aucun
 * scan n'y est déclenché · ouvrir la bibliothèque ne dépense rien (CDC v7 · N05).
 * L'activation NAVIGUE vers la Veille, elle ne lance pas d'analyse.
 *
 * Lot 16 · quand cet état remplace les onglets parce que l'utilisateur vient de
 * retirer son dernier concurrent, l'onglet qui avait le focus disparaît (focus
 * sur <body>, 24/24 mesuré). La région reprend alors le focus · uniquement dans
 * ce cas (`prendreFocusApresVidage`) · une simple visite ne déplace rien.
 */
export function BibliothequeVide() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (prendreFocusApresVidage()) ref.current?.focus(); }, []);
  return (
    <section ref={ref} tabIndex={-1} aria-label="Ta bibliothèque est encore vide" style={{ outlineOffset: 4, borderRadius: vide.borderRadius }}>
      <Empty
        tone="todo"
        icon="bookmark"
        title="Ta bibliothèque est encore vide"
        why="Depuis la Veille, ★ sauvegarde une créa et « + Suivre » un concurrent · tes créations, tes collections et les nouveautés de tes concurrents arrivent ici."
        action={{ label: 'Ouvrir la veille', href: '/veille' }}
      />
    </section>
  );
}
