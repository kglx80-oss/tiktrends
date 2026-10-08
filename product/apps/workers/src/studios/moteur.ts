import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { schema, eq, and, or, sql, inArray, isNull, desc } from '@tiktrends/db';
import {
  transitionJob, transitionQualite, jobTerminal,
  cleFournisseurDuJob, preuveSoumission, decisionBailExpire, decisionAnnulation, decisionStatut, decisionEvenement,
  acteurDepuis, fenetreWebhook, chaineSignee, lireEvenement, lireSnapshotJob, operationsDuSnapshot,
  inspecterMedia, etatFichierMedia, estErreurCertaine,
  verdictDecodage, decisionMediaRefuse, operationsNonVerifiables,
  estParametresRetouche, lireParametresRetouche, controleComposantsAFinalisation, qualiteAFinalisation, lireReferenceEpinglee,
  type DecodeurMedia, type EnteteMedia, type ResultatDecodage, type ActeurJob, type EtatJob, type FournisseurStudio, type StockageStudio, type StatutFournisseur,
  type SnapshotJob, type IssueFinanciere, type SortieFournisseur,
} from '@tiktrends/core';
import { reglerJob } from './registre';
import { retoucherSortie, type TraceRetouche } from './retouche';
import type { BaseStudio, ExecStudio, JobStudio, TentativeStudio, TxStudio, EntreeJournal } from './types';

/**
 * Worker des studios · exécution durable d'un job (plan 06 §4 et §8).
 *
 * ── Choix de la file ─────────────────────────────────────────────────────────
 *
 * PostgreSQL, pas BullMQ. La vérité financière (approbation, réserve, job,
 * outbox) est écrite dans UNE transaction Postgres par la commande
 * d'approbation ; une seconde copie de l'état dans Redis pourrait diverger
 * (Redis est présent dans `docker-compose.yml` mais sans persistance AOF
 * configurée, et un job BullMQ perdu ou doublé ne se réconcilie pas avec le
 * registre). La table `studio_jobs` porte déjà bail, propriétaire, battement
 * et `row_version` (L1). On réclame par `FOR UPDATE SKIP LOCKED` + compare-and-set.
 *
 * ── Les invariants tenus ici ─────────────────────────────────────────────────
 *
 *  · `claimed` = prise en charge, jamais une seconde réserve (on ne réclame
 *    qu'un job dont la réserve existe) ;
 *  · la clé fournisseur est écrite en base AVEC `running`, AVANT l'appel ;
 *  · bail expiré avant soumission prouvée ⇒ `queued` ; après soumission
 *    possible ⇒ recherche par clé ou `reconciliation_required`, JAMAIS une
 *    nouvelle soumission ;
 *  · `completed` seulement quand chaque fichier a passé le premier filtre pur,
 *    a été RÉELLEMENT décodé (`DecodeurMedia`, pixels complets aux dimensions
 *    de l'en-tête), déposé, RELU et relié (`studio_assets`) ; sinon le job
 *    reste `persisting` et la reprise ne refait que la finalisation, sans
 *    régénérer. Un fichier refusé est retéléchargé `TELECHARGEMENTS_MEDIA_MAX`
 *    fois au plus, puis `failed` sans débit client. Une vidéo, faute de
 *    décodeur vidéo, n'est jamais livrée ni même soumise ;
 *  · règlement unique (`settle`) et libération (`release`) dans la transaction
 *    de l'état final ;
 *  · la qualité ne relance jamais rien : un constat négatif ⇒ `requires_review` ;
 *    l'image du studio Image et toute retouche reçoivent le contrôle des
 *    composants (L5-C) DANS la transaction de `completed` : sans contrôle
 *    visuel, `requires_review`, jamais `passed` (G-B) ;
 *  · une retouche masquée n'est JAMAIS livrée brute : la sortie décodée est
 *    recomposée sur la source sous le masque, contrôlée (0 pixel hors zone +
 *    fondu), encodée, relue et recontrôlée avant le dépôt (G-B, IMG-06).
 */

/** `col < d` · horloge injectée (jamais `now()` SQL) pour que les tests pilotent le temps. */
const avant = (col: unknown, d: Date) => sql`${col} < ${d.toISOString()}`;

const J = schema.studioJobs;
const A = schema.studioJobAttempts;
const L = schema.studioBudgetLedger;

export interface OptionsMoteur {
  base: BaseStudio;
  fournisseur: FournisseurStudio;
  stockage: StockageStudio;
  /** Décodage RÉEL des sorties · obligatoire : sans lui, rien n'atteint `completed`. */
  decodeur: DecodeurMedia;
  workerId?: string;
  /** Durée du bail · 60 s par défaut. */
  bailMs?: number;
  horloge?: () => Date;
  /** Secret des webhooks fournisseur · jamais écrit dans un journal. */
  secretWebhook?: string | null;
  /** Reçoit chaque ligne de journal APRÈS validation de sa transaction. */
  journal?: (e: EntreeJournal) => void;
}

/** Échec métier dans une transaction · la transaction est annulée. */
class PerteDeCourse extends Error {}

const ETATS_A_SUIVRE: EtatJob[] = ['claimed', 'running', 'persisting', 'cancel_requested'];
/**
 * Jobs suivis par tour. Les réconciliations ont leur PROPRE file, plafonnée et
 * tournante : un job sans preuve ne change rien en base, et dans une file
 * commune les plus anciens reprenaient toutes les places à chaque tour ·
 * 50 réconciliations suffisaient à ne plus jamais sonder un job lancé
 * (recette du 8 octobre). Politique, pas une mesure : 50 suivis, 10
 * réconciliations, les moins récemment examinés d'abord.
 */
