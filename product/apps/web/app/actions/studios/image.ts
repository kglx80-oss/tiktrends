'use server';

import { aPermissionEspace, messageCapaciteCoupee, coutMaximalTexte, decisionFournisseurStudio, erreurStudio, type ErreurStudio, type StatutQualite } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { gardeSources } from '../../../lib/studios/sources/acces';
import { etatInterrupteurs, refusCapacite, refusCapacitesDevis, refusCapacitesJob } from '../../../lib/studios/interrupteurs';
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
 *
 * F1 · interrupteurs : tout le parcours est sous « generation_image » (coupée
 * par défaut, fournisseur non validé en réel) ; la case du contrôle visuel
 * n'est proposée, et la ligne n'entre au devis, que si « controle_visuel » est
 * active ; un média dont le devis portait le contrôle visuel n'est pas relu par
 * la vision quand celui-ci est coupé (le refus le dit, rien n'est appelé).
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

/** Le fournisseur d'images est-il branché ici ? Même règle que le worker (F-A). */
const fournisseurImageBranche = () => decisionFournisseurStudio(process.env).ok;

export async function lireParcoursImage(entree: { projectId: unknown }): Promise<Reponse<{ vue: VueParcoursImage }>> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  const inter = await etatInterrupteurs(g.ctx.workspaceId);
  if (!inter.actif('generation_image')) return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: g.ctx.traceId, message: messageCapaciteCoupee(['generation_image']), targetIds: ['generation_image'] });
  const [pointeur, plafond] = await Promise.all([lirePointeur().catch(() => null), spendStatus()]);
  const r = await lireParcoursImagePour(g.ctx, entree?.projectId, {
    veilleOuverte: g.veilleOuverte, maintenant: new Date(),
    releasePubliee: pointeur !== null, fournisseurTexte: !!process.env.ANTHROPIC_API_KEY, plafondAtteint: plafond.blocked,
    fournisseurImage: fournisseurImageBranche(), coutCompilationUsd: coutMaximalTexte(modeleTexte()),
  });
  // La case n'est pas offerte quand le contrôle visuel est coupé pour l'espace.
  if (r.ok && !inter.actif('controle_visuel')) return { ok: true, vue: { ...r.vue, controleVision: { ...r.vue.controleVision, disponible: false } } };
  return r;
}

export async function compilerConsigneImage(entree: { projectId: unknown; mode: unknown }): Promise<ResultatCompilationImage> {
  const g = await gardeSources('studio.generate');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['generation_image']);
  if (coupe) return coupe;
  const d = dependancesTextesProduction();
  if (await d.plafondAtteint()) return erreurStudio('BUDGET_EXCEEDED', { traceId: g.ctx.traceId });
  return compilerEtAttesterPour(g.ctx, { projectId: entree?.projectId, mode: entree?.mode }, {
    adaptateur: d.adaptateur, environnement: d.environnement, veilleOuverte: g.veilleOuverte, maintenant: new Date(),
  });
}

export async function retenirConsigneImage(entree: { projectId: unknown; baseVersionId: unknown; runId: unknown }): Promise<Reponse<{ version: VersionStudio; inchange: boolean }>> {
  const g = await gardeStudio('studio.propose', 'generation_image');
  if (!g.ok) return g;
  const r = await retenirConsignePour(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, runId: entree?.runId });
  return r.ok ? { ok: true, version: r.version, inchange: r.inchange } : r;
}

export async function demanderDevisImage(entree: { projectId: unknown; controleVision?: unknown }): Promise<Reponse<{ devis: DevisPresente }>> {
  const g = await gardeStudio('studio.generate', 'generation_image');
  if (!g.ok) return g;
  // R3 · la case « contrôle visuel » (cochée par défaut) · seul `false` la retire du devis.
  // F1 · contrôle visuel coupé pour l'espace ⇒ jamais dans le devis (le worker ne réclamerait pas le job).
  const visionCoupee = (await refusCapacite(g.ctx, ['controle_visuel'])) !== null;
  return devisImagePour(g.ctx, { projectId: entree?.projectId, controleVision: entree?.controleVision === false || visionCoupee ? false : undefined });
}

export async function approuverEtLancerImage(entree: { quoteId: unknown; inputHash: unknown; creditsAnnonces: unknown; idempotencyKey: unknown }): Promise<Reponse<{ job: JobPresente; deja: boolean }>> {
  const g = await gardeStudio('studio.generate', 'generation_image');
  if (!g.ok) return g;
  const coupe = await refusCapacitesDevis(g.ctx, entree?.quoteId);
  if (coupe) return coupe;
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
  // Sans `studio.generate`, la commande ne lance jamais la vision (composants seuls) · rien à couper.
  if (aPermissionEspace(g.ctx.permissions, 'studio.generate')) {
    const coupe = await refusCapacitesJob(g.ctx, entree?.jobId, ['controle_visuel']);
    if (coupe) return coupe;
  }
  return controlerMediaPour(g.ctx, { jobId: entree?.jobId });
}
