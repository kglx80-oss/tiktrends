import 'server-only';
import { and, eq, isNotNull, isNull, ne, notInArray, or } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { falFromEnv, falGetVideo, higgsfieldFromEnv, hfGetJob, isFalJob } from '@tiktrends/integrations';
import { decisionSuiviVideo, type StatutSuiviVideo } from '@tiktrends/core';
import { refundCredits } from './credits';

/**
 * Suivi des VIDÉOS HISTORIQUES encore en cours (ancien studio vidéo, retiré le
 * 10/10) · appelé par la tâche planifiée `/api/cron/videos-historiques`.
 *
 * Avant, seul l'écran `/studio/video` interrogeait le fournisseur : une vidéo
 * lancée puis laissée restait « en cours », sans adresse ni remboursement. Ici,
 * pour TOUS les espaces, sans session :
 *  · vidéo prête · `completed` et son adresse (jamais réécrite si déjà terminée) ;
 *  · échec, ou attente au-delà de 15 min · `failed` puis remboursement de SON
 *    coût, UNE fois : la bascule est conditionnelle et seule l'instruction qui
 *    l'a faite rembourse (deux passages simultanés ne remboursent pas deux fois) ;
 *  · fournisseur non configuré ou injoignable · rien n'est écrit, on réessaie.
 * Aucune nouvelle génération, aucune dépense : on ne fait que lire un statut.
 */

export interface SuiviVideo { status: StatutSuiviVideo; videoUrl?: string | null; error?: string | null }

export interface DependancesSuiviVideo {
  /** Statut d'un job chez le fournisseur · `null` si le fournisseur n'est pas configuré. */
  lire?: (jobId: string) => Promise<SuiviVideo | null>;
  maintenant?: Date;
  rembourser?: (workspaceId: string, credits: number, raison: string, refId: string) => Promise<void>;
}

export interface BilanSuiviVideo { vues: number; terminees: number; echouees: number; remboursees: number; enAttente: number; injoignables: number }

/** Plafond d'un passage · le suivant reprend le reste. */
export const VIDEOS_PAR_PASSAGE = 100;

async function lireFournisseur(jobId: string): Promise<SuiviVideo | null> {
  if (isFalJob(jobId)) {
    const fal = falFromEnv();
    return fal ? falGetVideo(fal, jobId) : null;
  }
  const hf = higgsfieldFromEnv();
  return hf ? hfGetJob(hf, jobId) : null;
}

export async function reconcilierVideosHistoriques(deps: DependancesSuiviVideo = {}): Promise<BilanSuiviVideo> {
  const bilan: BilanSuiviVideo = { vues: 0, terminees: 0, echouees: 0, remboursees: 0, enAttente: 0, injoignables: 0 };
  if (!db) return bilan;
  const lire = deps.lire ?? lireFournisseur;
  const rembourser = deps.rembourser ?? ((ws, n, raison, ref) => refundCredits(ws, n, raison, ref));
  const maintenant = (deps.maintenant ?? new Date()).getTime();
  const G = schema.generations;
  const enCours = or(isNull(G.status), notInArray(G.status, ['completed', 'failed', 'archived']))!;
  const lignes = await db.select({ id: G.id, jobId: G.jobId, createdAt: G.createdAt, workspaceId: schema.brands.workspaceId })
    .from(G).innerJoin(schema.brands, eq(G.brandId, schema.brands.id))
    .where(and(eq(G.kind, 'video'), isNotNull(G.jobId), enCours))
    .limit(VIDEOS_PAR_PASSAGE);

  for (const l of lignes) {
    bilan.vues += 1;
    let job: SuiviVideo | null;
    try { job = await lire(l.jobId!); } catch { job = null; }
    if (!job) { bilan.injoignables += 1; continue; }
    const d = decisionSuiviVideo(job, maintenant - new Date(l.createdAt).getTime());
    if (d.action === 'attendre') { bilan.enAttente += 1; continue; }
    if (d.action === 'terminer') {
      const ok = await db.update(G).set({ status: 'completed', assetUrls: d.url ? [d.url] : [] })
        .where(and(eq(G.id, l.id), enCours)).returning({ id: G.id });
      if (ok.length) bilan.terminees += 1;
      continue;
    }
    const basculees = await db.update(G).set({ status: 'failed', output: { error: d.motif } })
      .where(and(eq(G.id, l.id), or(isNull(G.status), and(ne(G.status, 'failed'), ne(G.status, 'completed'), ne(G.status, 'archived')))))
      .returning({ cout: G.creditsCost });
    if (!basculees.length) continue;
    bilan.echouees += 1;
    const cout = basculees[0]!.cout ?? 0;
    if (cout > 0) {
      await rembourser(l.workspaceId, cout, 'Studio · vidéo échouée (remboursement)', l.id);
      bilan.remboursees += 1;
    }
  }
  return bilan;
}
