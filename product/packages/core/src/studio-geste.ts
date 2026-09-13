/**
 * Le « prochain geste » du hub Studio · une règle, donc ici, pure et testable.
 *
 * ── Pourquoi ce bandeau existe ───────────────────────────────────────────────
 *
 * Le hub Studio montre déjà les quatre studios en cartes. Un bandeau « prochain
 * geste » qui re-pointe vers l'un d'eux ne fait que DÉDOUBLER le CTA de sa carte
 * · c'est le motif « bouton héros + carte vers la même destination », le même
 * qu'on a retiré du Dashboard, de l'accueil et des Connexions.
 *
 * Le bandeau ne dit donc QUE ce que les cartes ne peuvent pas dire · pas
 * « ouvre ce studio » (la carte le fait), mais « ce que tu as fabriqué ne vaut
 * rien tant qu'il n'est pas jugé · va trancher ». Son geste porte TOUJOURS sur
 * la mesure (Adsmap), jamais sur l'ouverture d'un studio.
 *
 * Conséquence tenue par le test : `href` ne commence jamais par `/studio`.
 */

export interface GesteEtat {
  /** Verdicts posés · `null` quand la lecture a échoué. */
  jugees: number | null;
  /** Créas produites en attente de verdict · `null` quand la lecture a échoué. */
  enAttente: number | null;
}

export interface GesteStudio {
  title: string;
  why: string;
  href: string;
  cta: string;
}

/**
 * Deux cas, dans cet ordre · et aucun ne renvoie vers un studio.
 *
 * 1. Des créas attendent un verdict et aucune n'est jugée · le geste est d'aller
 *    juger, pas d'en fabriquer une de plus (ce serait vendre du volume à qui
 *    manque de mesure).
 * 2. Des verdicts existent · le geste est d'itérer sur ce qui a gagné.
 *
 * Sinon `null` · rien à dire de plus que les cartes, on n'affiche pas de
 * bandeau qui dédoublerait la carte Pubs IA.
 */
export function prochainGesteStudio(e: GesteEtat): GesteStudio | null {
  if (e.jugees === 0 && (e.enAttente ?? 0) > 0) {
    return {
      title: 'Fais trancher ce que tu as déjà',
      why: `${e.enAttente} créa(s) attendent un verdict. Tant qu’aucune n’est jugée, Jarvis n’a rien appris de cette marque · et la suivante sera aussi aveugle que la première.`,
      href: '/adsmap/lots',
      cta: 'Ouvrir les lots',
    };
  }

  if (e.jugees !== null && e.jugees > 0) {
    return {
      title: 'Itère sur ce qui a gagné',
      why: `${e.jugees} verdict(s) posé(s). Jarvis peut maintenant proposer la variante suivante en ne changeant qu’une seule chose · c’est ce qui rend un résultat attribuable.`,
      href: '/adsmap/suites',
      cta: 'Ouvrir les suites',
    };
  }

  return null;
}
