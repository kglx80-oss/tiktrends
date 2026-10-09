import 'server-only';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  aPermissionEspace, controlerAvantCompilation, disponibiliteImage, erreurStudio, lireSnapshotJob, lireReferenceEpinglee,
  prixImage, raisonEchec, libelleQualiteImage, LIBELLES_ETAT_IMAGE, LIBELLES_MODE_IMAGE, MODES_IMAGE, OPERATION_IMAGE,
  type ConsigneImagePersistee, type DisponibiliteImage, type ErreurStudio, type EtatJob, type ModeImage,
  type StatutQualite, type VerdictConsigne, type LigneDevis,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { estUuid, lireJob } from '../depot';
import { chargerCatalogueProjet } from '../produit/catalogue';
import { controlerComposantsSortie } from '../produit/qualite';
import { creerDevis, approuverEtMettreEnFile, etatJob, type DevisPresente, type JobPresente, type OptionsApprobation } from '../execution/commandes';
import { ROUTE_APERCU_MEDIA } from '../editeur/apercus';
import { derniereConsigneCompilee, formatImageDuContenu, verifierConsigne } from './verification';
// R3 · ligne du contrôle visuel, nature des montants, contrôle visuel routé quand il est au devis.
import {
  borneControleVisionParImageMicros, controleVisionApprouve, qualifierDevis, vueLignesDevis,
  type LigneDevisVue, type QualificationTotal,
} from '@tiktrends/core';
import { controlerSortieParVision, refusControleVision } from '../produit/qualite';
import { lireMarqueurControleVision } from '@tiktrends/core';
import type { ResolveurMediasTache } from '../prompts/resolveur';
import { adaptateurAnthropicGarde, modeleTexte } from '../prompts/adaptateur';
import { environnementPrompts } from '../prompts/environnement';
import { spendStatus } from '../../spend-guard';

/**
 * Studios · F-B · le parcours image vu de l'écran, et ses gestes.
 *
 *  · `lireParcoursImagePour` · LECTURE PURE (aucune écriture, même pas le
 *    contrôle qualité) : disponibilités, coût de compilation, consigne
 *    compilée en attente, consigne retenue et son verdict, devis en cours,
 *    jobs de l'image, média livré et son statut qualité ;
 *  · `devisImagePour` · devis L3 de `keyframe:s_image` (variante volontaire :
 *    chaque devis vaut UNE nouvelle image) ;
 *  · `approuverImagePour` · approbation L3, refusée si le fournisseur d'images
 *    n'est pas branché (rien ne serait exécuté, la réserve resterait bloquée) ;
 *  · `controlerMediaPour` · contrôle des composants obligatoires d'un média
 *    livré (L5-C, acteur `controle`) : sans contrôle visuel routé ⇒
 *    `requires_review`, jamais `passed` en silence. Geste explicite (POST),
 *    jamais déclenché par l'affichage de la page.
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

const JOBS_MAX = 6;

export interface DependancesLecture {
  veilleOuverte: boolean;
  maintenant: Date;
  releasePubliee: boolean;
  fournisseurTexte: boolean;
  plafondAtteint: boolean;
  fournisseurImage: boolean;
  coutCompilationUsd: number;
}

export interface ConsigneVue {
  runId: string;
  mode: ModeImage;
  libelleMode: string;
  generationInstruction: string;
  negativeConstraints: string[];
  protectedComponents: string[];
  /** Les fichiers transmis, avec leur nom dans le catalogue de la marque (l'identifiant sinon). */
  liaisons: Array<{ referenceId: string; libelle: string; role: string; scope: string }>;
  format: { largeur: number; hauteur: number };
  compileeLe: string;
}

export interface MediaVue { assetId: string; url: string; largeur: number | null; hauteur: number | null }

export interface JobImageVue {
  id: string;
  etat: EtatJob;
  libelleEtat: string;
  message: string;
  raisonEchec: string | null;
  annulable: boolean;
  terminal: boolean;
  qualite: StatutQualite;
  libelleQualite: string;
  creditsReserves: number;
  creditsRendus: number | null;
  media: MediaVue | null;
  creeLe: string;
}