const SUIVIS_PAR_TOUR = 50;
const RECONCILIATIONS_PAR_TOUR = 10;

interface ResultatJob {
  sorties?: SortieFournisseur[];
  coutUsdMicros?: number | null;
  progression?: number;
  annulationDemandee?: boolean;
  annulationEnvoyee?: boolean;
  assets?: Record<string, string>;
}

export class MoteurStudio {
  readonly workerId: string;
  private readonly base: BaseStudio;
  private readonly f: FournisseurStudio;
  private readonly stockage: StockageStudio;
  private readonly decodeur: DecodeurMedia;
  private readonly bailMs: number;
  private readonly horloge: () => Date;
  private readonly secret: string | null;
  private readonly sortieJournal: (e: EntreeJournal) => void;

  constructor(o: OptionsMoteur) {
    this.base = o.base;
    this.f = o.fournisseur;
    this.stockage = o.stockage;
    if (!o.decodeur || typeof o.decodeur.decoderImage !== 'function') throw new Error('MoteurStudio sans décodeur · aucun média ne serait vérifié');
    this.decodeur = o.decodeur;
    this.workerId = o.workerId ?? `wk-${randomUUID()}`;
    this.bailMs = o.bailMs ?? 60_000;
    this.horloge = o.horloge ?? (() => new Date());
    this.secret = o.secretWebhook ?? null;
    this.sortieJournal = o.journal ?? (() => {});
  }

  private maintenant(): Date { return this.horloge(); }
  private finBail(): Date { return new Date(this.maintenant().getTime() + this.bailMs); }

  /** Transaction + journal publié seulement après validation. */
  private async tx<T>(f: (tx: TxStudio, j: EntreeJournal[]) => Promise<T>): Promise<T> {
    const enAttente: EntreeJournal[] = [];
    const r = await this.base.transaction((tx) => f(tx, enAttente));
    for (const e of enAttente) this.sortieJournal(e);
    return r;
  }

  private noter(e: EntreeJournal): void { this.sortieJournal(e); }

  /**
   * Transition compare-and-set · refusée par la machine ⇒ exception ;
   * perdue (quelqu'un a bougé le job) ⇒ `PerteDeCourse`, transaction annulée.
   */
  private async transition(
    tx: TxStudio, journal: EntreeJournal[], job: JobStudio, vers: EtatJob, acteur: ActeurJob, motif: string,
    set: Partial<typeof J.$inferInsert> = {},
  ): Promise<JobStudio> {
    const v = transitionJob(job.state as EtatJob, vers, acteur);
    if (!v.ok) throw new Error(v.raison);
    const now = this.maintenant();
    const [j] = await tx.update(J)
      .set({ ...set, state: vers, rowVersion: job.rowVersion + 1, updatedAt: now, ...(jobTerminal(vers) ? { finishedAt: now, leaseOwner: null, leaseExpiresAt: null } : {}) })
      .where(and(eq(J.id, job.id), eq(J.state, job.state), eq(J.rowVersion, job.rowVersion)))
      .returning();
    if (!j) throw new PerteDeCourse(`job ${job.id} a changé`);
    await tx.insert(schema.studioAuditEvents).values({
      actorId: null, effectiveRole: `systeme:${acteur}`, workspaceId: job.workspaceId, brandId: job.brandId,
      action: `job.${vers}`, targetType: 'studio_job', targetId: job.id, versionBefore: job.state, versionAfter: vers,
      reason: motif.slice(0, 500), traceId: `wk:${this.workerId}`, details: null,
    });
    if (jobTerminal(vers) || vers === 'reconciliation_required') {
      await tx.insert(schema.studioOutbox).values({ workspaceId: job.workspaceId, topic: `studio.job.${vers}`, aggregateId: job.id, payload: { jobId: job.id, brandId: job.brandId, projectId: job.projectId, etat: vers } });
    }
    journal.push({ t: now.toISOString(), type: 'transition', worker: this.workerId, jobId: job.id, de: job.state, vers, acteur, motif });
    return j;
  }

  private async relire(ex: ExecStudio, id: string): Promise<JobStudio | null> {
    const [j] = await ex.select().from(J).where(eq(J.id, id)).limit(1);
    return j ?? null;
  }

  private async tentativeCourante(ex: ExecStudio, jobId: string): Promise<TentativeStudio | null> {
    const [t] = await ex.select().from(A).where(eq(A.jobId, jobId)).orderBy(desc(A.n)).limit(1);
    return t ?? null;
  }

  private snapshot(job: JobStudio): SnapshotJob {
    const s = lireSnapshotJob(job.snapshot);
    if (!s) throw new Error(`job ${job.id} · instantané illisible`);
    return s;
  }

  private resultat(job: JobStudio): ResultatJob {
    return (job.result && typeof job.result === 'object' ? job.result : {}) as ResultatJob;
  }

  /* ────────────────────────────── Réclamer ─────────────────────────────── */

