'use server';

import { revalidatePath } from 'next/cache';
import { coutMaximalTexte, decisionFournisseurStudio, fournisseurAnimationBranche, erreurStudio, type ErreurStudio, type BilanDurees } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { refusCapacitesDevis } from '../../../lib/studios/interrupteurs';
import { getSession } from '../../../lib/auth';
import { unlimitedCredits } from '../../../lib/credits';
import { spendStatus } from '../../../lib/spend-guard';
import { lirePointeur } from '../../../lib/studios/prompts/depot-prompts';
import { modeleTexte } from '../../../lib/studios/prompts/adaptateur';
import { dependancesTextesProduction } from '../../../lib/studios/textes/dependances';
import { lireVideoPour, type VueVideo } from '../../../lib/studios/video/lecture';
import { planifierStoryboardPour, type ResultatStoryboardServeur } from '../../../lib/studios/video/storyboard';
import { compilerConsignePlanPour, retenirConsignePlanPour, type ResultatCompilationPlan } from '../../../lib/studios/video/consigne';
import { appliquerOperationVideoPour, devisKeyframePour, approuverKeyframePour, devisClipPour, approuverClipPour, type ImpactPresente } from '../../../lib/studios/video/commandes';
import type { DevisPresente, JobPresente } from '../../../lib/studios/execution/commandes';
import type { VersionStudio } from '../../../lib/studios/depot';