export interface DevisImageVue {
  id: string; inputHash: string; credits: number; usdMicros: number; expiresAt: string;
  /** R3 · « maximum » seulement si toutes les lignes sont des bornes. */
  qualification: QualificationTotal;
  lignes: LigneDevisVue[];
}

export interface VueParcoursImage {
  projet: { id: string };
  version: { id: string; n: number };
  modes: Array<{ mode: ModeImage; libelle: string; pret: boolean }>;
  format: { largeur: number; hauteur: number; libelle: string; depuisBrief: boolean };
  disponibilite: DisponibiliteImage;
  coutCompilationUsd: number;
  prix: { credits: number; usdMicros: number };
  /** Compilée par le serveur sur la version courante, pas encore retenue. */
  enAttente: ConsigneVue | null;
  retenue: (ConsigneVue & { verdict: VerdictConsigne }) | null;
  devis: DevisImageVue | null;
  jobs: JobImageVue[];
  /** R3 · ligne optionnelle du devis, cochée par défaut. */
  controleVision: { disponible: boolean; borneParImageUsdMicros: number };
  composantsObligatoires: string[];
  peutRelire: boolean;
}

function vueConsigne(c: ConsigneImagePersistee, noms: ReadonlyMap<string, { libelle: string }>): ConsigneVue {
  return {
    runId: c.runId, mode: c.mode, libelleMode: LIBELLES_MODE_IMAGE[c.mode],
    generationInstruction: c.consigne.generationInstruction, negativeConstraints: [...c.consigne.negativeConstraints],
    protectedComponents: [...c.consigne.protectedComponents], liaisons: c.consigne.referenceBindings.map((b) => ({ ...b, libelle: noms.get(b.referenceId)?.libelle ?? b.referenceId })),
    format: { ...c.format }, compileeLe: c.compileeLe,
  };
}

const estDevisImage = (lignes: unknown) => Array.isArray(lignes) && (lignes as LigneDevis[]).some((l) => l?.operation === OPERATION_IMAGE);

