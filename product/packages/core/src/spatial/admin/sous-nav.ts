/**
 * Ce que la sous-navigation du Tour de contrôle a le droit de proposer (SEC-10).
 *
 * Chaque entrée suit la porte RÉELLE de sa page, rien de plus : une entrée que
 * la page refuserait n'est pas proposée. Les pages gardent leurs propres
 * refus · cette règle ne protège rien, elle évite de montrer une porte fermée.
 *
 *  · `tour` · la porte commune (`porteAdmin`) · fondateur ET admin de l'espace ;
 *  · `promptRead` · `gardePlateforme('prompt.read')` · Bibliothèque IA,
 *    Registre IA, Modèles IA ;
 *  · `providerConfigure` · `gardePlateforme('provider.configure')` · Interrupteurs ;
 *  · `connaissances` · `peutGererConnaissances(rôle d'équipe)` ;
 *  · `equipe` · un rôle d'équipe à accès total (Rôles & droits).
 */
export interface DroitsSousNavAdmin {
  tour: boolean;
  promptRead: boolean;
  providerConfigure: boolean;
  connaissances: boolean;
  equipe: boolean;
}

const PORTE_ENTREE: Readonly<Record<string, keyof DroitsSousNavAdmin>> = {
  '/admin/prompts': 'promptRead',
  '/admin/prompts/registre': 'promptRead',
  '/admin/ia-studios': 'promptRead',
  '/admin/studios-interrupteurs': 'providerConfigure',
  '/admin/connaissances': 'connaissances',
  '/admin/equipe': 'equipe',
};

/** La porte dont dépend une entrée · `tour` par défaut (la porte commune). */
export function porteEntreeAdmin(href: string): keyof DroitsSousNavAdmin {
  return PORTE_ENTREE[href] ?? 'tour';
}

/** Les entrées que ces droits ouvrent, dans l'ordre reçu. */
export function entreesAdminOuvertes<T extends { href: string }>(items: readonly T[], droits: DroitsSousNavAdmin): T[] {
  return items.filter((i) => droits[porteEntreeAdmin(i.href)]);
}
