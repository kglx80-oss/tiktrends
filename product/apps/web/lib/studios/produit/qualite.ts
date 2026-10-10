import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
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
// E2 · reprise du contrôle manquant, exclusion mutuelle, issue incertaine réconciliée avant relance.
import {
  CLE_MARQUEUR_CONTROLE_VISION, causeIncertaine, decisionControleVision, issueEchecAppel, lireMarqueurControleVision, messageControleIncertain,
  reservationTexteLiberable, type IssueEchecAppel, type LigneDepenseLiee, type MarqueurControleVision,
} from '@tiktrends/core';
// R5 · une issue incertaine dont toutes les lignes sont réconciliées avec la facture n'est plus incertaine.
import { controleIncertainReconcilie } from '@tiktrends/core';
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
  /** E2 · vrai si l'appel a une issue INCERTAINE (facturé peut-être) : à réconcilier avant toute relance. */
  incertain?: boolean;
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

/** Ce que l'adaptateur borné a constaté de SON appel · l'issue d'un échec, pour le marqueur du job. */
export interface TemoinAppel {
  /** Vrai dès que la requête a été passée au fournisseur (après la borne). */
  envoye: boolean;
  echec: IssueEchecAppel | null;
  cause: string | null;
}

const statutErreur = (e: unknown): number | null => {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' && Number.isInteger(s) ? s : null;
};

/**
 * L'adaptateur, borné au montant approuvé · refuse AVANT l'appel ce qui
 * pourrait le dépasser. `temoin` (E2) reçoit l'issue d'un échec : avant
 * l'envoi, refus certain du fournisseur, ou issue INCERTAINE (la requête a pu
 * être facturée). Exporté : la commande de recette borne aussi la compilation
 * à sa ligne de devis.
 */
export function adaptateurBorne(a: AdaptateurModele, approuveMicros: number, temoin?: TemoinAppel): AdaptateurModele {
  return {
    nom: a.nom, simule: a.simule, modelePour: (p) => a.modelePour(p),
    async appeler(x) {
      const modele = a.modelePour(x.profil) ?? 'modele-non-route';
      const borne = borneMaxAppel(requeteDepuisMessagesCompiles({ modele, messages: x.messages, images: x.pieces?.length ?? 0, maxJetonsSortie: x.maxJetonsSortie }));
      const refus = depasseMontantApprouve(borne, approuveMicros);
      if (refus) {
        const e = new Error(`Appel refusé avant envoi · ${refus}.`);
        e.name = 'SpendBlockedError';
        if (temoin) { temoin.echec = 'avant_envoi'; temoin.cause = null; }
        throw e;
      }
      if (temoin) temoin.envoye = true;
      try {
        return await a.appeler(x);
      } catch (e) {
        if (temoin) {
          const statut = statutErreur(e);
          const nom = (e as Error | null)?.name ?? null;
          temoin.echec = issueEchecAppel({ nom, refusCertain: reservationTexteLiberable(statut) });
          temoin.cause = temoin.echec === 'incertaine' ? causeIncertaine({ statut, texte: e instanceof Error ? `${e.name} ${e.message}` : String(e) }) : null;
        }
        throw e;
      }
    },
  };
}

/** Action `ai_spend` d'un contrôle visuel · celle que le résolveur impute (`studio-prompt:<clé>`). */
export const ACTION_DEPENSE_CONTROLE_VISION = 'studio-prompt:quality.visual';
/** Marge d'horloge entre le serveur et la base, pour retrouver les lignes nées pendant un contrôle. */
const MARGE_HORLOGE_MS = 5_000;

/**
 * Les lignes de dépense nées PENDANT un contrôle (espace du job, action du
 * contrôle visuel, fenêtre du marqueur) et incertaines · lecture seule. R5 :
 * chacune dit si elle a été réconciliée avec la facture (`reconciliee`).
 */