export async function lireParcoursImagePour(ctx: ContexteStudio, projectId: unknown, o: DependancesLecture): Promise<Resultat<{ vue: VueParcoursImage }>> {
  const c = await chargerCatalogueProjet(ctx, projectId, o);
  if (!c.ok) return c;
  const cat = c.catalogue;
  const projet = cat.projet;
  const contenu = cat.contenu;
  const portee = { workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id };

  const modes = MODES_IMAGE.map((mode) => ({ mode, libelle: LIBELLES_MODE_IMAGE[mode], pret: controlerAvantCompilation({ mode, brief: cat.brief, produit: cat.epingle, fichiers: cat.fichiers }).ok }));
  const disponibilite = disponibiliteImage({
    peutGenerer: aPermissionEspace(ctx.permissions, 'studio.generate'), peutProposer: aPermissionEspace(ctx.permissions, 'studio.propose'),
    briefPresent: !!cat.brief, preparationOk: modes.some((m) => m.pret), releasePubliee: o.releasePubliee, fournisseurTexte: o.fournisseurTexte,
    plafondAtteint: o.plafondAtteint, fournisseurImage: o.fournisseurImage,
  });

  const etat = await verifierConsigne(db, portee, contenu);
  const compilee = await derniereConsigneCompilee(db, portee, cat.version.id);
  const enAttente = compilee && compilee.empreinte !== etat.empreinte ? vueConsigne(compilee.consigne, cat.fichiers) : null;

  // Devis image encore valide de la version courante, pas encore approuvé.
  const Q = schema.studioQuotes;
  const AP = schema.studioApprovals;
  const devisLignes = await db.select({ q: Q }).from(Q).leftJoin(AP, eq(AP.quoteId, Q.id)).where(and(
    eq(Q.workspaceId, projet.workspaceId), eq(Q.brandId, projet.brandId), eq(Q.projectId, projet.id),
    eq(Q.projectVersionId, cat.version.id), gt(Q.expiresAt, o.maintenant), isNull(AP.id),
  )).orderBy(desc(Q.createdAt)).limit(10);
  const d = devisLignes.map((x) => x.q).find((q) => estDevisImage(q.lines));
  const devis: DevisImageVue | null = d ? {
    id: d.id, inputHash: d.inputHash, credits: d.maximumCredits, usdMicros: Number(d.maximumUsdMicros), expiresAt: d.expiresAt.toISOString(),
    qualification: qualifierDevis(d.lines), lignes: vueLignesDevis(d.lines),
  } : null;

  // Jobs de l'image du studio (toutes versions), les plus récents d'abord.
  const J = schema.studioJobs;
  const lignesJobs = (await db.select().from(J).where(and(eq(J.workspaceId, projet.workspaceId), eq(J.brandId, projet.brandId), eq(J.projectId, projet.id)))
    .orderBy(desc(J.createdAt)).limit(30)).filter((j) => estDevisImage(lireSnapshotJob(j.snapshot)?.lignes)).slice(0, JOBS_MAX);
  const idsMedias = lignesJobs.map((j) => (j.result as { assets?: Record<string, string> } | null)?.assets?.[OPERATION_IMAGE]).filter((x): x is string => estUuid(x));
  const S = schema.studioAssets;
  const medias = idsMedias.length
    ? await db.select().from(S).where(and(eq(S.workspaceId, projet.workspaceId), eq(S.brandId, projet.brandId), eq(S.projectId, projet.id), inArray(S.id, idsMedias), eq(S.storageState, 'stored')))
    : [];
  const jobs: JobImageVue[] = [];
  for (const j of lignesJobs) {
    const e = await etatJob(ctx, { jobId: j.id });
    if (!e.ok) continue;
    const idMedia = (j.result as { assets?: Record<string, string> } | null)?.assets?.[OPERATION_IMAGE];
    const m = medias.find((x) => x.id === idMedia);
    jobs.push({
      id: j.id, etat: e.vue.etat, libelleEtat: LIBELLES_ETAT_IMAGE[e.vue.etat], message: e.vue.message,
      raisonEchec: e.vue.etat === 'failed' ? raisonEchec(j.error) : null, annulable: e.vue.annulable, terminal: e.vue.terminal,
      qualite: e.vue.qualite, libelleQualite: libelleQualiteImage(e.vue.etat, e.vue.qualite),
      creditsReserves: e.vue.creditsReserves, creditsRendus: e.vue.creditsRendus,
      media: m ? { assetId: m.id, url: ROUTE_APERCU_MEDIA(m.id), largeur: m.width, hauteur: m.height } : null,
      creeLe: j.createdAt.toISOString(),
    });
  }

  const ref = lireReferenceEpinglee(contenu.productRef);
  return {
    ok: true,
    vue: {
      projet: { id: projet.id }, version: { id: cat.version.id, n: cat.version.n }, modes,
      format: formatImageDuContenu(contenu), disponibilite, coutCompilationUsd: o.coutCompilationUsd, prix: prixImage(),
      enAttente, retenue: etat.consigne ? { ...vueConsigne(etat.consigne, cat.fichiers), verdict: etat.verdict } : null,
      devis, jobs, composantsObligatoires: ref ? [...ref.composantsObligatoires] : [],
      // R3 · la case « contrôle visuel » n'existe que si la vision peut s'exécuter ici.
      controleVision: { disponible: o.fournisseurTexte, borneParImageUsdMicros: borneControleVisionParImageMicros(modeleTexte()) },
      peutRelire: aPermissionEspace(ctx.permissions, 'studio.propose'),
    },
  };
}