  /**
   * `queued → claimed` pour UN job dont la réserve existe · une tentative
   * numérotée est créée dans la même transaction.
   */
  async reclamer(): Promise<JobStudio | null> {
    try {
      return await this.tx(async (tx, journal) => {
        const [c] = await tx.select().from(J)
          .where(and(eq(J.state, 'queued'), sql`exists (select 1 from ${L} where ${L.jobId} = ${J.id} and ${L.kind} = 'reserve')`))
          .orderBy(J.createdAt, J.id).limit(1).for('update', { skipLocked: true });
        if (!c) return null;
        const j = await this.transition(tx, journal, c, 'claimed', 'worker', 'prise en charge', {
          leaseOwner: this.workerId, leaseExpiresAt: this.finBail(), heartbeatAt: this.maintenant(),
        });
        const [m] = await tx.select({ n: sql<number>`coalesce(max(${A.n}), 0)::int` }).from(A).where(eq(A.jobId, j.id));
        await tx.insert(A).values({ jobId: j.id, workspaceId: j.workspaceId, brandId: j.brandId, n: Number(m?.n ?? 0) + 1, workerId: this.workerId, state: 'started' });
        return j;
      });
    } catch (e) {
      if (e instanceof PerteDeCourse) return null;
      throw e;
    }
  }

  /** Prend (ou prolonge) le bail d'un job · compare-and-set. */
  private async prendreBail(job: JobStudio): Promise<JobStudio | null> {
    const now = this.maintenant();
    const [j] = await this.base.update(J)
      .set({ leaseOwner: this.workerId, leaseExpiresAt: this.finBail(), heartbeatAt: now, rowVersion: job.rowVersion + 1 })
      .where(and(
        eq(J.id, job.id), eq(J.state, job.state), eq(J.rowVersion, job.rowVersion),
        or(isNull(J.leaseOwner), eq(J.leaseOwner, this.workerId), avant(J.leaseExpiresAt, now)),
      ))
      .returning();
    return j ?? null;
  }

  private bailExpire(job: JobStudio): boolean {
    return !job.leaseOwner || !job.leaseExpiresAt || job.leaseExpiresAt.getTime() < this.maintenant().getTime();
  }

  /* ────────────────────────────── Un tour ──────────────────────────────── */

  /**
   * Un passage : reprend les jobs actifs dont le bail est libre ou expiré (ou
   * déjà à soi), puis réclame les nouveaux. Rend le nombre d'étapes jouées.
   */
  async tour(o: { maxNouveaux?: number } = {}): Promise<number> {
    let etapes = 0;
    const now = this.maintenant();
    const libre = or(isNull(J.leaseOwner), eq(J.leaseOwner, this.workerId), avant(J.leaseExpiresAt, now));
    const actifs = await this.base.select().from(J)
      .where(and(inArray(J.state, ETATS_A_SUIVRE), libre))
      .orderBy(sql`${J.heartbeatAt} asc nulls first`, J.updatedAt).limit(SUIVIS_PAR_TOUR);
    const aReconcilier = await this.base.select().from(J)
      .where(and(eq(J.state, 'reconciliation_required'), libre))
      .orderBy(sql`${J.heartbeatAt} asc nulls first`, J.updatedAt).limit(RECONCILIATIONS_PAR_TOUR);
    for (const j of [...actifs, ...aReconcilier]) if (await this.etape(j)) etapes += 1;
    for (let i = 0; i < (o.maxNouveaux ?? 5); i++) {
      const j = await this.reclamer();
      if (!j) break;
      etapes += 1;
      await this.etape(j);
    }
    return etapes;
  }

  /** Joue l'étape suivante d'un job · rend vrai si quelque chose a été tenté. */
  async etape(job0: JobStudio): Promise<boolean> {
    try {
      let job: JobStudio | null = job0;
      const t = await this.tentativeCourante(this.base, job.id);
      const preuve = preuveSoumission(t && { providerIdempotencyKey: t.providerIdempotencyKey, providerRequestId: job.providerRequestId ?? t.providerRequestId });

      if (job.leaseOwner !== this.workerId || this.bailExpire(job)) {
        if (job.leaseOwner && this.bailExpire(job) && decisionBailExpire(job.state as EtatJob, preuve, { rechercheParCle: this.f.rechercheParCle }) === 'remettre_en_file') {
          await this.remettreEnFile(job, t);
          return true;
        }
        job = await this.prendreBail(job);
        if (!job) return false;
      }

      switch (job.state as EtatJob) {
        case 'claimed': await this.demarrer(job); break;
        case 'running':
          if (job.providerRequestId) await this.suivre(job);
          else await this.chercherOuReconcilier(job, 'bail repris sans identifiant de requête');
          break;
        case 'persisting': await this.finaliser(job); break;
        case 'cancel_requested': await this.traiterAnnulation(job); break;
        case 'reconciliation_required': await this.reconcilier(job); break;
        default: return false;
      }
      return true;
    } catch (e) {
      if (e instanceof PerteDeCourse) return false;
      throw e;
    }
  }

  /** Bail expiré AVANT soumission prouvée · retour en file, tentative abandonnée. */
  private async remettreEnFile(job: JobStudio, t: TentativeStudio | null): Promise<void> {
    await this.tx(async (tx, journal) => {
      await this.transition(tx, journal, job, 'queued', 'worker', `bail de ${job.leaseOwner} expiré avant soumission`, { leaseOwner: null, leaseExpiresAt: null, heartbeatAt: null });
      if (t && t.state === 'started') await tx.update(A).set({ state: 'abandoned', finishedAt: this.maintenant(), error: { motif: 'bail expiré avant soumission' } }).where(eq(A.id, t.id));
    });
  }

  /* ───────────────────────────── Démarrer ──────────────────────────────── */

