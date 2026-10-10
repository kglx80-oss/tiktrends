import 'server-only';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { assemblerVideoFfmpeg, type EntreeAssemblage, type ResultatAssemblage } from '@tiktrends/integrations';
import {
  aPermissionEspace, erreurStudio, planRenduFinal, ORIGINE_ARCHIVE_EXPORT,
  type ContenuVersion, type ErreurStudio, type PlanRenduFinal, type StockageStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { lireProjet, lireVersion, lireAsset } from '../depot';
import { ajouterAudit } from '../audit';
import { lireMediaDansPortee, lecteurMedias, type LecteurMedias } from '../rendu/medias';
import { stockageExport } from '../export/export';
import { ROUTE_APERCU_MEDIA } from '../editeur/apercus';
import { mediasProduits } from './lecture';

/**
 * Studios · VIDÉO FINALE d'un projet · assemblage des clips animés des plans.
 *
 * Commande EXPLICITE, `studio.export` relue, aucun fournisseur payant (0 $,
 * 0 crédit) :
 *  1. version courante lue dans la portée ; plan pur `planRenduFinal` (chaque
 *     plan a son clip VALIDE pour cette version, musique relue) · ce qui n'est
 *     pas inclus (voix, texte écran, sous-titres) est dit, jamais simulé ;
 *  2. chaque clip relu dans la portée (`lireMediaDansPortee` : stocké, octets,
 *     empreinte, type réel MP4) et dans la MARQUE du projet ;
 *  3. assemblage ffmpeg, fichier produit RELU par ffprobe (`assemblerVideoFfmpeg`) ;
 *  4. dépôt dans le stockage des médias studio, RELU, empreinte comparée ;
 *     ligne `studio_assets` (origine `render`, durée, dimensions, provenance
 *     dans `rights`) et audit `project.export.video` dans UNE transaction.
 * Un seul assemblage à la fois par processus (`ASSEMBLAGES_SIMULTANES_MAX`).
 * Sans stockage configuré : refus dit (une vidéo non conservée ne pourrait pas
 * être servie).
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

export interface VideoFinale { assetId: string; url: string; dureeMs: number; largeur: number; hauteur: number; nonInclus: string[] }

export interface DependancesRendu {
  lecteur?: LecteurMedias;
  assembler?: (e: EntreeAssemblage) => Promise<ResultatAssemblage>;
  stockage?: StockageStudio | null;
}

export const ACTION_AUDIT_VIDEO_FINALE = 'project.export.video';

/**
 * Un seul assemblage à la fois dans ce processus · ffmpeg occupe tous les cœurs
 * du serveur, qui fait aussi tourner les workers. Le suivant est refusé et dit,
 * jamais mis en attente derrière une requête qui peut durer une minute.
 */
export const ASSEMBLAGES_SIMULTANES_MAX = 1;
let assemblagesEnCours = 0;

const sha256 = (o: Uint8Array) => createHash('sha256').update(o).digest('hex');

/** Le plan de la vidéo finale de la version courante · lecture seule (aussi servie à l'écran). */
export async function planVideoFinale(ctx: ContexteStudio, projectId: unknown, lecteur: LecteurMedias = lecteurMedias()):
  Promise<Resultat<{ plan: PlanRenduFinal; projet: { id: string; brandId: string; workspaceId: string }; versionId: string; musique: Uint8Array | null }> | (ErreurStudio & { violations?: Array<{ chemin: string; raison: string }> })> {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  const projet = p.projet;
  if (!projet.currentVersionId) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const v = await lireVersion(ctx, projet.currentVersionId);
  if (!v.ok) return v;
  const contenu = v.version.content as ContenuVersion;
  const { valides, assets } = await mediasProduits(db, { workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id }, contenu);
  const clips: Record<string, string> = {};
  for (const sid of contenu.shots.order) {
    const op = `clip:${sid}`;
    const a = assets.get(op);
    if (a && valides.has(op)) clips[sid] = a;
  }
  // Musique · relue maintenant (portée, marque, stockée, empreinte), sinon dite introuvable.
  let musique: { assetId: string; gainDb: number } | null | 'introuvable' = null;
  let octetsMusique: Uint8Array | null = null;
  const m = contenu.timeline?.music ?? null;
  if (m) {
    const a = await lireAsset(ctx, m.assetId);
    const octets = a.ok && a.asset.brandId === projet.brandId && a.asset.storageState === 'stored' && a.asset.mime.startsWith('audio/') ? await lecteur.lire(a.asset) : null;
    if (a.ok && octets && octets.length === a.asset.bytes && sha256(octets) === a.asset.sha256) {
      musique = { assetId: m.assetId, gainDb: m.gainDb };
      octetsMusique = octets;
    } else musique = 'introuvable';
  }
  const r = planRenduFinal({ contenu, clips, musique });
  if (!r.ok) {
    return erreurStudio('INVALID_SCHEMA', {
      traceId: ctx.traceId, targetIds: r.violations.map((x) => x.cible),
      violations: r.violations.map((x) => ({ chemin: x.cible, raison: x.raison })),
      message: r.violations.map((x) => x.raison).join(' '),
    });
  }
  return { ok: true, plan: r.plan, projet: { id: projet.id, brandId: projet.brandId, workspaceId: projet.workspaceId }, versionId: v.version.id, musique: octetsMusique };
}

export async function assemblerVideoFinalePour(ctx: ContexteStudio, e: { projectId: unknown }, deps: DependancesRendu = {}): Promise<Resultat<{ video: VideoFinale }>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.export')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId, message: 'Ton rôle ne permet pas d’exporter.' });
  const lecteur = deps.lecteur ?? lecteurMedias();
  const pv = await planVideoFinale(ctx, e.projectId, lecteur);
  if (!pv.ok) return pv;
  const { plan, projet, versionId } = pv;

  // Chaque clip relu dans la portée et la marque du projet · un seul manquant ⇒ rien n'est assemblé.
  const segments: EntreeAssemblage['segments'] = [];
  for (const s of plan.segments) {
    const m = await lireMediaDansPortee(ctx, s.assetId, lecteur);
    if (!m.ok || m.asset.brandId !== projet.brandId || m.mime !== 'video/mp4') {
      return erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, targetIds: [`clip:${s.shotId}`], message: `Le clip du plan ${s.rang} est illisible · anime-le à nouveau puis réessaie. Rien n’a été produit.` });
    }
    segments.push({ octets: m.octets, dureeMs: s.dureeMs });
  }

  const stockage = deps.stockage !== undefined ? deps.stockage : stockageExport();
  if (!stockage) return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: 'Stockage des médias non configuré · la vidéo finale ne pourrait pas être conservée ni servie. Rien n’a été produit.' });

  if (assemblagesEnCours >= ASSEMBLAGES_SIMULTANES_MAX) {
    return erreurStudio('RATE_LIMITED', { traceId: ctx.traceId, message: 'Une vidéo finale est déjà en cours d’assemblage sur le serveur · réessaie dans une minute. Rien n’a été produit.' });
  }
  assemblagesEnCours += 1;
  let r: ResultatAssemblage;
  try {
    r = await (deps.assembler ?? ((x) => assemblerVideoFfmpeg(x)))({
      segments, musique: pv.musique && plan.musique ? { octets: pv.musique, gainDb: plan.musique.gainDb } : null,
      largeur: plan.largeur, hauteur: plan.hauteur, fps: plan.fps,
    });
  } finally {
    assemblagesEnCours -= 1;
  }
  if (!r.ok) {
    console.error(`[studios] ${ctx.traceId} vidéo finale · ${r.cause} · ${r.motif}`);
    return erreurStudio(r.cause === 'binaire' ? 'UNSUPPORTED_CAPABILITY' : 'INVALID_SCHEMA', { traceId: ctx.traceId, message: `Assemblage impossible · ${r.motif}. Rien n’a été conservé.` });
  }

  const empreinte = sha256(r.octets);
  const cle = `studios/${projet.workspaceId}/${projet.id}/video-finale-${versionId}-${empreinte.slice(0, 16)}.mp4`;
  try {
    await stockage.deposer(cle, r.octets, 'video/mp4');
    const relu = await stockage.relire(cle);
    if (!relu || sha256(relu) !== empreinte) throw new Error('relecture différente du dépôt');
  } catch (err) {
    console.error(`[studios] ${ctx.traceId} vidéo finale non conservée · ${err instanceof Error ? err.message : 'dépôt refusé'}`);
    return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: 'La vidéo a été assemblée mais n’a pas pu être conservée · réessaie dans un instant.' });
  }

  const S = schema.studioAssets;
  const id = await db.transaction(async (tx) => {
    const [n] = await tx.insert(S).values({
      workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id, storageKey: cle, mime: 'video/mp4',
      bytes: r.octets.length, width: r.mesure.largeur, height: r.mesure.hauteur, durationMs: r.mesure.dureeMs, sha256: empreinte,
      origin: ORIGINE_ARCHIVE_EXPORT, rights: { videoFinale: { versionId, clips: plan.segments.map((x) => x.assetId), musique: plan.musique?.assetId ?? null, nonInclus: plan.nonInclus } },
      parentAssetId: null, storageState: 'stored', createdBy: ctx.userId,
    }).onConflictDoNothing({ target: [S.workspaceId, S.storageKey] }).returning({ id: S.id });
    const assetId = n?.id ?? (await tx.select({ id: S.id }).from(S).where(and(eq(S.workspaceId, projet.workspaceId), eq(S.storageKey, cle))).limit(1))[0]?.id;
    if (!assetId) throw new Error('ligne de la vidéo finale introuvable');
    await ajouterAudit(tx, ctx, {
      action: ACTION_AUDIT_VIDEO_FINALE, brandId: projet.brandId, targetType: 'studio_project', targetId: projet.id,
      versionBefore: versionId, versionAfter: versionId, reason: 'vidéo finale assemblée',
      details: { assetId, sha256: empreinte, dureeMs: r.mesure.dureeMs, largeur: r.mesure.largeur, hauteur: r.mesure.hauteur, plans: plan.segments.length, nonInclus: plan.nonInclus },
    });
    return assetId;
  });
  return { ok: true, video: { assetId: id, url: ROUTE_APERCU_MEDIA(id), dureeMs: r.mesure.dureeMs, largeur: r.mesure.largeur, hauteur: r.mesure.hauteur, nonInclus: plan.nonInclus } };
}
