import type { SectionSpatiale } from './types';

/**
 * Le rail Spatial · ce qu'il PROPOSE, dans l'ordre de la maquette
 * (`docs/spatial/reference/_coquille.html`). Pur · la décision ne vit pas dans
 * le JSX.
 *
 * Une entrée n'apparaît que si sa destination est OUVERTE à la personne
 * (`ouverts` · les chemins que les règles d'accès existantes lui donnent,
 * rôle et formule compris). Jamais de porte morte · MCP n'a pas de destination
 * réelle, elle reste « bientôt » et le dit (verrou, sans lien).
 *
 * `plusSeulement` · l'entrée quitte la barre du bas sur mobile et passe dans
 * « Plus de modules » (classe `more-only` de la maquette).
 */
export interface EntreeRail {
  cle: SectionSpatiale;
  href: string | null;
  icone: string;
  titre: string;
  sous: string;
  plusSeulement: boolean;
  /** Bientôt · sans destination, verrouillée, annonce sa disponibilité. */
  bientot?: string;
  /**
   * Pastille de la maquette · `badge` = point d'état (Résultats : un lot est à
   * conclure), `rbadge` = compteur (Marque : étapes à compléter). Posée par la
   * rubrique depuis ses VRAIES données · absente quand rien n'est à signaler.
   */
  pastille?: { classe: 'badge' | 'rbadge'; valeur: string; libelle: string };
}

export interface ContexteRailSpatial {
  /** Chemins ouverts par les règles d'accès (rail actuel + sections de compte). */
  ouverts: ReadonlySet<string>;
  marque: { id: string; nom: string } | null;
}

export function entreesRail(c: ContexteRailSpatial): EntreeRail[] {
  const o = (h: string) => c.ouverts.has(h);
  const e: Array<EntreeRail | false> = [
    { cle: 'accueil', href: '/dashboard', icone: 'home', titre: 'Accueil', sous: 'Ta journée en un coup d’œil', plusSeulement: false },
    o('/studio/projets') && { cle: 'studios', href: '/studio/projets', icone: 'brush', titre: 'Studios', sous: 'Créer et itérer tes pubs', plusSeulement: false },
    o('/veille') && { cle: 'veille', href: '/veille', icone: 'eye', titre: 'Veille', sous: 'Pubs et concurrents', plusSeulement: true },
    o('/adsmap') && { cle: 'resultats', href: '/adsmap', icone: 'chart', titre: 'Résultats', sous: 'Tests, lots, apprentissages', plusSeulement: false },
    o('/assets') && { cle: 'bibliotheque', href: '/assets', icone: 'folder', titre: 'Bibliothèque', sous: 'Assets et créations', plusSeulement: true },
    o('/jarvis') && { cle: 'jarvis', href: '/jarvis', icone: 'chat', titre: 'Jarvis', sous: 'Ton IA créative', plusSeulement: false },
    { cle: 'mcp', href: null, icone: 'plug', titre: 'MCP TikTrends', sous: 'Bientôt · tes outils IA branchés', plusSeulement: true, bientot: 'MCP TikTrends arrive bientôt' },
  ];
  return e.filter((x): x is EntreeRail => !!x);
}

/** Le second bloc du rail (après le séparateur) · marque active et réglages. */
export function entreesRailEspace(c: ContexteRailSpatial): EntreeRail[] {
  const e: Array<EntreeRail | false> = [
    !!c.marque && c.ouverts.has('/brands') && { cle: 'marque', href: `/brands/${c.marque.id}`, icone: 'tag', titre: 'Marque', sous: `Fiche marque ${c.marque.nom}`, plusSeulement: true },
    c.ouverts.has('/settings') && { cle: 'reglages', href: '/settings', icone: 'gear', titre: 'Réglages', sous: 'Équipe, connexions, crédits', plusSeulement: true },
  ];
  return e.filter((x): x is EntreeRail => !!x);
}

/** L'entrée active · la section de l'écran affiché. */
export function entreeActive(cle: SectionSpatiale, section: SectionSpatiale | null): boolean {
  return cle === section;
}
