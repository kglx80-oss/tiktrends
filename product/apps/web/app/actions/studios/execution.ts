'use server';

import { capacitesDesOperations, decisionFournisseurStudio, erreurStudio, type ErreurStudio, type PlanImpact, type VueJob, type StatutQualite } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { refusCapacite, refusCapacitesDevis } from '../../../lib/studios/interrupteurs';
import { getSession } from '../../../lib/auth';
import { unlimitedCredits } from '../../../lib/credits';
import { spendStatus } from '../../../lib/spend-guard';
import {
  estimerImpact as estimerImpactCmd, creerDevis as creerDevisCmd, approuverEtMettreEnFile as approuverCmd,
  annulerJob as annulerCmd, etatJob as etatCmd, deciderQualite,
  type DevisPresente, type JobPresente,
} from '../../../lib/studios/execution/commandes';

/**
 * Commandes d'exécution des studios (plan 06 §3). Chaque commande :
 * `gardeStudio(permission)` (session relue, contexte serveur, rien pris du
 * client), puis la commande, qui filtre la portée dans chaque requête.
 *
 *  · `estimerImpact`, `etatJob` · lecture et calcul, aucune écriture ;
 *  · `creerDevis` · devis immuable, aucune dépense ;
 *  · `approuverEtMettreEnFile` · la SEULE qui engage de l'argent, dans une
 *    transaction (approbation, réserve, débit, job, outbox) ; refusée AVANT
 *    toute écriture quand le fournisseur d'images n'est pas branché sur ce
 *    serveur (`decisionFournisseurStudio`, même règle que le worker et que
 *    l'écran image) : sans lui le worker ne démarre pas, le job resterait en
 *    file avec sa réserve débitée et rien ne serait produit ;
 *  · `annulerJob` · demande d'annulation, aucun remboursement promis ;
 *  · `accepterMedia` / `rejeterMedia` · statut qualité seul, aucun coût.
 *
 * F1 · `creerDevis` et `approuverEtMettreEnFile` exigent que les capacités
 * des opérations (génération d'images, vidéo, voix, contrôle visuel) soient
 * actives pour l'espace (interrupteurs) · refus AVANT tout devis ou débit.
 * Lire, annuler, accepter, rejeter ne sont jamais coupés : un job déjà payé
 * doit pouvoir être suivi, annulé et tranché.
 *
 * Aucune n'appelle de fournisseur : le worker (`apps/workers/src/studios`)
 * exécute, hors de toute requête HTTP.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

/** Même phrase que l'écran image (`approuverImagePour`, F-B) · le refus est le même. Non exportée : un fichier « use server » n'exporte que des actions. */
const MESSAGE_SANS_FOURNISSEUR_IMAGE = 'Le fournisseur d’images n’est pas branché sur ce serveur · rien n’a été approuvé ni débité.';

export async function estimerImpact(entree: { projectId: unknown; versionAvantId?: unknown; operations?: unknown; variante?: unknown }): Promise<Reponse<{ projectVersionId: string; plan: PlanImpact; devisIndicatif: unknown }>> {
  const g = await gardeStudio('studio.read');
  if (!g.ok) return g;
  return estimerImpactCmd(g.ctx, { projectId: entree?.projectId, versionAvantId: entree?.versionAvantId, operations: entree?.operations, variante: entree?.variante });
}

export async function creerDevis(entree: { projectId: unknown; versionAvantId?: unknown; operations?: unknown; validiteMs?: unknown; variante?: unknown }): Promise<Reponse<{ devis: DevisPresente; plan: PlanImpact }>> {
  const g = await gardeStudio('studio.generate');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, capacitesDesOperations(Array.isArray(entree?.operations) ? entree.operations : []));
  if (coupe) return coupe;
  return creerDevisCmd(g.ctx, { projectId: entree?.projectId, versionAvantId: entree?.versionAvantId, operations: entree?.operations, validiteMs: entree?.validiteMs, variante: entree?.variante });
}

export async function approuverEtMettreEnFile(entree: { quoteId: unknown; inputHash: unknown; creditsAnnonces: unknown; idempotencyKey: unknown }): Promise<Reponse<{ job: JobPresente; deja: boolean }>> {
  const g = await gardeStudio('studio.generate');
  if (!g.ok) return g;
  // G-A · même règle que le worker (F-A) et que l'écran image (F-B) : sans
  // fournisseur branché, rien ne serait exécuté · refus AVANT toute écriture.
  if (!decisionFournisseurStudio(process.env).ok) {
    return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: g.ctx.traceId, message: MESSAGE_SANS_FOURNISSEUR_IMAGE });
  }
  const coupe = await refusCapacitesDevis(g.ctx, entree?.quoteId);
  if (coupe) return coupe;
  const s = await getSession();
  const plafond = await spendStatus();
  return approuverCmd(g.ctx, {
    quoteId: entree?.quoteId, inputHash: entree?.inputHash, creditsAnnonces: entree?.creditsAnnonces, idempotencyKey: entree?.idempotencyKey,
  }, {
    illimite: unlimitedCredits(s?.user.email),
    plafond: { capUsd: plafond.capUsd, depenseUsd: plafond.spentUsd, bloque: plafond.blocked },
  });
}

export async function annulerJob(entree: { jobId: unknown }): Promise<Reponse<{ job: JobPresente; vue: VueJob }>> {
  const g = await gardeStudio('studio.generate');
  if (!g.ok) return g;
  return annulerCmd(g.ctx, { jobId: entree?.jobId });
}

/** Lecture PURE · par id ou par la clé du clic (reprise après fermeture du navigateur). */
export async function etatJob(entree: { jobId?: unknown; idempotencyKey?: unknown }): Promise<Reponse<{ job: JobPresente; vue: VueJob }>> {
  const g = await gardeStudio('studio.read');
  if (!g.ok) return g;
  return etatCmd(g.ctx, { jobId: entree?.jobId, idempotencyKey: entree?.idempotencyKey });
}

export async function accepterMedia(entree: { jobId: unknown; raison?: unknown }): Promise<Reponse<{ job: JobPresente; qualite: StatutQualite }>> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return deciderQualite(g.ctx, { jobId: entree?.jobId, raison: entree?.raison }, 'passed');
}

export async function rejeterMedia(entree: { jobId: unknown; raison?: unknown }): Promise<Reponse<{ job: JobPresente; qualite: StatutQualite }>> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return deciderQualite(g.ctx, { jobId: entree?.jobId, raison: entree?.raison }, 'rejected');
}
