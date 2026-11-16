import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schema, eq, and, sql, asc } from '@tiktrends/db';
import {
  lireSnapshotJob, estParametresClip, planDeClip, controleParoleApprouve, repriseParoleApprouvee, controlerParole, suiteControleParole,
  transitionQualite, estErreurCertaine, motsPourJournal, GRILLE_STUDIO, ACTION_AUDIT_CONTROLE_PAROLE,
  type ContenuVersion, type StockageStudio, type TranscriptionLue,
} from '@tiktrends/core';
import type { DemandeTranscription } from '@tiktrends/integrations';
import type { BaseStudio, JobStudio } from './types';

/**
 * Studios · contrôle de la PAROLE de chaque prise parlée livrée, dans le
 * worker, après la livraison (`completed`).
 *
 * Une prise est contrôlée quand, et seulement quand :
 *  · son job est un clip (`studio_clip/1`) livré, qualité `pending` ;
 *  · son devis APPROUVÉ porte la ligne « contrôle de la parole »
 *    (`controleParoleApprouve`) · sans elle, 0 appel, 0 dépense ;
 *  · son plan, dans la version DU job, a une réplique et un mode de parole ;
 *  · le fichier livré a une piste audio (une prise muette n'est pas
 *    transcrite : « sans objet », rien n'est dépensé).
 *
 * La transcription (Scribe v2, `TranscripteurFal`, sous la barrière) est
 * comparée à la réplique par la règle pure `controlerParole` ; la suite par
 * `suiteControleParole` (au plus UNE reprise, seulement si elle est dans le
 * devis approuvé, sinon proposée avec son prix). Écart ⇒ qualité
 * `requires_review` (le plan est « à reprendre ») et la raison au journal.
 *
 * Chaque issue, même un refus, écrit UNE ligne d'audit
 * `media.speech.control` : la prise n'est jamais reprise par ce tour (aucune
 * seconde transcription d'une même prise, la ligne de dépense le garantit
 * aussi). Les mots horodatés y sont conservés · ils posent les sous-titres de
 * la vidéo finale (« sur les mots vraiment dits »). Aucune migration.
 */

export const ACTION_CONTROLE_PAROLE = ACTION_AUDIT_CONTROLE_PAROLE;
/** Prises examinées par tour · politique, pas une mesure (une transcription dure quelques secondes). */
export const PRISES_PAR_TOUR = 5;
/** Mots conservés au journal · une prise de 90 s parlée en compte quelques centaines. */
const MOTS_CONSERVES_MAX = 600;

export interface MesurePrise { dureeMs: number; audio: boolean }

export interface DependancesControleParole {
  base: BaseStudio;
  stockage: Pick<StockageStudio, 'relire'>;
  transcrire: (d: DemandeTranscription) => Promise<{ transcription: TranscriptionLue; reserveUsdMicros: number }>;
  /** Adresse signée temporaire d'un objet stocké (bucket privé), transmise au fournisseur. */
  adresse: (cle: string) => string;
  /** Mesure de la prise · défaut ffprobe. `null` = illisible. */
  mesurer?: (octets: Uint8Array) => Promise<MesurePrise | null>;
  horloge?: () => Date;
  journal?: (m: string) => void;
}

/* ─────────────────────────── Mesure (ffprobe) ───────────────────────────── */

