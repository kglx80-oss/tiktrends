import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  verdictComposants, lireReferenceEpinglee, transitionQualite, erreurStudio, associationProduit, criteresComposants, versionDepuisEmpreinte, aPermissionEspace,
  type ControleVisuel, type ConstatComposant, type VerdictComposants, type StatutQualite, type EtatJob, type ErreurStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { ajouterAudit } from '../audit';
import { estUuid, lireAsset, lireJob, lireVersion } from '../depot';
// L6-B · contrôle visuel routé (F-D) branché sur la même règle des composants.
import { executerTache, type ResolveurMediasTache } from '../prompts/resolveur';
import type { AdaptateurModele } from '../prompts/adaptateur';
// R3 · contrôle visuel = ligne du devis approuvé, borne appliquée avant l'appel.
import { borneMaxAppel, controleVisionApprouve, depasseMontantApprouve, lireSnapshotJob, requeteDepuisMessagesCompiles } from '@tiktrends/core';
import type { EnvironnementPrompts } from '../prompts/environnement';

/**
 * Statut QUALITÉ d'une sortie au regard des composants obligatoires du produit
 * épinglé (cahier §4.4 point 5, §4.6 ; recette IMG-03).
 *
 * Deux portes, une seule règle (`verdictComposants`, noyau) :
 *
 *  · `controlerComposantsSortie` · acteur `controle` (serveur, à la fin d'un
 *    job) : un job `completed` en `pending` passe en `rejected` (composant
 *    absent), `requires_review` (non vérifié, ou aucun contrôle visuel), ou
 *    `passed` seulement si chaque composant est confirmé. Le contrôle vient du
 *    SERVEUR (tâche `quality.visual`, ou `null` tant que la vision n'est pas
 *    routée), jamais du client.
 *  · `trancherComposants` · acteur `relecteur` : la liste cochée composant par
 *    composant. Un composant absent ⇒ `rejected` ; tous présents ⇒ `passed` ;
 *    un composant non coché ⇒ refus, rien d'écrit (pas de succès par défaut).
 *
 * Les composants requis sont relus dans la version DU JOB (`productRef`
 * épinglé), jamais reçus du client. Compare-and-set sur `row_version` et le
 * statut, audit dans la même transaction. Aucun coût, aucune régénération.
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

class Refus extends Error {
  constructor(public readonly erreur: ErreurStudio) { super(erreur.code); }
}

async function composantsDuJob(ctx: ContexteStudio, job: typeof schema.studioJobs.$inferSelect): Promise<Resultat<{ requis: string[] }>> {
  const v = await lireVersion(ctx, job.projectVersionId);
  if (!v.ok) return v;
  const ref = lireReferenceEpinglee((v.version.content as { productRef?: unknown }).productRef);
  return { ok: true, requis: ref ? [...ref.composantsObligatoires] : [] };
}

async function poser(
  ctx: ContexteStudio, job: typeof schema.studioJobs.$inferSelect, vers: StatutQualite, acteur: 'controle' | 'relecteur', verdict: VerdictComposants, action: string,
): Promise<Resultat<{ qualite: StatutQualite; verdict: VerdictComposants }>> {
  const t = transitionQualite(job.state as EtatJob, job.qualityStatus as StatutQualite, vers, acteur);
  if (!t.ok) {
    return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, targetIds: [job.id], message: job.state !== 'completed' ? 'Le média n’est pas encore enregistré · attends la fin du job.' : 'Ce média a déjà été tranché.' });
  }
  const J = schema.studioJobs;
  try {
    return await db.transaction(async (tx) => {
      const [m] = await tx.update(J).set({ qualityStatus: vers, rowVersion: job.rowVersion + 1, updatedAt: new Date() })
        .where(and(eq(J.id, job.id), eq(J.workspaceId, ctx.workspaceId), eq(J.rowVersion, job.rowVersion), eq(J.qualityStatus, job.qualityStatus))).returning({ id: J.id });
      if (!m) throw new Refus(erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [job.id] }));
      await ajouterAudit(tx, ctx, {
        action, brandId: job.brandId, targetType: 'studio_job', targetId: job.id, versionBefore: job.qualityStatus, versionAfter: vers,
        reason: verdict.raison, details: { manquants: verdict.manquants, nonVerifies: verdict.nonVerifies, confirmes: verdict.confirmes },
      });
      return { ok: true as const, qualite: vers, verdict };
    });
  } catch (err) {
    if (err instanceof Refus) return err.erreur;
    console.error(`[studios:l5c] ${ctx.traceId} qualité`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId });
  }
}

/** Contrôle automatique à la fin d'un job · `controle` = sortie validée de `quality.visual`, ou `null`. */
export async function controlerComposantsSortie(ctx: ContexteStudio, e: { jobId: unknown }, controle: ControleVisuel | null): Promise<Resultat<{ qualite: StatutQualite; verdict: VerdictComposants }>> {
  const j = await lireJob(ctx, e.jobId);
  if (!j.ok) return j;
  const c = await composantsDuJob(ctx, j.job);
  if (!c.ok) return c;
  const verdict = verdictComposants({ requis: c.requis, controle });
  return poser(ctx, j.job, verdict.statut, 'controle', verdict, 'media.quality.control');
}