async function lignesDuControle(job: typeof schema.studioJobs.$inferSelect, m: { le: string; fin?: string | null }): Promise<Array<LigneDepenseLiee & { reconciliee: boolean }>> {
  const A = schema.aiSpend;
  const R = schema.aiSpendReconciliations;
  const debut = new Date(Date.parse(m.le) - MARGE_HORLOGE_MS);
  const fin = new Date((m.fin ? Date.parse(m.fin) : Date.now()) + MARGE_HORLOGE_MS);
  if (!Number.isFinite(debut.getTime()) || !Number.isFinite(fin.getTime())) return [];
  const rows = await db.select({ id: A.id, createdAt: A.createdAt, actualUsd: A.actualUsd, cause: A.reconcileReason, entree: A.inputTokens, sortie: A.outputTokens, rec: R.id })
    .from(A)
    .leftJoin(R, eq(R.aiSpendId, A.id))
    .where(and(eq(A.workspaceId, job.workspaceId), eq(A.action, ACTION_DEPENSE_CONTROLE_VISION), gte(A.createdAt, debut), lte(A.createdAt, fin)))
    .orderBy(A.createdAt);
  return rows
    .filter((r) => r.cause !== null || (r.entree === null && r.sortie === null && Number(r.actualUsd) > 0))
    .map((r) => ({ id: r.id, createdAt: r.createdAt, actualUsd: Number(r.actualUsd), cause: r.cause, reconciliee: r.rec !== null }));
}

/**
 * R5 · REPREND un contrôle incertain réconcilié · UNE écriture conditionnelle
 * (le marqueur « incertain » de CETTE trace, qualité `pending` ou
 * `requires_review` laissée par ce contrôle) qui pose le marqueur « engagé »
 * du nouveau lancement et rend la qualité à `pending`, avec son audit, dans la
 * même transaction. Un second lancement simultané ne correspond plus : un
 * seul reprend. Rend le job relu, ou `null` si la reprise n'a pas été prise.
 */
async function reprendreMarqueur(
  ctx: ContexteStudio, job: typeof schema.studioJobs.$inferSelect, ancienne: string, m: MarqueurControleVision, lignes: readonly string[],
): Promise<typeof schema.studioJobs.$inferSelect | null> {
  const J = schema.studioJobs;
  return db.transaction(async (tx) => {
    const [pris] = await tx.update(J)
      .set({
        result: sql`jsonb_set(coalesce(${J.result}, '{}'::jsonb), ${`{${CLE_MARQUEUR_CONTROLE_VISION}}`}::text[], ${JSON.stringify(m)}::jsonb)`,
        qualityStatus: 'pending', rowVersion: sql`${J.rowVersion} + 1`, updatedAt: new Date(),
      })
      .where(and(
        eq(J.id, job.id), eq(J.workspaceId, job.workspaceId), eq(J.state, 'completed'), inArray(J.qualityStatus, ['pending', 'requires_review']),
        sql`${J.result} -> ${CLE_MARQUEUR_CONTROLE_VISION} ->> 'etat' = 'incertain'`,
        sql`${J.result} -> ${CLE_MARQUEUR_CONTROLE_VISION} ->> 'trace' = ${ancienne}`,
      ))
      .returning();
    if (!pris) return null;
    await ajouterAudit(tx, ctx, {
      action: 'media.quality.reprise', brandId: job.brandId, targetType: 'studio_job', targetId: job.id,
      versionBefore: job.qualityStatus, versionAfter: 'pending',
      reason: 'contrôle visuel incertain réconcilié avec la facture · reprise du seul contrôle approuvé',
      details: { lignesReconciliees: [...lignes], traceIncertaine: ancienne },
    });
    return pris;
  });
}

/**
 * Prend le marqueur « engagé » du job · UNE écriture conditionnelle : job
 * terminé, qualité `pending`, aucun marqueur. Sous Postgres, la seconde de
 * deux écritures simultanées attend la première, relit la ligne et ne
 * correspond plus : un seul lancement l'obtient (`e2-controle-vision-pg`).
 */
