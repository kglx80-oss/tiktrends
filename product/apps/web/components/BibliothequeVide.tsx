import { Empty } from './Empty';

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
 */
export function BibliothequeVide() {
  return (
    <Empty
      tone="todo"
      icon="bookmark"
      title="Ta bibliothèque est encore vide"
      why="Depuis la Veille, ★ sauvegarde une créa et « + Suivre » un concurrent · tes créations, tes collections et les nouveautés de tes concurrents arrivent ici."
      action={{ label: 'Ouvrir la veille', href: '/veille' }}
    />
  );
}