/** Décision du relecteur · chaque composant coché présent ou absent. */
export async function trancherComposants(ctx: ContexteStudio, e: { jobId: unknown; constats: unknown }): Promise<Resultat<{ qualite: StatutQualite; verdict: VerdictComposants }>> {
  const j = await lireJob(ctx, e.jobId);
  if (!j.ok) return j;
  const c = await composantsDuJob(ctx, j.job);
  if (!c.ok) return c;
  const brut = Array.isArray(e.constats) ? e.constats : [];
  const constats: ConstatComposant[] = brut
    .filter((x): x is { composant: string; present: unknown } => typeof x === 'object' && x !== null && typeof (x as { composant?: unknown }).composant === 'string')
    .map((x) => ({ composant: x.composant, present: x.present === true ? true : x.present === false ? false : null }));
  const verdict = verdictComposants({ requis: c.requis, controle: null, constats });
  if (verdict.statut === 'requires_review') {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: verdict.nonVerifies.length ? verdict.nonVerifies.map((n) => ({ chemin: 'constats', raison: `composant « ${n} » non coché` })) : [{ chemin: 'constats', raison: 'aucun composant obligatoire déclaré · accepte ou rejette le média depuis sa carte' }] });
  }
  return poser(ctx, j.job, verdict.statut, 'relecteur', verdict, verdict.statut === 'passed' ? 'media.accept' : 'media.reject');
}

/* ───────────────────── L6-B · contrôle visuel routé (VIDEO-04) ───────────── */

export interface DependancesVision {
  adaptateur: AdaptateurModele | null;
  environnement: EnvironnementPrompts;
  plafondAtteint: () => Promise<boolean>;
  /** Lecture des médias liés · défaut : `studio_assets` de l'espace ET de la marque (F-D). */
  medias?: ResolveurMediasTache;
}

export interface ResultatVision {
  qualite: StatutQualite;
  verdict: VerdictComposants;
  /** `vision` si `quality.visual` a conclu ; `aucun` sinon (la raison est dans `motif`). */
  controle: 'vision' | 'aucun';
  motif: string | null;
  runId: string | null;
}

/**
 * VIDEO-04 · « une boîte à la place des lunettes est un échec qualité, même si
 * le job fournisseur réussit ». Après un job `completed`, la sortie livrée
 * (médias `sta_` du résultat, octets relus par le serveur dans la portée) part
 * en `quality.visual` (vision routée par F-D, barrière de dépense de
 * l'adaptateur réel) avec la référence Produit épinglée et un critère par
 * composant obligatoire. La sortie VALIDÉE du registre devient le contrôle de
 * `verdictComposants` : composant absent ⇒ `rejected`, douteux ⇒
 * `requires_review`, `passed` seulement si tout est confirmé.
 *
 * Sans release publiée, sans fournisseur, plafond atteint, média illisible,
 * sortie bloquée ou invalide : AUCUN contrôle ⇒ `requires_review`, jamais
 * `passed`, et le motif est rendu. La réussite technique du job n'entre
 * nulle part dans la décision.
 *
 * Coût (R3) : le contrôle est une LIGNE du devis accepté avant génération
 * (`controle:vision`, borne par image, `avecControleVision`). Sans cette ligne
 * dans l'instantané approuvé du job ⇒ REFUS, avant tout appel : 0 requête,
 * 0 ligne `ai_spend` · jamais un débit ajouté après coup. Avec elle, la requête
 * réelle est bornée (`borneMaxAppel`) et refusée AVANT l'envoi si sa borne
 * dépasse le montant approuvé : la ligne est une borne, pas une estimation.
 * Un seul contrôle par job : un média déjà tranché n'est pas re-contrôlé.
 */