  /** `claimed → running` avec la clé fournisseur, PUIS l'appel. */
  async demarrer(job0: JobStudio): Promise<void> {
    const snap = this.snapshot(job0);
    // Une sortie que ce worker ne saurait pas vérifier (vidéo sans décodeur)
    // ne se commande pas : refus AVANT toute soumission, rien n'est dépensé.
    const nonVerifiables = operationsNonVerifiables(operationsDuSnapshot(snap), { video: typeof this.decodeur.decoderVideo === 'function' });
    if (nonVerifiables.length > 0) {
      await this.terminer(job0, 'failed', 'worker', 'echec_sans_frais', `capacité indisponible · aucun décodeur vidéo dans le worker, sortie non vérifiable (${nonVerifiables.join(', ')}) · rien n'a été soumis`, 0);
      return;
    }
    const cle = cleFournisseurDuJob(job0.id);
    const job = await this.tx(async (tx, journal) => {
      const t = await this.tentativeCourante(tx, job0.id);
      if (!t) throw new Error(`job ${job0.id} sans tentative`);
      const j = await this.transition(tx, journal, job0, 'running', 'worker', 'clé fournisseur posée avant soumission', {
        provider: this.f.nom, leaseExpiresAt: this.finBail(), heartbeatAt: this.maintenant(),
      });
      await tx.update(A).set({ providerIdempotencyKey: cle }).where(eq(A.id, t.id));
      return j;
    });

    let requestId: string;
    try {
      this.noter({ t: this.maintenant().toISOString(), type: 'fournisseur', worker: this.workerId, jobId: job.id, appel: 'soumettre', detail: cle });
      ({ requestId } = await this.f.soumettre({ cleIdempotence: cle, operations: operationsDuSnapshot(snap), parametres: snap.parametres }));
    } catch (e) {
      if (estErreurCertaine(e)) {
        await this.terminerEnEchec(job.id, 'echec_sans_frais', `refus certain du fournisseur · ${(e as Error).message}`);
        return;
      }
      await this.chercherOuReconcilier(job, `réponse incertaine · ${(e as Error).message}`);
      return;
    }
    await this.enregistrerRequete(job.id, requestId);
  }

  /** Enregistre l'identifiant de requête · sans condition d'état (une annulation a pu arriver entre-temps). */
  private async enregistrerRequete(jobId: string, requestId: string): Promise<void> {
    await this.tx(async (tx) => {
      await tx.update(J).set({ providerRequestId: requestId, rowVersion: sql`${J.rowVersion} + 1`, updatedAt: this.maintenant() })
        .where(and(eq(J.id, jobId), isNull(J.providerRequestId)));
      const t = await this.tentativeCourante(tx, jobId);
      if (t) await tx.update(A).set({ state: 'submitted', providerRequestId: requestId }).where(eq(A.id, t.id));
    });
  }

  /**
   * L'appel a pu partir sans qu'on connaisse sa requête. On la CHERCHE par la
   * clé si le fournisseur sait le faire ; sinon, ou introuvable, réconciliation.
   * Jamais de nouvelle soumission.
   */
  private async chercherOuReconcilier(job: JobStudio, motif: string): Promise<void> {
    if (this.f.rechercheParCle && this.f.chercherParCle) {
      const t = await this.tentativeCourante(this.base, job.id);
      const cle = t?.providerIdempotencyKey ?? cleFournisseurDuJob(job.id);
      const trouve = await this.f.chercherParCle(cle);
      this.noter({ t: this.maintenant().toISOString(), type: 'fournisseur', worker: this.workerId, jobId: job.id, appel: 'chercherParCle', detail: trouve ? 'trouvée' : 'introuvable' });
      if (trouve) { await this.enregistrerRequete(job.id, trouve); return; }
    }
    const j = await this.relire(this.base, job.id);
    if (!j || jobTerminal(j.state as EtatJob) || j.state === 'reconciliation_required') return;
    await this.tx(async (tx, journal) => {
      await this.transition(tx, journal, j, 'reconciliation_required', acteurDepuis(j.state as EtatJob), motif);
      const t = await this.tentativeCourante(tx, j.id);
      if (t) await tx.update(A).set({ state: 'uncertain', error: { motif } }).where(eq(A.id, t.id));
    });
  }

  /* ────────────────────────────── Suivre ───────────────────────────────── */

  async suivre(job: JobStudio): Promise<void> {
    const statut = await this.f.statut(job.providerRequestId!);
    this.noter({ t: this.maintenant().toISOString(), type: 'fournisseur', worker: this.workerId, jobId: job.id, appel: 'statut', detail: statut.etat });
    await this.appliquerStatut(job.id, statut, 'sondage');
  }

