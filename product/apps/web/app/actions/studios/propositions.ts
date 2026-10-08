'use server';

import { gardeStudio } from '../../../lib/studios/garde';
import {
  listerPropositions as listerDepot, inspecterProposition as inspecterDepot, appliquerProposition as appliquerDepot,
  rejeterProposition as rejeterDepot,
} from '../../../lib/studios/propositions/depot-propositions';
import { proposerAvecJarvis, creerPropositionManuelle as creerManuelle } from '../../../lib/studios/propositions/proposer';
import { dependancesProduction, disponibiliteJarvisServeur } from '../../../lib/studios/propositions/dependances';
import type {
  ListePropositions, PropositionPresentee, ReponseProposition, ResultatApplication, ResultatProposer,
} from '../../../lib/studios/propositions/types';

/**
 * Propositions structurées des studios (plan 06 §3 · proposeBrief,
 * proposePatch, applyProposal ; cahier §4.3, §4.6).
 *
 * Chaque commande : `gardeStudio(permission)` (session relue, droits et
 * restrictions de marque réévalués À CHAQUE appel, rien pris du client), puis
 * le dépôt, qui filtre la portée dans chaque requête.
 *
 *  · `proposerPatch` / `proposerBrief` · `studio.propose` · appel texte au
 *    registre (payant, sous la barrière de dépense, tracé) ; stocke une
 *    proposition et son plan d'impact ; aucun média, aucun devis, aucun job ;
 *  · `creerPropositionManuelle` · `studio.propose` · sans appel modèle ;
 *  · `appliquerProposition` · `studio.propose` · nouvelle version par
 *    compare-and-set (409 et différences si la base est périmée) ; rien
 *    n'est généré ni débité ;
 *  · `rejeterProposition` · `studio.propose` ;
 *  · `listerPropositions`, `inspecterProposition` · `studio.read` · lectures
 *    pures.
 *
 * Les entrées sont `unknown` : une action serveur est appelable directement.
 */

export async function proposerPatch(entree: { projectId: unknown; baseVersionId: unknown; cible: unknown; demande: unknown; allowedPaths?: unknown }): Promise<ReponseProposition<ResultatProposer>> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return proposerAvecJarvis(g.ctx, {
    tache: 'document.patch', projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, cible: entree?.cible,
    demande: entree?.demande, allowedPaths: entree?.allowedPaths,
  }, dependancesProduction());
}

export async function proposerBrief(entree: { projectId: unknown; baseVersionId: unknown; demande: unknown; formats?: unknown }): Promise<ReponseProposition<ResultatProposer>> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return proposerAvecJarvis(g.ctx, {
    tache: 'brief.build', projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, demande: entree?.demande, formats: entree?.formats,
  }, dependancesProduction());
}

export async function creerPropositionManuelle(entree: { projectId: unknown; baseVersionId: unknown; cible: unknown; changes: unknown; explication?: unknown; allowedPaths?: unknown }): Promise<ReponseProposition<ResultatProposer>> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return creerManuelle(g.ctx, {
    projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, cible: entree?.cible, changes: entree?.changes,
    explication: entree?.explication, allowedPaths: entree?.allowedPaths,
  });
}

export async function appliquerProposition(entree: { proposalId: unknown; projectId: unknown; baseVersionId: unknown }): Promise<ReponseProposition<ResultatApplication>> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return appliquerDepot(g.ctx, { proposalId: entree?.proposalId, projectId: entree?.projectId, baseVersionId: entree?.baseVersionId });
}

export async function rejeterProposition(entree: { proposalId: unknown; projectId: unknown; raison?: unknown }): Promise<ReponseProposition<{ projectId: string; proposition: PropositionPresentee }>> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return rejeterDepot(g.ctx, { proposalId: entree?.proposalId, projectId: entree?.projectId, raison: entree?.raison });
}

/** LECTURE PURE · propositions du projet, version courante, disponibilité de Jarvis, cibles. */
export async function listerPropositions(entree: { projectId: unknown }): Promise<ReponseProposition<ListePropositions>> {
  const g = await gardeStudio('studio.read');
  if (!g.ok) return g;
  return listerDepot(g.ctx, { projectId: entree?.projectId }, { jarvis: await disponibiliteJarvisServeur(g.ctx) });
}

/** LECTURE PURE · une proposition. */
export async function inspecterProposition(entree: { proposalId: unknown }): Promise<ReponseProposition<{ projectId: string; versionCourante: { id: string; n: number }; proposition: PropositionPresentee }>> {
  const g = await gardeStudio('studio.read');
  if (!g.ok) return g;
  return inspecterDepot(g.ctx, { proposalId: entree?.proposalId });
}
