import 'server-only';
import { aPermissionEspace, disponibiliteTextes, type DisponibiliteTextes } from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { adaptateurAnthropicGarde, modeleTexte } from '../prompts/adaptateur';
import { environnementPrompts } from '../prompts/environnement';
import { lirePointeur } from '../prompts/depot-prompts';
import { spendStatus } from '../../spend-guard';
import type { DependancesTextes } from './ecrire';

/**
 * Câblage de PRODUCTION des Textes IA et de la compilation image · l'unique
 * endroit qui choisit l'adaptateur réel (barrière `guardedAnthropic`) et
 * l'environnement du registre. Les tests passent leurs propres dépendances
 * (fournisseur simulé, environnement « test ») ; le résolveur refuse de toute
 * façon un fournisseur simulé hors test.
 */
export function dependancesTextesProduction(): DependancesTextes {
  return {
    adaptateur: adaptateurAnthropicGarde(),
    environnement: environnementPrompts(process.env),
    plafondAtteint: async () => (await spendStatus()).blocked,
  };
}

/** « Écrire avec l'IA » est-il possible maintenant ? LECTURE seule · coût maximal toujours rendu. */
export async function disponibiliteTextesServeur(ctx: ContexteStudio, briefPresent: boolean): Promise<DisponibiliteTextes> {
  const [pointeur, plafond] = await Promise.all([lirePointeur().catch(() => null), spendStatus()]);
  return disponibiliteTextes({
    briefPresent,
    peutProposer: aPermissionEspace(ctx.permissions, 'studio.propose'),
    releasePubliee: pointeur !== null,
    fournisseurConfigure: !!process.env.ANTHROPIC_API_KEY,
    plafondAtteint: plafond.blocked,
    modele: modeleTexte(),
  });
}
