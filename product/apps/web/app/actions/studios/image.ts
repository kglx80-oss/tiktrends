'use server';

import { coutMaximalTexte, decisionFournisseurStudio, erreurStudio, type ErreurStudio, type StatutQualite } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { gardeSources } from '../../../lib/studios/sources/acces';
import { getSession } from '../../../lib/auth';
import { unlimitedCredits } from '../../../lib/credits';
import { spendStatus } from '../../../lib/spend-guard';
import { lirePointeur } from '../../../lib/studios/prompts/depot-prompts';
import { modeleTexte } from '../../../lib/studios/prompts/adaptateur';
import { dependancesTextesProduction } from '../../../lib/studios/textes/dependances';
import { compilerEtAttesterPour, retenirConsignePour, type ResultatCompilationImage } from '../../../lib/studios/image/consigne';
import {
  lireParcoursImagePour, devisImagePour, approuverImagePour, controlerMediaPour, type VueParcoursImage,
} from '../../../lib/studios/image/parcours';
import type { DevisPresente, JobPresente } from '../../../lib/studios/execution/commandes';
import type { VersionStudio } from '../../../lib/studios/depot';

/**
 * Parcours image du studio (lot F-B) · quatre gestes SÉPARÉS, chacun explicite :
 *
 *  · `compilerConsigneImage` · `studio.generate`, appel texte PAYANT (coût
 *    maximal annoncé avant le clic, barrière de dépense), aucun média ; le
 *    serveur atteste la consigne validée ;
 *  · `retenirConsigneImage` · `studio.propose`, nouvelle version (409), le
 *    navigateur ne donne que l'identifiant de la compilation ;
 *  · `demanderDevisImage` · `studio.generate`, devis immuable, aucune dépense ;
 *  · `approuverEtLancerImage` · `studio.generate`, la SEULE qui engage de
 *    l'argent (approbation L3), refusée si le fournisseur d'images n'est pas
 *    branché. Une demande conversationnelle ne l'appelle jamais.
 *
 * Plus deux lectures/gestes sans coût : l'état du parcours (`studio.read`) et
 * le contrôle des composants d'un média livré (`studio.propose`).
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

/** Le fournisseur d'images est-il branché ici ? Même règle que le worker (F-A). */
const fournisseurImageBranche = () => decisionFournisseurStudio(process.env).ok;

export async function lireParcoursImage(entree: { projectId: unknown }): Promise<Reponse<{ vue: VueParcoursImage }>> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  const [pointeur, plafond] = await Promise.all([lirePointeur().catch(() => null), spendStatus()]);
  return lireParcoursImagePour(g.ctx, entree?.projectId, {
    veilleOuverte: g.veilleOuverte, maintenant: new Date(),
    releasePubliee: pointeur !== null, fournisseurTexte: !!process.env.ANTHROPIC_API_KEY, plafondAtteint: plafond.blocked,
    fournisseurImage: fournisseurImageBranche(), coutCompilationUsd: coutMaximalTexte(modeleTexte()),
  });
}

export async function compilerConsigneImage(entree: { projectId: unknown; mode: unknown }): Promise<ResultatCompilationImage> {
  const g = await gardeSources('studio.generate');
  if (!g.ok) return g;
  const d = dependancesTextesProduction();
  if (await d.plafondAtteint()) return erreurStudio('BUDGET_EXCEEDED', { traceId: g.ctx.traceId });
  return compilerEtAttesterPour(g.ctx, { projectId: entree?.projectId, mode: entree?.mode }, {
    adaptateur: d.adaptateur, environnement: d.environnement, veilleOuverte: g.veilleOuverte, maintenant: new Date(),
  });
}

export async function retenirConsigneImage(entree: { projectId: unknown; baseVersionId: unknown; runId: unknown }): Promise<Reponse<{ version: VersionStudio; inchange: boolean }>> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  const r = await retenirConsignePour(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, runId: entree?.runId });
  return r.ok ? { ok: true, version: r.version, inchange: r.inchange } : r;
}

export async function demanderDevisImage(entree: { projectId: unknown; controleVision?: unknown }): Promise<Reponse<{ devis: DevisPresente }>> {
  const g = await gardeStudio('studio.generate');
  if (!g.ok) return g;
  // R3 · la case « contrôle visuel » (cochée par défaut) · seul `false` la retire du devis.
  return devisImagePour(g.ctx, { projectId: entree?.projectId, controleVision: entree?.controleVision === false ? false : undefined });
}

export async function approuverEtLancerImage(entree: { quoteId: unknown; inputHash: unknown; creditsAnnonces: unknown; idempotencyKey: unknown }): Promise<Reponse<{ job: JobPresente; deja: boolean }>> {
  const g = await gardeStudio('studio.generate');
  if (!g.ok) return g;
  const s = await getSession();
  const plafond = await spendStatus();
  return approuverImagePour(g.ctx, {
    quoteId: entree?.quoteId, inputHash: entree?.inputHash, creditsAnnonces: entree?.creditsAnnonces, idempotencyKey: entree?.idempotencyKey,
  }, {
    illimite: unlimitedCredits(s?.user.email),
    plafond: { capUsd: plafond.capUsd, depenseUsd: plafond.spentUsd, bloque: plafond.blocked },
    fournisseurImage: fournisseurImageBranche(),
  });
}

export async function controlerMediaImage(entree: { jobId: unknown }): Promise<Reponse<{ qualite: StatutQualite }>> {
  const g = await gardeStudio('studio.propose');
  if (!g.ok) return g;
  return controlerMediaPour(g.ctx, { jobId: entree?.jobId });
}