  /**
   * Applique un statut lu chez le fournisseur, d'où qu'il vienne (sondage,
   * webhook, annulation, réconciliation). Relit le job : l'état qui compte est
   * celui de la base, pas celui qu'on croyait.
   */
  private async appliquerStatut(jobId: string, statut: StatutFournisseur, canal: string): Promise<void> {
    const job = await this.relire(this.base, jobId);
    if (!job || jobTerminal(job.state as EtatJob) || job.state === 'persisting') return;
    const res = this.resultat(job);
    const action = decisionStatut(statut.etat);
    const acteur = acteurDepuis(job.state as EtatJob);

    if (action === 'attendre') {
      await this.base.update(J).set({
        heartbeatAt: this.maintenant(),
        ...(job.leaseOwner === this.workerId ? { leaseExpiresAt: this.finBail() } : {}),
        ...(statut.etat === 'en_cours' && typeof statut.progression === 'number' ? { result: { ...res, progression: statut.progression } } : {}),
      }).where(and(eq(J.id, job.id), eq(J.rowVersion, job.rowVersion)));
      return;
    }
    if (action === 'persister' && statut.etat === 'reussi') {
      await this.tx(async (tx, journal) => {
        await this.transition(tx, journal, job, 'persisting', acteur, `succès fournisseur (${canal})`, {
          result: { ...res, sorties: statut.sorties, coutUsdMicros: statut.coutUsdMicros, progression: 100, annulationDemandee: res.annulationDemandee || job.state === 'cancel_requested' },
          leaseOwner: this.workerId, leaseExpiresAt: this.finBail(),
        });
        const t = await this.tentativeCourante(tx, job.id);
        if (t) await tx.update(A).set({ state: 'succeeded', cost: { usdMicros: statut.coutUsdMicros }, finishedAt: this.maintenant() }).where(eq(A.id, t.id));
      });
      const j = await this.relire(this.base, job.id);
      if (j) await this.finaliser(j);
      return;
    }
    if ((action === 'echec' && statut.etat === 'echoue') || (action === 'annule' && statut.etat === 'annule')) {
      const issue: IssueFinanciere = statut.facture ? 'facture_sans_livrable' : statut.etat === 'annule' ? 'annule_sans_frais' : 'echec_sans_frais';
      // `running → cancelled` n'existe pas : une annulation non demandée est un échec.
      const vers: EtatJob = statut.etat === 'annule' && job.state !== 'running' ? 'cancelled' : 'failed';
      await this.terminer(job, vers, acteur, issue, `${statut.etat} (${canal})`, statut.coutUsdMicros);
      return;
    }
    // Statut inconnu sur une requête acceptée : issue ambiguë.
    if (job.state !== 'reconciliation_required') {
      await this.tx(async (tx, journal) => {
        await this.transition(tx, journal, job, 'reconciliation_required', acteur, `statut fournisseur inconnu (${canal})`);
      });
    }
  }

  private async terminer(job: JobStudio, vers: EtatJob, acteur: ActeurJob, issue: IssueFinanciere, motif: string, coutUsdMicros: number | null): Promise<void> {
    const snap = this.snapshot(job);
    await this.tx(async (tx, journal) => {
      const j = await this.transition(tx, journal, job, vers, acteur, motif, { error: { issue, motif } });
      await reglerJob(tx, j, snap, issue, { coutFournisseurUsdMicros: coutUsdMicros, worker: this.workerId, journal });
      const t = await this.tentativeCourante(tx, job.id);
      if (t && (t.state === 'started' || t.state === 'submitted')) {
        await tx.update(A).set({ state: vers === 'cancelled' ? 'abandoned' : 'failed', finishedAt: this.maintenant(), error: { motif } }).where(eq(A.id, t.id));
      }
    });
  }

  private async terminerEnEchec(jobId: string, issue: IssueFinanciere, motif: string): Promise<void> {
    const job = await this.relire(this.base, jobId);
    if (!job || jobTerminal(job.state as EtatJob)) return;
    await this.terminer(job, 'failed', acteurDepuis(job.state as EtatJob), issue, motif, null);
  }

  /* ───────────────────────────── Finaliser ─────────────────────────────── */

