import 'server-only';
import { and, desc, eq, gt, inArray, isNull, like } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  aPermissionEspace, disponibiliteVideo, jugeSortiesValides, segmentsPlans, dureePlanMs, estSansTexte, estBriefCanonique, lireSnapshotJob,
  prixImage, raisonEchec, libelleQualiteImage, planDeKeyframe, planDeClip, formatVideo, LIBELLES_ETAT_IMAGE, GRILLE_STUDIO, DUREE_CLIP_S, planRenduFinal, ORIGINE_ARCHIVE_EXPORT,
  type ContenuVersion, type DisponibiliteVideo, type EtatJob, type LigneDevis, type StatutQualite, type VerdictConsignePlan,
  type ConsignePlanPersistee, type ErreurStudio, erreurStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { lireProjet, lireVersion, estUuid } from '../depot';
import { etatJob } from '../execution/commandes';
import { ROUTE_APERCU_MEDIA } from '../editeur/apercus';
import { verifierConsignePlan } from '../image/plans';
import { consignesCompileesSur } from './consigne';
import { lireCapaciteVideo } from '../execution/capacite-video';
import type { ExecStudio } from '../execution/types';

/**
 * Studios · L6-A · l'écran vidéo, LECTURE PURE (aucune écriture) :
 * storyboard, timeline, médias produits encore valides (par empreinte du
 * graphe), consignes des images clés et leur verdict, devis ouverts, jobs.
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

export interface DependancesLectureVideo {
  maintenant: Date;
  releasePubliee: boolean;
  fournisseurTexte: boolean;
  plafondAtteint: boolean;
  fournisseurImage: boolean;
  coutTexteUsd: number;
}

export interface ConsigneVuePlan { runId: string; instruction: string; interdits: string[]; composants: string[]; compileeLe: string }

export interface KeyframeVue {
  etat: 'valide' | 'obsolete' | 'a_produire';
  media: { assetId: string; url: string } | null;
  retenue: (ConsigneVuePlan & { verdict: VerdictConsignePlan }) | null;
  enAttente: ConsigneVuePlan | null;
  devis: { id: string; inputHash: string; credits: number; usdMicros: number; expiresAt: string } | null;
}

/** Le clip animé d'un plan · état de la sortie, média, devis ouvert, et si son image clé permet de l'animer. */
export interface ClipVue {
  etat: 'valide' | 'obsolete' | 'a_produire';
  media: { assetId: string; url: string } | null;
  /** L'image clé du plan est produite et valide pour cette version · condition pour animer. */
  keyframePrete: boolean;
  devis: { id: string; inputHash: string; credits: number; usdMicros: number; expiresAt: string } | null;
}

/** La vidéo finale · assemblable maintenant ou pourquoi pas, ce qu'elle n'inclura pas, la dernière produite. */
export interface VideoFinaleVue {
  possible: boolean;
  raison: string;
  nonInclus: string[];
  dureeMs: number;
  derniere: { assetId: string; url: string; dureeMs: number | null; creeLe: string } | null;
}

export interface JobVideoVue {
  id: string; operation: string; etat: EtatJob; libelleEtat: string; message: string; raisonEchec: string | null;
  qualite: StatutQualite; libelleQualite: string; creditsReserves: number; creeLe: string;
}

export interface VueVideo {
  projet: { id: string; titre: string };
  version: { id: string; n: number };
  contenu: ContenuVersion;
  briefPresent: boolean;
  sansTexte: boolean;
  format: { largeur: number; hauteur: number; libelle: string; depuisBrief: boolean };
  segments: Array<{ shotId: string; rang: number; debutMs: number; dureeMs: number; estimee: boolean }>;
  dureeTotaleMs: number;
  keyframes: Record<string, KeyframeVue>;
  clips: Record<string, ClipVue>;
  mediasValides: string[];
  musiques: Array<{ assetId: string; libelle: string }>;
  disponibilite: DisponibiliteVideo;
  coutTexteUsd: number;
  prix: { credits: number; usdMicros: number };
  /** Forfait d'un clip (grille studio · `FIXED_COSTS.fal_video`), durée de base. */
  prixClip: { credits: number; usdMicros: number; dureeS: number };
  videoFinale: VideoFinaleVue;
  jobs: JobVideoVue[];
}

const JOBS_MAX = 8;