async function prendreMarqueur(job: typeof schema.studioJobs.$inferSelect, m: MarqueurControleVision): Promise<boolean> {
  const J = schema.studioJobs;
  const pris = await db.update(J)
    .set({ result: sql`jsonb_set(coalesce(${J.result}, '{}'::jsonb), ${`{${CLE_MARQUEUR_CONTROLE_VISION}}`}::text[], ${JSON.stringify(m)}::jsonb)` })
    .where(and(
      eq(J.id, job.id), eq(J.workspaceId, job.workspaceId), eq(J.state, 'completed'), eq(J.qualityStatus, 'pending'),
      isNull(sql`${J.result} -> ${CLE_MARQUEUR_CONTROLE_VISION}`),
    ))
    .returning({ id: J.id });
  return pris.length === 1;
}

/** Écrit l'issue sur le marqueur QUE CE LANCEMENT a pris (même trace) · jamais celui d'un autre. */
async function conclureMarqueur(job: typeof schema.studioJobs.$inferSelect, m: MarqueurControleVision): Promise<void> {
  const J = schema.studioJobs;
  await db.update(J)
    .set({ result: sql`jsonb_set(coalesce(${J.result}, '{}'::jsonb), ${`{${CLE_MARQUEUR_CONTROLE_VISION}}`}::text[], ${JSON.stringify(m)}::jsonb)` })
    .where(and(eq(J.id, job.id), sql`${J.result} -> ${CLE_MARQUEUR_CONTROLE_VISION} ->> 'trace' = ${m.trace}`, sql`${J.result} -> ${CLE_MARQUEUR_CONTROLE_VISION} ->> 'etat' = 'engage'`));
}

/** Retire le marqueur « engagé » de CE lancement quand rien n'est parti (panne avant l'envoi). */
async function libererMarqueur(job: typeof schema.studioJobs.$inferSelect, trace: string): Promise<void> {
  const J = schema.studioJobs;
  await db.update(J)
    .set({ result: sql`${J.result} - ${CLE_MARQUEUR_CONTROLE_VISION}::text` })
    .where(and(eq(J.id, job.id), sql`${J.result} -> ${CLE_MARQUEUR_CONTROLE_VISION} ->> 'trace' = ${trace}`, sql`${J.result} -> ${CLE_MARQUEUR_CONTROLE_VISION} ->> 'etat' = 'engage'`));
}

const MESSAGE_DEJA_TRANCHE = 'Ce média a déjà été tranché · le contrôle visuel du devis a déjà servi.';
const MESSAGE_DEJA_CONTROLE = 'Le contrôle visuel de ce média a déjà été exécuté (et payé), mais son verdict n’a pas été enregistré · aucun second appel. Relis le média toi-même.';
const messageEngage = (le: string | null) => `Un contrôle visuel de ce média est déjà engagé${le ? ` depuis ${le}` : ''} sans issue enregistrée · s’il tourne encore, attends sa fin ; s’il a été interrompu, son issue est incertaine : rapproche la dépense de la facture du fournisseur avant toute relance. Aucun second appel n’est lancé.`;

/**
 * Le refus d'un contrôle visuel, dit en clair, AVANT tout appel · `null` s'il
 * peut partir. Exporté pour `controlerMediaPour` (même règle, même message).
 */
export async function refusControleVision(ctx: ContexteStudio, job: typeof schema.studioJobs.$inferSelect): Promise<ErreurStudio | null> {
  return (await decisionDuJob(ctx, job)).refus;
}

/** La décision pour CE job · le refus dit, ou la permission, avec la reprise d'un contrôle incertain réconcilié (R5). */
async function decisionDuJob(ctx: ContexteStudio, job: typeof schema.studioJobs.$inferSelect): Promise<{ refus: ErreurStudio | null; reprise: { trace: string; lignes: string[] } | null }> {
  const ligne = controleVisionApprouve(lireSnapshotJob(job.snapshot)?.lignes);
  const marqueur = lireMarqueurControleVision(job.result);
  const incertain = marqueur !== null && marqueur !== 'illisible' && marqueur.etat === 'incertain' ? marqueur : null;
  const lignesIncertaines = incertain && ligne !== null ? await lignesDuControle(job, incertain) : [];
  const d = decisionControleVision({ visionApprouvee: ligne !== null, qualite: job.qualityStatus, marqueur, incertainReconcilie: controleIncertainReconcilie(lignesIncertaines) });
  if (d.lancer) return { refus: null, reprise: d.reprise && incertain ? { trace: incertain.trace, lignes: lignesIncertaines.map((l) => l.id) } : null };
  const refus = await refusDit(ctx, job, d.motif, marqueur, lignesIncertaines);
  return { refus, reprise: null };
}