  /**
   * `persisting → completed` : télécharger, premier filtre pur, DÉCODER
   * réellement, déposer, RELIRE, relier. Une erreur de stockage ou un décodeur
   * indisponible laisse le job `persisting` avec son constat · la reprise ne
   * refait que cette étape, sans régénérer. Un fichier refusé (structure ou
   * décodage) est retéléchargé en nombre borné, puis `failed` sans débit.
   */
  async finaliser(job: JobStudio): Promise<void> {
    if (job.state !== 'persisting') return;
    const res = this.resultat(job);
    const sorties = res.sorties ?? [];
    const requestId = job.providerRequestId;
    if (!requestId || sorties.length === 0) {
      await this.terminer(job, 'failed', 'finaliseur', 'facture_sans_livrable', 'succès annoncé sans sortie exploitable', res.coutUsdMicros ?? null);
      return;
    }
    const prefixe = this.f.simule ? 'simule' : 'studios';
    const snap = this.snapshot(job);
    // Retouche masquée : la sortie n'est livrée qu'une fois recomposée sur la source.
    const retouche = estParametresRetouche(snap.parametres) ? lireParametresRetouche(snap.parametres) : null;
    if (retouche && !retouche.ok) {
      await this.terminer(job, 'failed', 'finaliseur', 'facture_sans_livrable', `retouche illisible à la finalisation · ${retouche.violations.join(' · ')}`, res.coutUsdMicros ?? null);
      return;
    }
    const fichiers: Array<{ operation: string; cle: string; mime: string; octets: number; sha256: string; largeur: number | null; hauteur: number | null; parentAssetId: string | null; retouche: TraceRetouche | null }> = [];
    for (const s of sorties) {
      let octets: Uint8Array;
      try {
        ({ octets } = await this.f.telecharger(requestId, s.ref));
      } catch (e) {
        if (estErreurCertaine(e)) {
          await this.terminer(job, 'failed', 'finaliseur', 'facture_sans_livrable', `résultat introuvable chez le fournisseur · ${(e as Error).message}`, res.coutUsdMicros ?? null);
          return;
        }
        await this.noterEchecPersistance(job, `téléchargement · ${(e as Error).message}`);
        return;
      }
      const entete = inspecterMedia(octets);
      if (!entete) {
        // Format reconnu mais fichier incomplet ou sans contenu (transfert
        // coupé, MP4 sans piste) : retéléchargé en nombre borné, rien n'est
        // livré ni réglé entre-temps. Pas un média du tout : échec.
        if (etatFichierMedia(octets) === 'incomplet') {
          await this.mediaRefuse(job, `sortie ${s.operation} incomplète ou sans contenu (${octets.length} octets)`);
          return;
        }
        await this.terminer(job, 'failed', 'finaliseur', 'facture_sans_livrable', `sortie ${s.operation} non reconnue comme média`, res.coutUsdMicros ?? null);
        return;
      }
      const verdict = verdictDecodage(entete, await this.decoder(entete, octets));
      if (!verdict.livrable) {
        if (verdict.suite === 'refuser') {
          await this.terminer(job, 'failed', 'finaliseur', 'facture_sans_livrable', `sortie ${s.operation} refusée · ${verdict.raison}`, res.coutUsdMicros ?? null);
          return;
        }
        if (verdict.suite === 'attendre') {
          await this.noterEchecPersistance(job, `décodage impossible · ${verdict.raison}`);
          return;
        }
        await this.mediaRefuse(job, `sortie ${s.operation} non décodée · ${verdict.raison}`);
        return;
      }
      let livre = { octets, mime: entete.mime as string, largeur: verdict.largeur, hauteur: verdict.hauteur, parentAssetId: null as string | null, retouche: null as TraceRetouche | null };
      if (retouche) {
        const r = await retoucherSortie({ ex: this.base, stockage: this.stockage, job, parametres: retouche.parametres, generation: octets });
        if (!r.ok) {
          if (r.suite === 'attendre') { await this.noterEchecPersistance(job, `retouche · ${r.raison}`); return; }
          // La sortie brute n'est JAMAIS livrée à la place de la recomposition.
          await this.terminer(job, 'failed', 'finaliseur', 'facture_sans_livrable', `sortie ${s.operation} non livrée · ${r.raison}`, res.coutUsdMicros ?? null);
          return;
        }
        livre = { octets: r.octets, mime: r.mime, largeur: r.largeur, hauteur: r.hauteur, parentAssetId: r.parentAssetId, retouche: r.trace };
      }
      octets = livre.octets;
      const sha256 = createHash('sha256').update(octets).digest('hex');
      const ext = livre.mime.split('/')[1];
      const cle = `${prefixe}/${job.workspaceId}/${job.id}/${s.operation.replace(/[^A-Za-z0-9_.-]/g, '_')}.${ext}`;
      try {
        await this.stockage.deposer(cle, octets, livre.mime);
        const relu = await this.stockage.relire(cle);
        if (!relu || createHash('sha256').update(relu).digest('hex') !== sha256) throw new Error('relecture différente du dépôt');
      } catch (e) {
        await this.noterEchecPersistance(job, `stockage · ${(e as Error).message}`);
        return;
      }
      fichiers.push({ operation: s.operation, cle, mime: livre.mime, octets: octets.length, sha256, largeur: livre.largeur, hauteur: livre.hauteur, parentAssetId: livre.parentAssetId, retouche: livre.retouche });
    }

    const concerne = controleComposantsAFinalisation({ operations: operationsDuSnapshot(snap), parametres: snap.parametres });
    await this.tx(async (tx, journal) => {
      const assets: Record<string, string> = {};
      for (const f of fichiers) {
        const [a] = await tx.insert(schema.studioAssets).values({
          workspaceId: job.workspaceId, brandId: job.brandId, projectId: job.projectId,
          storageKey: f.cle, mime: f.mime, bytes: f.octets, width: f.largeur, height: f.hauteur,
          sha256: f.sha256, origin: 'generated', storageState: 'stored', createdBy: job.createdBy, parentAssetId: f.parentAssetId,
          rights: {
            ...(this.f.simule
              ? { simule: true, mention: 'Média simulé · test local, jamais une génération réelle', jobId: job.id, operation: f.operation }
              : { jobId: job.id, operation: f.operation, fournisseur: this.f.nom }),
            ...(f.retouche ? { retouche: f.retouche } : {}),
          },
        }).returning({ id: schema.studioAssets.id });
        assets[f.operation] = a!.id;
      }
      let j = await this.transition(tx, journal, job, 'completed', 'finaliseur', 'fichiers décodés, déposés, relus et reliés', {
        result: { ...res, assets }, error: null,
      });
      await reglerJob(tx, j, snap, 'livre', { operationsLivrees: fichiers.map((f) => f.operation), coutFournisseurUsdMicros: res.coutUsdMicros ?? null, worker: this.workerId, journal });
      // Qualité posée par le worker (G-B) · composants requis relus dans la version DU job.
      const requis = concerne ? await this.composantsRequis(tx, j) : [];
      const qualite = qualiteAFinalisation({ concerne, requis, constats: sorties.map((s) => s.constat) });
      if (qualite.statut !== 'pending') {
        const v = transitionQualite('completed', 'pending', qualite.statut, 'controle');
        if (!v.ok) throw new Error(v.raison);
        const [q] = await tx.update(J).set({ qualityStatus: qualite.statut, rowVersion: j.rowVersion + 1 })
          .where(and(eq(J.id, j.id), eq(J.rowVersion, j.rowVersion), eq(J.qualityStatus, 'pending'))).returning();
        if (!q) throw new PerteDeCourse('qualité');
        j = q;
        if (qualite.verdict) {
          await tx.insert(schema.studioAuditEvents).values({
            actorId: null, effectiveRole: 'systeme:controle', workspaceId: j.workspaceId, brandId: j.brandId,
            action: 'media.quality.control', targetType: 'studio_job', targetId: j.id, versionBefore: 'pending', versionAfter: qualite.statut,
            reason: qualite.verdict.raison.slice(0, 500), traceId: `wk:${this.workerId}`,
            details: { manquants: qualite.verdict.manquants, nonVerifies: qualite.verdict.nonVerifies, confirmes: qualite.verdict.confirmes, controleVisuel: null },
          });
        }
        journal.push({ t: this.maintenant().toISOString(), type: 'transition', worker: this.workerId, jobId: j.id, de: 'qualite:pending', vers: `qualite:${qualite.statut}`, acteur: 'controle', motif: qualite.motif });
      }
    });
  }