/** L'adaptateur, borné au montant approuvé · refuse AVANT l'appel ce qui pourrait le dépasser. */
function adaptateurBorne(a: AdaptateurModele, approuveMicros: number): AdaptateurModele {
  return {
    nom: a.nom, simule: a.simule, modelePour: (p) => a.modelePour(p),
    async appeler(x) {
      const modele = a.modelePour(x.profil) ?? 'modele-non-route';
      const borne = borneMaxAppel(requeteDepuisMessagesCompiles({ modele, messages: x.messages, images: x.pieces?.length ?? 0, maxJetonsSortie: x.maxJetonsSortie }));
      const refus = depasseMontantApprouve(borne, approuveMicros);
      if (refus) {
        const e = new Error(`Contrôle visuel refusé avant envoi · ${refus}.`);
        e.name = 'SpendBlockedError';
        throw e;
      }
      return a.appeler(x);
    },
  };
}
export async function controlerSortieParVision(ctx: ContexteStudio, e: { jobId: unknown }, d: DependancesVision): Promise<Resultat<ResultatVision>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.generate')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  const j = await lireJob(ctx, e.jobId);
  if (!j.ok) return j;
  const job = j.job;
  // R3 · jamais un débit hors devis : sans ligne « contrôle visuel » approuvée, rien ne part.
  const ligne = controleVisionApprouve(lireSnapshotJob(job.snapshot)?.lignes);
  if (!ligne) {
    return erreurStudio('BUDGET_EXCEEDED', { traceId: ctx.traceId, targetIds: [job.id], message: 'Contrôle visuel hors devis · aucune ligne « contrôle visuel » n’a été approuvée pour ce média. Rien n’est envoyé ni dépensé · relis la sortie toi-même.' });
  }
  if (job.qualityStatus !== 'pending') {
    return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, targetIds: [job.id], message: 'Ce média a déjà été tranché · le contrôle visuel du devis a déjà servi.' });
  }
  const v = await lireVersion(ctx, job.projectVersionId);
  if (!v.ok) return v;
  const ref = lireReferenceEpinglee((v.version.content as { productRef?: unknown }).productRef);
  const requis = ref ? [...ref.composantsObligatoires] : [];

  let controle: ControleVisuel | null = null;
  let motif: string | null = null;
  let runId: string | null = null;
  const ids = Object.values((job.result as { assets?: Record<string, unknown> } | null)?.assets ?? {}).filter(estUuid);
  if (job.state !== 'completed') motif = 'le média n’est pas encore enregistré';
  else if (ids.length === 0) motif = 'aucun média livré par ce job';
  else if (!d.adaptateur) motif = 'le fournisseur de vision n’est pas configuré sur ce serveur';
  else if (await d.plafondAtteint()) motif = 'le plafond de dépense est atteint';
  if (motif === null) {
    const liaisons: Array<Record<string, unknown>> = [];
    for (const [i, id] of ids.entries()) {
      const a = await lireAsset(ctx, id);
      if (!a.ok || a.asset.brandId !== job.brandId) { motif = 'média livré introuvable dans la portée du job'; break; }
      liaisons.push({ bindingId: `sortie_${i + 1}`, assetId: `sta_${id}`, assetVersion: versionDepuisEmpreinte(a.asset.sha256), sha256: a.asset.sha256, role: 'sortie', modality: 'image', derivation: 'original', nativeAttachmentIndex: i, coverageDescription: 'média livré entier' });
    }
    if (motif === null) {
      const r = await executerTache({
        templateKey: 'quality.visual', portee: { workspaceId: job.workspaceId, brandId: job.brandId }, acteur: { userId: ctx.userId, traceId: ctx.traceId },
        taskInputs: { outputAssetIds: ids.map((id) => `sta_${id}`), referenceIds: ref ? [ref.photo.assetId] : [], criteria: criteresComposants(requis) },
        contexte: { connaissances: false, references: ref ? [associationProduit(ref)] : [], mediaBindings: liaisons as never },
        liens: { projectId: job.projectId, jobId: job.id, documentVersionId: job.projectVersionId },
        adaptateur: adaptateurBorne(d.adaptateur!, ligne.totalUsdMicros), environnement: d.environnement, ...(d.medias ? { medias: d.medias } : {}),
      });
      runId = r.runId;
      if (!r.ok) {
        motif = r.code === 'RELEASE_ACTIVE_ABSENTE' ? 'aucune version des consignes n’est publiée · contrôle visuel indisponible' : `contrôle visuel non conclu (${r.code})`;
      } else {
        const s = r.sortie as { status: string; result: (ControleVisuel & { summary?: string }) | null };
        if (s.status !== 'ready' || !s.result) motif = 'le contrôle visuel s’est déclaré bloqué';
        else controle = { verdict: s.result.verdict, issues: s.result.issues, unverifiable: s.result.unverifiable };
      }
    }
  }
  const verdict = verdictComposants({ requis, controle });
  const raison = controle ? verdict.raison : `${verdict.raison} Aucun contrôle visuel : ${motif}.`;
  const p = await poser(ctx, job, verdict.statut, 'controle', { ...verdict, raison }, 'media.quality.control');
  if (!p.ok) return p;
  return { ok: true, qualite: p.qualite, verdict: p.verdict, controle: controle ? 'vision' : 'aucun', motif, runId };
}