async function refusDit(
  ctx: ContexteStudio, job: typeof schema.studioJobs.$inferSelect, motif: Exclude<ReturnType<typeof decisionControleVision>, { lancer: true }>['motif'],
  marqueur: ReturnType<typeof lireMarqueurControleVision>, lignesIncertaines: ReadonlyArray<LigneDepenseLiee & { reconciliee: boolean }>,
): Promise<ErreurStudio> {
  const base = { traceId: ctx.traceId, targetIds: [job.id] };
  switch (motif) {
    case 'hors_devis':
      return erreurStudio('BUDGET_EXCEEDED', { ...base, message: 'Contrôle visuel hors devis · aucune ligne « contrôle visuel » n’a été approuvée pour ce média. Rien n’est envoyé ni dépensé · relis la sortie toi-même.' });
    case 'incertain': {
      const m = marqueur as Extract<MarqueurControleVision, { etat: 'incertain' }>;
      // R5 · seules les lignes encore à réconcilier sont nommées.
      return erreurStudio('PROVIDER_UNCERTAIN', { ...base, message: messageControleIncertain(m, lignesIncertaines.filter((l) => !l.reconciliee)) });
    }
    case 'deja_tranche':
      return erreurStudio('INVARIANT_CONFLICT', { ...base, message: MESSAGE_DEJA_TRANCHE });
    case 'deja_controle':
      return erreurStudio('INVARIANT_CONFLICT', { ...base, message: MESSAGE_DEJA_CONTROLE });
    case 'engage': {
      const le = marqueur !== null && marqueur !== 'illisible' ? marqueur.le : null;
      // Engagé depuis longtemps sans issue : c'est peut-être une coupure. On montre les lignes nées depuis.
      const lignes = le ? await lignesDuControle(job, { le }) : [];
      return erreurStudio('INVARIANT_CONFLICT', { ...base, message: le && lignes.length ? `${messageEngage(le)} ${messageControleIncertain({ le }, lignes)}` : messageEngage(le) });
    }
  }
}