  /** Composants obligatoires du produit épinglé dans la version DU job · jamais reçus du client. */
  private async composantsRequis(tx: TxStudio, job: JobStudio): Promise<string[]> {
    const V = schema.studioProjectVersions;
    const [v] = await tx.select({ content: V.content }).from(V).where(and(eq(V.id, job.projectVersionId), eq(V.workspaceId, job.workspaceId))).limit(1);
    const ref = lireReferenceEpinglee((v?.content as { productRef?: unknown } | undefined)?.productRef);
    return ref ? [...ref.composantsObligatoires] : [];
  }

  /** Décodage réel · une vidéo sans décodeur vidéo n'est JAMAIS décodée « par défaut ». */
  private async decoder(entete: EnteteMedia, octets: Uint8Array): Promise<ResultatDecodage | 'decodeur_absent'> {
    if (entete.mime.startsWith('video/')) return this.decodeur.decoderVideo ? this.decodeur.decoderVideo(octets) : 'decodeur_absent';
    return this.decodeur.decoderImage(octets);
  }

  /** Téléchargements déjà refusés pour ce job (structure ou décodage). */
  private essaisMedia(job: JobStudio): number {
    const e = job.error as { essaisMedia?: unknown } | null;
    return typeof e?.essaisMedia === 'number' ? e.essaisMedia : 0;
  }

  /**
   * Un fichier refusé · retéléchargé au tour suivant tant que la borne n'est
   * pas atteinte, puis `failed` : crédits rendus au client, coût fournisseur
   * réglé (la génération a eu lieu), aucun média livré.
   */
  private async mediaRefuse(job: JobStudio, motif: string): Promise<void> {
    const essais = this.essaisMedia(job) + 1;
    if (decisionMediaRefuse(essais) === 'echec') {
      const res = this.resultat(job);
      await this.terminer(job, 'failed', 'finaliseur', 'facture_sans_livrable', `${motif} · ${essais} téléchargements refusés`, res.coutUsdMicros ?? null);
      return;
    }
    await this.noterEchecPersistance(job, motif, essais);
  }

  private async noterEchecPersistance(job: JobStudio, motif: string, essaisMedia: number = this.essaisMedia(job)): Promise<void> {
    await this.base.update(J).set({
      error: { code: 'PERSISTENCE_FAILED', motif, a: this.maintenant().toISOString(), ...(essaisMedia > 0 ? { essaisMedia } : {}) },
      // Bail rendu court : la reprise de finalisation peut venir d'un autre worker.
      leaseExpiresAt: this.maintenant(), updatedAt: this.maintenant(),
    }).where(and(eq(J.id, job.id), eq(J.state, 'persisting'), eq(J.rowVersion, job.rowVersion)));
    this.noter({ t: this.maintenant().toISOString(), type: 'transition', worker: this.workerId, jobId: job.id, de: 'persisting', vers: 'persisting', acteur: 'finaliseur', motif: `PERSISTENCE_FAILED · ${motif}` });
  }

  /* ───────────────────────────── Annuler ───────────────────────────────── */

  async traiterAnnulation(job: JobStudio): Promise<void> {
    const res = this.resultat(job);
    const t = await this.tentativeCourante(this.base, job.id);
    const preuve = preuveSoumission(t && { providerIdempotencyKey: t.providerIdempotencyKey, providerRequestId: job.providerRequestId ?? t.providerRequestId });
    const d = decisionAnnulation(preuve, { rechercheParCle: this.f.rechercheParCle, resultatRecu: (res.sorties?.length ?? 0) > 0 });
    switch (d) {
      case 'annuler_sans_frais':
        await this.terminer(job, 'cancelled', 'worker', 'annule_sans_frais', 'annulé avant toute soumission', 0);
        return;
      case 'finaliser':
        await this.tx(async (tx, journal) => {
          await this.transition(tx, journal, job, 'persisting', 'worker', 'résultat déjà reçu · conservé sans être appliqué', { result: { ...res, annulationDemandee: true } });
        });
        return;
      case 'demander_annulation_distante': {
        let j = job;
        if (!res.annulationEnvoyee && this.f.annuler) {
          await this.f.annuler(job.providerRequestId!);
          this.noter({ t: this.maintenant().toISOString(), type: 'fournisseur', worker: this.workerId, jobId: job.id, appel: 'annuler', detail: job.providerRequestId! });
          const [m] = await this.base.update(J).set({ result: { ...res, annulationEnvoyee: true }, rowVersion: job.rowVersion + 1 })
            .where(and(eq(J.id, job.id), eq(J.rowVersion, job.rowVersion))).returning();
          if (!m) return;
          j = m;
        }
        const statut = await this.f.statut(j.providerRequestId!);
        await this.appliquerStatut(j.id, statut, 'annulation');
        return;
      }
      case 'chercher_par_cle':
      case 'reconciliation':
        await this.chercherOuReconcilier(job, 'annulation demandée, soumission non prouvée');
        return;
    }
  }