/** Devis de l'image du studio · lecture de la consigne d'abord (message clair), puis le devis L3. */
export async function devisImagePour(ctx: ContexteStudio, e: { projectId: unknown; controleVision?: unknown }, maintenant: Date = new Date()): Promise<Resultat<{ devis: DevisPresente }>> {
  // R3 · contrôle visuel coché par défaut ; `false` seulement s'il a été décoché.
  const d = await creerDevis(ctx, { projectId: e.projectId, operations: [OPERATION_IMAGE], variante: true, controleVision: e.controleVision === false ? false : undefined }, db, maintenant);
  if (!d.ok) {
    // Sans plan `s_image` (aucune consigne retenue), L3 répond « opération absente du plan » : on dit pourquoi.
    if (d.code === 'INVALID_SCHEMA' && d.violations?.some((v) => v.chemin === 'operations' && v.raison.startsWith('opérations absentes'))) {
      return erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, message: 'Aucune consigne image retenue dans la version courante · compile la consigne puis retiens-la avant de demander un devis.' });
    }
    return d;
  }
  return { ok: true, devis: d.devis };
}

/** Approuver et lancer · refusé tant que le fournisseur d'images n'est pas branché (rien ne serait exécuté). */
export async function approuverImagePour(
  ctx: ContexteStudio,
  e: { quoteId: unknown; inputHash: unknown; creditsAnnonces: unknown; idempotencyKey: unknown },
  o: OptionsApprobation & { fournisseurImage: boolean },
): Promise<Resultat<{ job: JobPresente; deja: boolean }>> {
  if (!o.fournisseurImage) {
    return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: 'Le fournisseur d’images n’est pas branché sur ce serveur · rien n’a été approuvé ni débité.' });
  }
  return approuverEtMettreEnFile(ctx, e, o);
}

/**
 * Contrôle des composants obligatoires d'un média LIVRÉ par le parcours image
 * (job `completed`, statut `pending`). Le contrôle visuel n'est pas routé :
 * `null` ⇒ `requires_review`. Idempotent : déjà tranché ⇒ rendu tel quel.
 */
export async function controlerMediaPour(ctx: ContexteStudio, e: { jobId: unknown }, o: { medias?: ResolveurMediasTache } = {}): Promise<Resultat<{ qualite: StatutQualite }>> {
  const j = await lireJob(ctx, e.jobId);
  if (!j.ok) return j;
  if (!estDevisImage(lireSnapshotJob(j.job.snapshot)?.lignes)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  if (j.job.state !== 'completed') return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, targetIds: [j.job.id], message: 'Le média n’est pas encore enregistré · attends la fin du job.' });
  // E2 · un contrôle précédent à l'issue INCERTAINE se dit (quoi réconcilier, comment), même tranché depuis.
  if (lireMarqueurControleVision(j.job.result) !== null && j.job.qualityStatus !== 'pending') {
    const refus = await refusControleVision(ctx, j.job);
    if (refus && refus.code === 'PROVIDER_UNCERTAIN') return refus;
  }
  if (j.job.qualityStatus !== 'pending') return { ok: true, qualite: j.job.qualityStatus as StatutQualite };
  // R3 · contrôle visuel APPROUVÉ au devis ⇒ il s'exécute, dans sa borne ; sinon, aucun appel payant.
  // E2 · REPRISE : média livré, ligne approuvée, aucun contrôle fait ⇒ SEUL le contrôle manquant part (jamais
  // une génération ni un devis) ; engagé ailleurs, conclu ou incertain ⇒ refus nommé, aucun appel.
  if (controleVisionApprouve(lireSnapshotJob(j.job.snapshot)?.lignes) && aPermissionEspace(ctx.permissions, 'studio.generate')) {
    const v = await controlerSortieParVision(ctx, { jobId: j.job.id }, {
      adaptateur: adaptateurAnthropicGarde(), environnement: environnementPrompts(process.env),
      plafondAtteint: async () => (await spendStatus()).blocked, ...(o.medias ? { medias: o.medias } : {}),
    });
    if (!v.ok) return v;
    return { ok: true, qualite: v.qualite };
  }
  const r = await controlerComposantsSortie(ctx, { jobId: j.job.id }, null);
  if (!r.ok) return r;
  return { ok: true, qualite: r.qualite };
}