export async function controlerSortieParVision(ctx: ContexteStudio, e: { jobId: unknown }, d: DependancesVision): Promise<Resultat<ResultatVision>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.generate')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  const j = await lireJob(ctx, e.jobId);
  if (!j.ok) return j;
  let job = j.job;
  // R3 · jamais un débit hors devis ; E2 · jamais un second contrôle (engagé, conclu, incertain, tranché).
  // R5 · sauf la REPRISE d'un contrôle incertain dont toutes les lignes sont réconciliées avec la facture.
  const { refus, reprise } = await decisionDuJob(ctx, job);
  if (refus) return refus;
  const ligne = controleVisionApprouve(lireSnapshotJob(job.snapshot)?.lignes)!;
  const v = await lireVersion(ctx, job.projectVersionId);
  if (!v.ok) return v;
  const ref = lireReferenceEpinglee((v.version.content as { productRef?: unknown }).productRef);
  const requis = ref ? [...ref.composantsObligatoires] : [];

  let controle: ControleVisuel | null = null;
  let motif: string | null = null;
  let runId: string | null = null;
  let motifIncertain: { le: string; fin: string; cause: string } | null = null;
  const ids = Object.values((job.result as { assets?: Record<string, unknown> } | null)?.assets ?? {}).filter(estUuid);
  if (job.state !== 'completed') motif = 'le média n’est pas encore enregistré';
  else if (ids.length === 0) motif = 'aucun média livré par ce job';
  else if (!d.adaptateur) motif = 'le fournisseur de vision n’est pas configuré sur ce serveur';
  else if (await d.plafondAtteint()) motif = 'le plafond de dépense est atteint';
  // R5 · une reprise qui ne peut pas partir ne repose pas la qualité : rien n'a changé, on le dit.
  if (reprise && motif !== null) {
    return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, targetIds: [job.id], message: `Reprise du contrôle visuel impossible · ${motif}. Rien n’est envoyé ni dépensé.` });
  }
  if (motif === null) {
    const liaisons: Array<Record<string, unknown>> = [];
    for (const [i, id] of ids.entries()) {
      const a = await lireAsset(ctx, id);
      if (!a.ok || a.asset.brandId !== job.brandId) { motif = 'média livré introuvable dans la portée du job'; break; }
      liaisons.push({ bindingId: `sortie_${i + 1}`, assetId: `sta_${id}`, assetVersion: versionDepuisEmpreinte(a.asset.sha256), sha256: a.asset.sha256, role: 'sortie', modality: 'image', derivation: 'original', nativeAttachmentIndex: i, coverageDescription: 'média livré entier' });
    }
    if (motif === null) {
      // E2 · exclusion mutuelle : le marqueur « engagé » est pris AVANT l'appel ; qui ne l'obtient pas n'appelle rien.
      const trace = `${ctx.traceId}:${randomUUID()}`;
      const le = new Date().toISOString();
      const repris = reprise ? await reprendreMarqueur(ctx, job, reprise.trace, { etat: 'engage', le, trace }, reprise.lignes) : null;
      if (repris) job = repris;
      else if (reprise || !(await prendreMarqueur(job, { etat: 'engage', le, trace }))) {
        const relu = await lireJob(ctx, job.id);
        const r2 = relu.ok ? await refusControleVision(ctx, relu.job) : null;
        return r2 ?? erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, targetIds: [job.id], message: messageEngage(null) });
      }
      const temoin: TemoinAppel = { envoye: false, echec: null, cause: null };
      let r: Awaited<ReturnType<typeof executerTache>>;
      try {
        r = await executerTache({
        templateKey: 'quality.visual', portee: { workspaceId: job.workspaceId, brandId: job.brandId }, acteur: { userId: ctx.userId, traceId: ctx.traceId },
        taskInputs: { outputAssetIds: ids.map((id) => `sta_${id}`), referenceIds: ref ? [ref.photo.assetId] : [], criteria: criteresComposants(requis) },
        contexte: { connaissances: false, references: ref ? [associationProduit(ref)] : [], mediaBindings: liaisons as never },
        liens: { projectId: job.projectId, jobId: job.id, documentVersionId: job.projectVersionId },
        adaptateur: adaptateurBorne(d.adaptateur!, ligne.totalUsdMicros, temoin), environnement: d.environnement, ...(d.medias ? { medias: d.medias } : {}),
        });
      } catch (err) {
        // Rien n'est parti ⇒ le marqueur est rendu (un nouvel essai reste possible). Une panne APRÈS
        // l'envoi n'est pas un échec certain : le marqueur reste « engagé », toute relance est refusée.
        if (!temoin.envoye) await libererMarqueur(job, trace).catch(() => {});
        throw err;
      }
      const fin = new Date().toISOString();
      await conclureMarqueur(job, temoin.echec === 'incertaine'
        ? { etat: 'incertain', le, fin, trace, cause: temoin.cause ?? 'inconnue' }
        : { etat: 'conclu', le, fin, trace });
      if (temoin.echec === 'incertaine') motifIncertain = { le, fin, cause: temoin.cause ?? 'inconnue' };
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
  if (motifIncertain) motif = `${motif ?? 'contrôle visuel non conclu'} · issue incertaine, dépense à réconcilier avant toute relance`;
  const verdict = verdictComposants({ requis, controle });
  const raison = controle ? verdict.raison : `${verdict.raison} Aucun contrôle visuel : ${motif}.`;
  const p = await poser(ctx, job, verdict.statut, 'controle', { ...verdict, raison }, 'media.quality.control');
  if (!p.ok) return p;
  return { ok: true, qualite: p.qualite, verdict: p.verdict, controle: controle ? 'vision' : 'aucun', motif, runId, ...(motifIncertain ? { incertain: true } : {}) };
}