const vueConsigne = (c: ConsignePlanPersistee): ConsigneVuePlan => ({
  runId: c.runId, instruction: c.consigne.generationInstruction, interdits: [...c.consigne.negativeConstraints], composants: [...c.consigne.protectedComponents], compileeLe: c.compileeLe,
});

/**
 * Les sorties produites (jobs `completed` du projet, toutes versions) et la
 * version pour laquelle chacune a été faite · `jugeSortiesValides` dit celles qui
 * valent encore pour `courante`.
 */
export async function mediasProduits(ex: ExecStudio, p: { workspaceId: string; brandId: string; projectId: string }, courante: ContenuVersion):
  Promise<{ valides: Set<string>; produites: Set<string>; assets: Map<string, string> }> {
  const J = schema.studioJobs;
  const jobs = await ex.select({ versionId: J.projectVersionId, result: J.result }).from(J)
    .where(and(eq(J.workspaceId, p.workspaceId), eq(J.brandId, p.brandId), eq(J.projectId, p.projectId), eq(J.state, 'completed')))
    .orderBy(desc(J.createdAt)).limit(200);
  const versions = [...new Set(jobs.map((j) => j.versionId))];
  const V = schema.studioProjectVersions;
  const contenus = new Map<string, ContenuVersion>();
  if (versions.length) {
    for (const v of await ex.select({ id: V.id, content: V.content }).from(V).where(and(inArray(V.id, versions), eq(V.projectId, p.projectId), eq(V.workspaceId, p.workspaceId)))) {
      contenus.set(v.id, v.content as ContenuVersion);
    }
  }
  const produites = new Set<string>();
  // Le média retenu pour une sortie valide · le plus récent dont l'empreinte vaut pour la version courante.
  const assets = new Map<string, string>();
  // L8-C · un seul juge pour toute la lecture : graphes construits une fois (courante, puis chaque version source).
  let juge: ReturnType<typeof jugeSortiesValides> | null = null;
  for (const j of jobs) {
    const source = contenus.get(j.versionId);
    if (!source) continue;
    for (const [op, asset] of Object.entries((j.result as { assets?: Record<string, string> } | null)?.assets ?? {})) {
      produites.add(op);
      if (!assets.has(op) && (juge ??= jugeSortiesValides(courante))(op, source)) assets.set(op, asset);
    }
  }
  return { valides: new Set(assets.keys()), produites, assets };
}

const estDevisClip = (lignes: unknown): string | null => {
  if (!Array.isArray(lignes)) return null;
  const plans = (lignes as LigneDevis[]).map((l) => planDeClip(String(l?.operation ?? ''))).filter((x): x is string => !!x);
  return plans.length === 1 ? plans[0]! : null;
};

const estDevisKeyframe = (lignes: unknown): string | null => {
  if (!Array.isArray(lignes)) return null;
  const plans = (lignes as LigneDevis[]).map((l) => planDeKeyframe(String(l?.operation ?? ''))).filter((x): x is string => !!x);
  return plans.length === 1 ? plans[0]! : null;
};

