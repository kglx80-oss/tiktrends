import 'server-only';
import { disponibiliteJarvis, aPermissionEspace, type DisponibiliteJarvis } from '@tiktrends/core';
import { gardeStudio, type ContexteStudio } from '../garde';
import { adaptateurAnthropicGarde, modeleTexte } from '../prompts/adaptateur';
import { environnementPrompts } from '../prompts/environnement';
import { lirePointeur } from '../prompts/depot-prompts';
import { spendStatus } from '../../spend-guard';
import type { DependancesJarvis } from './proposer';

/**
 * Câblage de PRODUCTION des propositions Jarvis · l'unique endroit qui choisit
 * l'adaptateur réel (barrière `guardedAnthropic`), l'environnement du
 * registre et la relecture de la garde. Les tests passent leurs propres
 * dépendances (adaptateur simulé, environnement « test ») au module
 * `proposer.ts` ; l'adaptateur simulé est de toute façon refusé hors test par
 * le résolveur.
 */
export function dependancesProduction(): DependancesJarvis {
  return {
    adaptateur: adaptateurAnthropicGarde(),
    environnement: environnementPrompts(process.env),
    plafondAtteint: async () => (await spendStatus()).blocked,
    relireContexte: () => gardeStudio('studio.propose'),
  };
}

/**
 * « Demander à Jarvis » est-il possible maintenant ? LECTURE seule : pointeur
 * de release, configuration du fournisseur, plafond de dépense, droit de
 * proposer. Le coût maximal est toujours rendu (jamais « gratuit »).
 */
export async function disponibiliteJarvisServeur(ctx: ContexteStudio): Promise<DisponibiliteJarvis> {
  const [pointeur, plafond] = await Promise.all([lirePointeur().catch(() => null), spendStatus()]);
  return disponibiliteJarvis({
    releasePubliee: pointeur !== null,
    fournisseurConfigure: !!process.env.ANTHROPIC_API_KEY,
    plafondAtteint: plafond.blocked,
    peutProposer: aPermissionEspace(ctx.permissions, 'studio.propose'),
    modele: modeleTexte(),
  });
}