  /* ─────────────────────────── Réconcilier ─────────────────────────────── */

  /**
   * `reconciliation_required` → issue PROUVÉE par le fournisseur ou rien.
   * Sans identifiant ni recherche possible, le job attend une preuve (webhook
   * portant la clé, ou action manuelle) · aucune soumission.
   */
  async reconcilier(job: JobStudio): Promise<void> {
    let requestId = job.providerRequestId;
    if (!requestId && this.f.rechercheParCle && this.f.chercherParCle) {
      const t = await this.tentativeCourante(this.base, job.id);
      requestId = await this.f.chercherParCle(t?.providerIdempotencyKey ?? cleFournisseurDuJob(job.id));
      if (requestId) await this.enregistrerRequete(job.id, requestId);
    }
    // Examiné, sans issue : on le note, pour que la file tourne (les moins
    // récemment examinés passent d'abord). Rien d'autre ne bouge.
    const examine = () => this.base.update(J).set({ heartbeatAt: this.maintenant() }).where(and(eq(J.id, job.id), eq(J.state, 'reconciliation_required')));
    if (!requestId) { await examine(); return; }
    const statut = await this.f.statut(requestId);
    this.noter({ t: this.maintenant().toISOString(), type: 'fournisseur', worker: this.workerId, jobId: job.id, appel: 'statut', detail: `réconciliation · ${statut.etat}` });
    if (statut.etat === 'en_cours' || statut.etat === 'inconnu') { await examine(); return; }
    await this.appliquerStatut(job.id, statut, 'réconciliation');
  }

  /* ───────────────────────────── Webhooks ──────────────────────────────── */

  /**
   * Webhook fournisseur · signature HMAC-SHA256 sur `horodatage.corps`,
   * fenêtre anti-rejeu, puis le statut AUTORITAIRE est relu chez le
   * fournisseur : l'ordre d'arrivée et les doublons ne comptent pas, la
   * machine d'états et la référence unique de règlement font le reste.
   */
  async recevoirWebhook(entetes: Record<string, string | undefined>, corpsBrut: string): Promise<{ status: number; action: string }> {
    if (!this.secret) return { status: 503, action: 'secret absent' };
    const ts = entetes['x-studio-timestamp'];
    const sig = entetes['x-studio-signature'];
    if (!ts || !sig || !/^\d{1,12}$/.test(ts) || !sig.startsWith('v1=')) return { status: 401, action: 'signature absente' };
    const attendue = Buffer.from(createHmac('sha256', this.secret).update(chaineSignee(ts, corpsBrut)).digest('hex'), 'utf8');
    const recue = Buffer.from(sig.slice(3), 'utf8');
    if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return { status: 401, action: 'signature invalide' };
    const fenetre = fenetreWebhook(Number(ts), Math.floor(this.maintenant().getTime() / 1000));
    if (fenetre !== 'ok') return { status: 401, action: `rejeu refusé (${fenetre})` };
    let ev;
    try { ev = lireEvenement(JSON.parse(corpsBrut)); } catch { ev = null; }
    if (!ev) return { status: 400, action: 'événement illisible' };

    let [job] = await this.base.select().from(J).where(eq(J.providerRequestId, ev.requestId)).limit(1);
    if (!job && ev.cle) {
      const [t] = await this.base.select().from(A).where(eq(A.providerIdempotencyKey, ev.cle)).orderBy(desc(A.n)).limit(1);
      if (t) {
        await this.enregistrerRequete(t.jobId, ev.requestId);
        [job] = await this.base.select().from(J).where(eq(J.id, t.jobId)).limit(1);
      }
    }
    const t = this.maintenant().toISOString();
    if (!job) {
      this.noter({ t, type: 'webhook', worker: this.workerId, jobId: null, evenement: `${ev.type}:${ev.id}`, action: 'ignorer', raison: 'requête inconnue' });
      return { status: 202, action: 'ignorer' };
    }
    const d = decisionEvenement(job.state as EtatJob, ev.type);
    this.noter({ t, type: 'webhook', worker: this.workerId, jobId: job.id, evenement: `${ev.type}:${ev.id}`, action: d.action, raison: d.raison });
    let action: string = d.action;
    try {
      if (d.action === 'progression') {
        await this.base.update(J).set({ result: { ...this.resultat(job), progression: ev.progression ?? null } })
          .where(and(eq(J.id, job.id), eq(J.rowVersion, job.rowVersion), eq(J.state, 'running')));
      } else if (d.action !== 'ignorer') {
        const statut = await this.f.statut(ev.requestId);
        if (statut.etat !== 'en_cours') await this.appliquerStatut(job.id, statut, `webhook ${ev.id}`);
      }
    } catch (e) {
      // Un doublon simultané a perdu la course : l'autre l'a appliqué, rien à refaire.
      if (!(e instanceof PerteDeCourse)) throw e;
      action = 'ignorer';
    }
    await this.base.insert(schema.studioAuditEvents).values({
      actorId: null, effectiveRole: 'systeme:webhook', workspaceId: job.workspaceId, brandId: job.brandId,
      action: `webhook.${ev.type}`, targetType: 'studio_job', targetId: job.id, versionBefore: job.state, versionAfter: null,
      reason: `${action} · ${d.raison}`.slice(0, 500), traceId: `wk:${this.workerId}`, details: { evenementId: ev.id, requestId: ev.requestId },
    });
    return { status: 200, action };
  }
}