/** Durée et piste audio d'une prise MP4 · ffprobe, sans shell, délai borné. */
export async function mesurerPriseFfprobe(octets: Uint8Array, o: { ffprobe?: string; delaiMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<MesurePrise | null> {
  const dossier = await mkdtemp(join(tmpdir(), 'tt-prise-'));
  try {
    const f = join(dossier, 'prise.mp4');
    await writeFile(f, octets, { mode: 0o600 });
    const sortie = await new Promise<string | null>((resolve) => {
      execFile(o.ffprobe ?? 'ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'mp4', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', f],
        { timeout: o.delaiMs ?? 30_000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, env: o.env ?? process.env, encoding: 'utf8' },
        (err, stdout) => resolve(err ? null : String(stdout)));
    });
    if (!sortie) return null;
    const info = JSON.parse(sortie) as { streams?: Array<{ codec_type?: string }>; format?: { duration?: string } };
    const dureeMs = Math.round(Number(info.format?.duration ?? 'NaN') * 1000);
    if (!Number.isFinite(dureeMs) || dureeMs <= 0) return null;
    return { dureeMs, audio: (info.streams ?? []).some((s) => s.codec_type === 'audio') };
  } catch {
    return null;
  } finally {
    await rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
}

/* ─────────────────────────── Tour de contrôle ───────────────────────────── */

const J = schema.studioJobs;
const AU = schema.studioAuditEvents;

interface Issue {
  suite: 'conforme' | 'reprendre' | 'proposer_reprise' | 'revue' | 'sans_objet' | 'non_controle';
  raison: string;
  details: Record<string, unknown>;
  aReprendre: boolean;
}

/** Les prises à contrôler · clips livrés, qualité en attente, ligne approuvée, jamais contrôlés. */
async function candidats(base: BaseStudio, limite: number): Promise<JobStudio[]> {
  return base.select().from(J).where(and(
    eq(J.state, 'completed'), eq(J.qualityStatus, 'pending'),
    sql`${J.snapshot}->'lignes' @> '[{"operation":"controle:parole","profil":"controle_parole"}]'::jsonb`,
    sql`not exists (select 1 from ${AU} a where a.action = ${ACTION_CONTROLE_PAROLE} and a.target_type = 'studio_job' and a.target_id = ${J.id}::text)`,
  )).orderBy(asc(J.updatedAt)).limit(limite);
}

/** Reprises déjà faites pour ce plan · prises précédentes du même plan refusées par le contrôle. */
async function reprisesFaites(base: BaseStudio, job: JobStudio, operation: string): Promise<number> {
  const [r] = await base.select({ n: sql<number>`count(*)::int` }).from(AU).where(and(
    eq(AU.action, ACTION_CONTROLE_PAROLE), eq(AU.targetType, 'studio_job'), eq(AU.workspaceId, job.workspaceId), eq(AU.brandId, job.brandId),
    sql`${AU.details}->>'projectId' = ${job.projectId}`, sql`${AU.details}->>'operation' = ${operation}`, sql`${AU.details}->>'conforme' = 'false'`,
    sql`${AU.targetId} <> ${job.id}`,
  ));
  return r?.n ?? 0;
}

async function examiner(d: DependancesControleParole, job: JobStudio): Promise<Issue> {
  const snap = lireSnapshotJob(job.snapshot);
  const sansObjet = (raison: string, details: Record<string, unknown> = {}): Issue => ({ suite: 'sans_objet', raison, details, aReprendre: false });
  const nonControle = (raison: string, details: Record<string, unknown> = {}): Issue => ({ suite: 'non_controle', raison, details, aReprendre: false });
  if (!snap || !estParametresClip(snap.parametres)) return sansObjet('job sans prise vidéo');
  const ligne = controleParoleApprouve(snap.lignes);
  if (!ligne) return sansObjet('aucune ligne « contrôle de la parole » approuvée · rien n’est transcrit');
  const operation = (snap.parametres as { operation?: unknown }).operation;
  const shotId = typeof operation === 'string' ? planDeClip(operation) : null;
  if (!shotId || typeof operation !== 'string') return sansObjet('opération de clip illisible');
  const assetId = (job.result as { assets?: Record<string, string> } | null)?.assets?.[operation];
  const base = { projectId: job.projectId, operation, shotId, assetId: assetId ?? null };

  const V = schema.studioProjectVersions;
  const [v] = await d.base.select({ content: V.content }).from(V).where(and(eq(V.id, job.projectVersionId), eq(V.workspaceId, job.workspaceId))).limit(1);
  const plan = (v?.content as ContenuVersion | undefined)?.shots.byId[shotId];
  if (!plan || plan.speechMode === 'none' || !plan.narration.trim()) return sansObjet('plan sans réplique à dire dans la version du job', base);

  const S = schema.studioAssets;
  const [a] = assetId ? await d.base.select({ storageKey: S.storageKey, mime: S.mime }).from(S)
    .where(and(eq(S.id, assetId), eq(S.workspaceId, job.workspaceId), eq(S.brandId, job.brandId), eq(S.storageState, 'stored'))).limit(1) : [];
  if (!a || a.mime !== 'video/mp4' || a.storageKey.startsWith('simule/')) return nonControle('prise livrée introuvable ou non stockée', base);
  let octets: Uint8Array | null;
  try { octets = await d.stockage.relire(a.storageKey); } catch { octets = null; }
  if (!octets) return nonControle('prise livrée illisible dans le stockage', base);
  const mesure = await (d.mesurer ?? ((o) => mesurerPriseFfprobe(o)))(octets);
  if (!mesure) return nonControle('prise livrée illisible (durée inconnue)', base);
  if (!mesure.audio) return sansObjet('prise muette · aucune piste audio, rien n’est transcrit', { ...base, dureeMs: mesure.dureeMs });

  let t: { transcription: TranscriptionLue; reserveUsdMicros: number };
  try {
    t = await d.transcrire({
      workspaceId: job.workspaceId, jobId: job.id, operation, essai: 1, audioUrl: d.adresse(a.storageKey),
      dureeMs: mesure.dureeMs, approuveUsdMicros: ligne.usdMicros,
    });
  } catch (e) {
    const certain = estErreurCertaine(e);
    return nonControle(`transcription impossible · ${(e as Error).message.slice(0, 200)}`, { ...base, dureeMs: mesure.dureeMs, issueFinanciere: certain ? 'aucun_frais' : 'incertaine' });
  }

  const verdict = controlerParole(plan.narration, t.transcription.texte);
  const faites = await reprisesFaites(d.base, job, operation);
  const anim = GRILLE_STUDIO.animation;
  const s = suiteControleParole({
    verdict, reprisesFaites: faites, repriseApprouvee: repriseParoleApprouvee(snap.lignes, operation),
    prixReprise: { credits: anim.credits ?? 0, usdMicros: (anim.usdMicros ?? 0) + ligne.usdMicros },
  });
  return {
    suite: s.suite, raison: s.raison, aReprendre: !verdict.conforme,
    details: {
      ...base, conforme: verdict.conforme, ecarts: verdict.ecarts, manquants: verdict.manquants, ajoutes: verdict.ajoutes, remplaces: verdict.remplaces,
      reprisesFaites: faites, ...(s.suite === 'proposer_reprise' ? { prixReprise: s.prix } : {}),
      dureeMs: mesure.dureeMs, reserveUsdMicros: t.reserveUsdMicros, langue: t.transcription.langue,
      // Les mots VRAIMENT dits, horodatés dans la prise · source des sous-titres.
      mots: motsPourJournal(t.transcription.mots, MOTS_CONSERVES_MAX),
    },
  };
}

/**
 * Un tour · au plus `PRISES_PAR_TOUR` prises. Rend ce qui a été écrit (pour
 * le journal et les bancs d'essai).
 */
export async function controlerParolesEnAttente(d: DependancesControleParole, limite = PRISES_PAR_TOUR): Promise<Array<{ jobId: string; suite: Issue['suite']; raison: string }>> {
  const out: Array<{ jobId: string; suite: Issue['suite']; raison: string }> = [];
  for (const job of await candidats(d.base, limite)) {
    const issue = await examiner(d, job);
    const ecrit = await d.base.transaction(async (tx) => {
      // Relu sous verrou · un autre worker a pu le contrôler entre-temps.
      const [j] = await tx.select().from(J).where(eq(J.id, job.id)).for('update').limit(1);
      if (!j) return false;
      const [deja] = await tx.select({ id: AU.id }).from(AU).where(and(eq(AU.action, ACTION_CONTROLE_PAROLE), eq(AU.targetType, 'studio_job'), eq(AU.targetId, j.id))).limit(1);
      if (deja) return false;
      let apres: string = j.qualityStatus;
      if (issue.aReprendre && j.state === 'completed' && j.qualityStatus === 'pending') {
        const t = transitionQualite('completed', 'pending', 'requires_review', 'controle');
        if (!t.ok) throw new Error(t.raison);
        await tx.update(J).set({ qualityStatus: 'requires_review', rowVersion: j.rowVersion + 1, updatedAt: d.horloge?.() ?? new Date() })
          .where(and(eq(J.id, j.id), eq(J.rowVersion, j.rowVersion)));
        apres = 'requires_review';
      }
      await tx.insert(AU).values({
        actorId: null, effectiveRole: 'systeme:controle', workspaceId: j.workspaceId, brandId: j.brandId,
        action: ACTION_AUDIT_CONTROLE_PAROLE, targetType: 'studio_job', targetId: j.id, versionBefore: j.qualityStatus, versionAfter: apres,
        reason: (issue.raison || 'parole conforme à la réplique validée').slice(0, 500), traceId: `parole:${j.id}`,
        details: { suite: issue.suite, ...issue.details },
      });
      return true;
    });
    if (ecrit) {
      out.push({ jobId: job.id, suite: issue.suite, raison: issue.raison });
      d.journal?.(`[studios] contrôle de la parole · job ${job.id} · ${issue.suite}${issue.raison ? ` · ${issue.raison}` : ''}`);
    }
  }
  return out;
}