/**
 * Studio vidéo (lot L6-A) · gestes SÉPARÉS, chacun explicite :
 *
 *  · `appliquerOperationVideo` · `studio.propose`, montage (ordre, narration,
 *    sans texte, musique, plan, scénario) · nouvelle version, AUCUN coût ;
 *  · `planifierStoryboard` · `studio.generate`, appel texte PAYANT (coût
 *    maximal annoncé avant le clic, barrière de dépense) · rien n'est écrit ;
 *  · `compilerConsignePlan` · `studio.generate`, appel texte PAYANT, le
 *    serveur atteste la consigne de l'image clé ;
 *  · `retenirConsignePlan` · `studio.propose`, nouvelle version (409) ;
 *  · `demanderDevisKeyframe` · `studio.generate`, devis immuable, aucune dépense ;
 *  · `approuverEtLancerKeyframe` · `studio.generate`, la SEULE qui engage de
 *    l'argent, refusée sans fournisseur d'images. Une demande
 *    conversationnelle ne l'appelle jamais.
 *
 *  · `demanderDevisClip` · `studio.generate`, devis du clip animé d'un plan
 *    (image clé valide exigée), aucune dépense ;
 *  · `approuverEtLancerClip` · `studio.generate`, engage de l'argent (forfait
 *    vidéo annoncé avant le clic), refusée sans fournisseur d'animation ni
 *    décodeur vidéo prouvé.
 *
 * F1 · toute l'action vidéo est sous la capacité « video », COUPÉE par défaut
 * (chaîne non validée en réel) · refus `UNSUPPORTED_CAPABILITY` avant toute
 * écriture ; l'approbation relit aussi les lignes du devis.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

const fournisseurImageBranche = () => decisionFournisseurStudio(process.env).ok;
const chemin = (projectId: unknown) => (typeof projectId === 'string' ? `/studio/projets/${projectId}/video` : '/studio/projets');

export async function lireVideo(entree: { projectId: unknown }): Promise<Reponse<{ vue: VueVideo }>> {
  const g = await gardeStudio('studio.read', 'video');
  if (!g.ok) return g;
  const [pointeur, plafond] = await Promise.all([lirePointeur().catch(() => null), spendStatus()]);
  return lireVideoPour(g.ctx, entree?.projectId, {
    maintenant: new Date(), releasePubliee: pointeur !== null, fournisseurTexte: !!process.env.ANTHROPIC_API_KEY,
    plafondAtteint: plafond.blocked, fournisseurImage: fournisseurImageBranche(), coutTexteUsd: coutMaximalTexte(modeleTexte()),
  });
}

export async function appliquerOperationVideo(entree: { projectId: unknown; baseVersionId: unknown; operation: unknown }): Promise<Reponse<{ version: VersionStudio; inchange: boolean; impact: ImpactPresente; durees: BilanDurees; signalements: string[] }>> {
  const g = await gardeStudio('studio.propose', 'video');
  if (!g.ok) return g;
  const r = await appliquerOperationVideoPour(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, operation: entree?.operation });
  if (r.ok) revalidatePath(chemin(entree?.projectId));
  return r;
}

export async function planifierStoryboard(entree: { projectId: unknown; nbPlans: unknown; dureeCibleMs: unknown; speechMode: unknown }): Promise<Reponse<ResultatStoryboardServeur>> {
  const g = await gardeStudio('studio.generate', 'video');
  if (!g.ok) return g;
  const d = dependancesTextesProduction();
  if (await d.plafondAtteint()) return erreurStudio('BUDGET_EXCEEDED', { traceId: g.ctx.traceId });
  return planifierStoryboardPour(g.ctx, { projectId: entree?.projectId, nbPlans: entree?.nbPlans, dureeCibleMs: entree?.dureeCibleMs, speechMode: entree?.speechMode }, {
    adaptateur: d.adaptateur, environnement: d.environnement, maintenant: new Date(),
  });
}

export async function compilerConsignePlan(entree: { projectId: unknown; shotId: unknown }): Promise<ResultatCompilationPlan> {
  const g = await gardeStudio('studio.generate', 'video');
  if (!g.ok) return g;
  const d = dependancesTextesProduction();
  if (await d.plafondAtteint()) return erreurStudio('BUDGET_EXCEEDED', { traceId: g.ctx.traceId });
  return compilerConsignePlanPour(g.ctx, { projectId: entree?.projectId, shotId: entree?.shotId }, { adaptateur: d.adaptateur, environnement: d.environnement, maintenant: new Date() });
}

export async function retenirConsignePlan(entree: { projectId: unknown; baseVersionId: unknown; runId: unknown }): Promise<Reponse<{ version: VersionStudio; inchange: boolean }>> {
  const g = await gardeStudio('studio.propose', 'video');
  if (!g.ok) return g;
  const r = await retenirConsignePlanPour(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, runId: entree?.runId });
  if (r.ok) revalidatePath(chemin(entree?.projectId));
  return r.ok ? { ok: true, version: r.version, inchange: r.inchange } : r;
}

export async function demanderDevisKeyframe(entree: { projectId: unknown; shotId: unknown }): Promise<Reponse<{ devis: DevisPresente }>> {
  const g = await gardeStudio('studio.generate', 'video');
  if (!g.ok) return g;
  return devisKeyframePour(g.ctx, { projectId: entree?.projectId, shotId: entree?.shotId });
}

export async function approuverEtLancerKeyframe(entree: { quoteId: unknown; inputHash: unknown; creditsAnnonces: unknown; idempotencyKey: unknown }): Promise<Reponse<{ job: JobPresente; deja: boolean }>> {
  const g = await gardeStudio('studio.generate', 'video');
  if (!g.ok) return g;
  const coupe = await refusCapacitesDevis(g.ctx, entree?.quoteId);
  if (coupe) return coupe;
  const s = await getSession();
  const plafond = await spendStatus();
  return approuverKeyframePour(g.ctx, {
    quoteId: entree?.quoteId, inputHash: entree?.inputHash, creditsAnnonces: entree?.creditsAnnonces, idempotencyKey: entree?.idempotencyKey,
  }, {
    illimite: unlimitedCredits(s?.user.email),
    plafond: { capUsd: plafond.capUsd, depenseUsd: plafond.spentUsd, bloque: plafond.blocked },
    fournisseurImage: fournisseurImageBranche(),
  });
}

export async function demanderDevisClip(entree: { projectId: unknown; shotId: unknown }): Promise<Reponse<{ devis: DevisPresente }>> {
  const g = await gardeStudio('studio.generate', 'video');
  if (!g.ok) return g;
  return devisClipPour(g.ctx, { projectId: entree?.projectId, shotId: entree?.shotId });
}

export async function approuverEtLancerClip(entree: { quoteId: unknown; inputHash: unknown; creditsAnnonces: unknown; idempotencyKey: unknown }): Promise<Reponse<{ job: JobPresente; deja: boolean }>> {
  const g = await gardeStudio('studio.generate', 'video');
  if (!g.ok) return g;
  const coupe = await refusCapacitesDevis(g.ctx, entree?.quoteId);
  if (coupe) return coupe;
  const s = await getSession();
  const plafond = await spendStatus();
  return approuverClipPour(g.ctx, {
    quoteId: entree?.quoteId, inputHash: entree?.inputHash, creditsAnnonces: entree?.creditsAnnonces, idempotencyKey: entree?.idempotencyKey,
  }, {
    illimite: unlimitedCredits(s?.user.email),
    plafond: { capUsd: plafond.capUsd, depenseUsd: plafond.spentUsd, bloque: plafond.blocked },
    fournisseurAnimation: fournisseurAnimationBranche(process.env),
  });
}