export async function lireVideoPour(ctx: ContexteStudio, projectId: unknown, o: DependancesLectureVideo): Promise<Resultat<{ vue: VueVideo }>> {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  const projet = p.projet;
  if (!projet.currentVersionId) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const v = await lireVersion(ctx, projet.currentVersionId);
  if (!v.ok) return v;
  const contenu = v.version.content as ContenuVersion;
  const portee = { workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id };

  const { valides, produites, assets } = await mediasProduits(db, portee, contenu);
  const compilees = await consignesCompileesSur(db, portee, v.version.id);

  // Devis d'image clé encore valides de la version courante, pas encore approuvés.
  const Q = schema.studioQuotes;
  const AP = schema.studioApprovals;
  const devisLignes = (await db.select({ q: Q }).from(Q).leftJoin(AP, eq(AP.quoteId, Q.id)).where(and(
    eq(Q.workspaceId, projet.workspaceId), eq(Q.brandId, projet.brandId), eq(Q.projectId, projet.id),
    eq(Q.projectVersionId, v.version.id), gt(Q.expiresAt, o.maintenant), isNull(AP.id),
  )).orderBy(desc(Q.createdAt)).limit(40)).map((x) => x.q);

  const keyframes: Record<string, KeyframeVue> = {};
  for (const sid of contenu.shots.order) {
    const op = `keyframe:${sid}`;
    const etat = await verifierConsignePlan(db, portee, contenu, sid);
    const enAttente = compilees.get(sid);
    const d = devisLignes.find((q) => estDevisKeyframe(q.lines) === sid);
    const asset = assets.get(op);
    keyframes[sid] = {
      etat: valides.has(op) ? 'valide' : produites.has(op) ? 'obsolete' : 'a_produire',
      media: asset && estUuid(asset) ? { assetId: asset, url: ROUTE_APERCU_MEDIA(asset) } : null,
      retenue: etat.consigne ? { ...vueConsigne(etat.consigne), verdict: etat.verdict } : null,
      enAttente: enAttente && enAttente.empreinte !== etat.empreinte ? vueConsigne(enAttente.consigne) : null,
      devis: d ? { id: d.id, inputHash: d.inputHash, credits: d.maximumCredits, usdMicros: Number(d.maximumUsdMicros), expiresAt: d.expiresAt.toISOString() } : null,
    };
  }

  // Clips animés · un par plan, partis de l'image clé valide du plan.
  const clips: Record<string, ClipVue> = {};
  for (const sid of contenu.shots.order) {
    const op = `clip:${sid}`;
    const asset = assets.get(op);
    const d = devisLignes.find((q) => estDevisClip(q.lines) === sid);
    clips[sid] = {
      etat: valides.has(op) ? 'valide' : produites.has(op) ? 'obsolete' : 'a_produire',
      media: asset && estUuid(asset) ? { assetId: asset, url: ROUTE_APERCU_MEDIA(asset) } : null,
      keyframePrete: valides.has(`keyframe:${sid}`),
      devis: d ? { id: d.id, inputHash: d.inputHash, credits: d.maximumCredits, usdMicros: Number(d.maximumUsdMicros), expiresAt: d.expiresAt.toISOString() } : null,
    };
  }

  // Jobs des images clés et des clips de plans (toutes versions), les plus récents d'abord.
  const J = schema.studioJobs;
  const operationDuJob = (lignes: unknown): string | null => {
    const k = estDevisKeyframe(lignes);
    if (k) return `keyframe:${k}`;
    const c = estDevisClip(lignes);
    return c ? `clip:${c}` : null;
  };
  const lignesJobs = (await db.select().from(J).where(and(eq(J.workspaceId, projet.workspaceId), eq(J.brandId, projet.brandId), eq(J.projectId, projet.id)))
    .orderBy(desc(J.createdAt)).limit(40)).filter((j) => operationDuJob(lireSnapshotJob(j.snapshot)?.lignes)).slice(0, JOBS_MAX);
  const jobs: JobVideoVue[] = [];
  for (const j of lignesJobs) {
    const e = await etatJob(ctx, { jobId: j.id });
    if (!e.ok) continue;
    jobs.push({
      id: j.id, operation: operationDuJob(lireSnapshotJob(j.snapshot)?.lignes)!, etat: e.vue.etat, libelleEtat: LIBELLES_ETAT_IMAGE[e.vue.etat], message: e.vue.message,
      raisonEchec: e.vue.etat === 'failed' ? raisonEchec(j.error) : null, qualite: e.vue.qualite, libelleQualite: libelleQualiteImage(e.vue.etat, e.vue.qualite),
      creditsReserves: e.vue.creditsReserves, creeLe: j.createdAt.toISOString(),
    });
  }

  const S = schema.studioAssets;
  const musiques = (await db.select({ id: S.id, durationMs: S.durationMs }).from(S).where(and(
    eq(S.workspaceId, projet.workspaceId), eq(S.brandId, projet.brandId), like(S.mime, 'audio/%'), eq(S.storageState, 'stored'),
  )).orderBy(desc(S.createdAt)).limit(20)).map((m, i) => ({ assetId: m.id, libelle: `Piste ${i + 1}${m.durationMs ? ` · ${Math.round(m.durationMs / 1000)} s` : ''}` }));
  if (contenu.timeline?.music && !musiques.some((m) => m.assetId === contenu.timeline!.music!.assetId)) musiques.unshift({ assetId: contenu.timeline.music.assetId, libelle: 'Piste actuelle' });

  // Vidéo finale · plan pur sur les clips valides et la musique (métadonnées seulement, aucun octet lu ici).
  const S2 = schema.studioAssets;
  let musique: { assetId: string; gainDb: number } | null | 'introuvable' = null;
  if (contenu.timeline?.music) {
    const [m] = estUuid(contenu.timeline.music.assetId) ? await db.select({ id: S2.id }).from(S2).where(and(
      eq(S2.id, contenu.timeline.music.assetId), eq(S2.workspaceId, projet.workspaceId), eq(S2.brandId, projet.brandId), eq(S2.storageState, 'stored'), like(S2.mime, 'audio/%'),
    )).limit(1) : [];
    musique = m ? contenu.timeline.music : 'introuvable';
  }
  const clipsValides: Record<string, string> = {};
  for (const [sid, c] of Object.entries(clips)) if (c.etat === 'valide' && c.media) clipsValides[sid] = c.media.assetId;
  const planFinal = planRenduFinal({ contenu, clips: clipsValides, musique });
  const [derniere] = await db.select({ id: S2.id, durationMs: S2.durationMs, createdAt: S2.createdAt }).from(S2).where(and(
    eq(S2.workspaceId, projet.workspaceId), eq(S2.brandId, projet.brandId), eq(S2.projectId, projet.id), eq(S2.origin, ORIGINE_ARCHIVE_EXPORT),
    eq(S2.storageState, 'stored'), eq(S2.mime, 'video/mp4'), like(S2.storageKey, '%/video-finale-%'),
  )).orderBy(desc(S2.createdAt)).limit(1);
  const peutExporter = aPermissionEspace(ctx.permissions, 'studio.export');
  const videoFinale: VideoFinaleVue = {
    possible: planFinal.ok && peutExporter,
    raison: !peutExporter ? 'Ton rôle ne permet pas d’exporter.' : planFinal.ok ? '' : planFinal.violations.map((x) => x.raison).join(' '),
    nonInclus: planFinal.ok ? planFinal.plan.nonInclus : [],
    dureeMs: planFinal.ok ? planFinal.plan.dureeMs : 0,
    derniere: derniere ? { assetId: derniere.id, url: ROUTE_APERCU_MEDIA(derniere.id), dureeMs: derniere.durationMs, creeLe: derniere.createdAt.toISOString() } : null,
  };

  // L7-B · capacité vidéo SONDÉE par le worker · sans preuve fraîche, l'animation reste dite indisponible.
  const capacite = await lireCapaciteVideo(db, o.maintenant);

  return {
    ok: true,
    vue: {
      projet: { id: projet.id, titre: projet.title },
      version: { id: v.version.id, n: v.version.n },
      contenu,
      briefPresent: estBriefCanonique(contenu.brief),
      sansTexte: estSansTexte(contenu),
      format: formatVideo(contenu),
      segments: segmentsPlans(contenu).map((s) => ({ shotId: s.shotId, rang: s.rang + 1, debutMs: s.debutMs, dureeMs: s.dureeMs, estimee: typeof contenu.shots.byId[s.shotId]?.actualDurationMs !== 'number' })),
      dureeTotaleMs: contenu.shots.order.reduce((t, sid) => t + (contenu.shots.byId[sid] ? dureePlanMs(contenu.shots.byId[sid]!) : 0), 0),
      keyframes,
      clips,
      mediasValides: [...valides].sort(),
      musiques,
      disponibilite: disponibiliteVideo({
        peutGenerer: aPermissionEspace(ctx.permissions, 'studio.generate'), peutProposer: aPermissionEspace(ctx.permissions, 'studio.propose'),
        releasePubliee: o.releasePubliee, fournisseurTexte: o.fournisseurTexte, plafondAtteint: o.plafondAtteint, fournisseurImage: o.fournisseurImage,
        // L'animation passe par le même fournisseur fal que l'image : branchée exactement quand lui l'est.
        decodeurVideo: capacite.decodage, fournisseurVideo: o.fournisseurImage, briefPresent: estBriefCanonique(contenu.brief),
      }),
      coutTexteUsd: o.coutTexteUsd,
      prix: prixImage(),
      prixClip: { credits: GRILLE_STUDIO.animation.credits ?? 0, usdMicros: GRILLE_STUDIO.animation.usdMicros ?? 0, dureeS: DUREE_CLIP_S },
      videoFinale,
      jobs,
    },
  };

}
