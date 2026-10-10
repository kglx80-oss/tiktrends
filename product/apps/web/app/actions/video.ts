'use server';

import { and, desc, eq, or, isNull, notInArray, sql, lte, ne } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession, type Session } from '../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../lib/rbac';
import { effectiveAccess } from '../../lib/access';
import { refusGesteStudio, TEXTE_REFUS_STUDIO } from '@tiktrends/core';
import { getActiveBrand } from '../../lib/brands';
import { higgsfieldFromEnv, hfSubmitVideo, hfSubmitImageVideo, hfGetJob, falFromEnv, falSubmitVideo, falGetVideo, isFalJob } from '@tiktrends/integrations';
import { suggestVideoBrief } from '@tiktrends/ai';
import { costFor, safeVideoDuration, videoUnits, promptVideo, fenetrePage, borneConsultation, TAILLE_PAGE_GALERIE } from '@tiktrends/core';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { logAndTranslate } from '../../lib/error-log';
import { guardedAnthropic, sousPlafond } from '../../lib/spend-guard';
import { GUARD } from '../../lib/guard-error';
import { resolvePreset } from './presets';
import { jarvisMemoryWithUse } from '../../lib/jarvis-memory';

/**
 * SEC-03 · garde serveur des gestes du studio (générer, débiter, écrire).
 *
 * Ce fichier ne vérifiait que la session · un `client_viewer`, ou un membre
 * d'un espace Starter, appelait directement l'action et dépensait des dollars
 * et des crédits que la page lui refuse. On applique ici la MÊME règle que les
 * pages `/studio/*` et `actions/studio.ts` (Textes) : `canAccess` sur la
 * feature `studio` du catalogue existant (rôle + offre, ou matrice d'équipe),
 * plus le rôle d'espace « member » minimum (`refusGesteStudio`, noyau). Aucun
 * droit nouveau ; les lectures restent inchangées. Appelée AVANT tout appel IA,
 * toute réservation de crédits et toute écriture.
 */
const FEATURE_STUDIO_GESTE = FEATURES.find((f) => f.key === 'studio')!;
async function sessionGeste(): Promise<{ s: Session } | { refus: string }> {
  const s = await getSession();
  if (!s) return { refus: GUARD.session() };
  const acces = effectiveAccess(s);
  const refus = refusGesteStudio({
    roleEspace: s.role,
    refusCatalogue: canAccess(acces, FEATURE_STUDIO_GESTE) ? null : (denyReason(acces, FEATURE_STUDIO_GESTE) ?? 'role'),
  });
  return refus ? { refus: TEXTE_REFUS_STUDIO[refus] } : { s };
}

/**
 * Ce que Jarvis sait, versé dans le brief vidéo.
 *
 * ── Le format le plus cher était le seul aveugle ─────────────────────────────
 *
 * Les pubs et les images reçoivent la mémoire mesurée de la marque · la vidéo
 * partait avec la seule phrase tapée. C'est pourtant le poste où une créa ratée
 * coûte le plus : plusieurs fois une image, et par tranches de cinq secondes.
 *
 * ── Ce qu'on injecte, et ce qu'on n'injecte pas ──────────────────────────────
 *
 * Les chiffres mesurés de la marque, coupés court. Pas les accroches mot pour
 * mot · une vidéo n'a pas d'accroche incrustée, leur place serait dans le script
 * et il n'y a pas de script ici.
 *
 * `memoryUse` est consigné dans la génération, comme pour les pubs · c'est ce
 * qui permettra un jour de dire si la mémoire aide AUSSI en vidéo. Sans cette
 * trace, la question ne se poserait jamais faute de données.
 */
async function avecMemoire(prompt: string, brandId: string | null, workspaceId: string) {
  if (!brandId) return { brief: prompt, use: undefined };
  try {
    const m = await jarvisMemoryWithUse(brandId, workspaceId);
    const texte = m.text?.trim();
    if (!texte) return { brief: prompt, use: m.use };
    return {
      brief: `${prompt}\n\nCe que cette marque a MESURÉ sur ses propres tests (applique-le, ne le cite pas) :\n${texte.slice(0, 1200)}`,
      use: m.use,
    };
  } catch {
    // Une mémoire illisible ne doit pas empêcher de générer · on part sans.
    return { brief: prompt, use: undefined };
  }
}

/**
 * Applique le prompt maison au brief vidéo.
 *
 * ── Le défaut que ça répare ──────────────────────────────────────────────────
 *
 * `presetId` était **consigné dans la génération et jamais appliqué**. Choisir
 * une scène enregistrée ne changeait donc rien à la vidéo produite.
 *
 * C'est pire que de ne rien faire : la génération portait quand même le preset,
 * et le classement « quel prompt gagne » lui attribuait des verdicts qu'il
 * n'avait pas produits. On mesurait l'effet d'un réglage inopérant.
 *
 * ── Le prompt maison passe APRÈS la demande ──────────────────────────────────
 *
 * La description est ce que la personne veut voir ; le prompt maison est une
 * direction artistique. Le mettre devant ferait de la demande une nuance de la
 * DA, alors que c'est l'inverse.
 */
function avecPreset(prompt: string, preset: { prompt: string; negative: string | null } | null): string {
  if (!preset) return prompt;
  const da = preset.prompt.trim();
  const sans = preset.negative?.trim();
  return [prompt, da ? `Art direction: ${da}` : '', sans ? `Avoid: ${sans}` : '']
    .filter(Boolean).join('\n\n');
}

export interface VideoStart { error?: string; jobId?: string; generationId?: string }

export interface VideoStatus { status: 'queued' | 'processing' | 'completed' | 'failed' | 'unknown'; videoUrl?: string; error?: string }
export interface BrandVideo { id: string; prompt: string; mode: string; status: string; jobId: string | null; videoUrl: string | null; error?: string; createdAt: string; rating?: import('./creatives').Rating }

/**
 * Trace la génération vidéo. Le débit, lui, est fait AVANT la soumission du job
 * (reserveCredits) : une vidéo lancée est un coût déjà engagé chez le fournisseur.
 */
async function recordGeneration(
  brandId: string | null, cost: number,
  input: Record<string, unknown>, jobId: string, unlimited = false,
): Promise<string | undefined> {
  if (!db || !brandId) return undefined;
  const [g] = await db.insert(schema.generations).values({
    brandId, kind: 'video', input, jobId, status: 'processing', creditsCost: unlimited ? 0 : cost,
  }).returning();
  return g?.id;
}

/** Texte → vidéo (gated + débit crédits). */
export async function startVideoAction(input: { prompt: string; aspectRatio?: '9:16' | '1:1' | '16:9'; durationS?: number; presetId?: string; directionKey?: string }): Promise<VideoStart> {
  const garde = await sessionGeste();
  if ('refus' in garde) return { error: garde.refus };
  const s = garde.s;
  const prompt = input.prompt?.trim();
  if (!prompt) return { error: 'Décris la vidéo à générer.' };

  const fal = falFromEnv();
  const hf = fal ? null : higgsfieldFromEnv();
  if (!fal && !hf) return { error: "La vidéo IA n'est pas encore activée (clé serveur manquante)." };

  // Le suivi relit le job en base, rattaché à une marque de l'espace (SEC-07) ·
  // une vidéo sans marque active serait payée puis impossible à suivre (et
  // n'était déjà jamais enregistrée). On refuse AVANT tout débit.
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };

  const duree = safeVideoDuration(input.durationS);
  const cost = costFor('video') * videoUnits(duree);
  const unlimited = unlimitedCredits(s.user.email);
  // Débit atomique avant la soumission (remboursé si le lancement échoue).
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · vidéo IA'))) {
    return { error: `Crédits insuffisants (${cost} requis pour une vidéo de ${duree} s).` };
  }

  try {
    // La vidéo est le poste qui peut faire déraper une facture en quelques clics ·
    // le forfait appliqué est nettement supérieur à celui d'une image, et il
    // compte en unités de cinq secondes.
    // La marque est lue AVANT la soumission · sa mémoire doit entrer dans le
    // brief, pas être consignée après coup sur une vidéo qui n'en a rien su.
    const memo = await avecMemoire(prompt, brand.id, s.workspaceId);
    // La direction de mouvement se compose dans le prompt FINAL · la légende
    // stockée reste la description de la personne.
    const briefT2v = promptVideo(avecPreset(memo.brief, await resolvePreset(s.workspaceId, input.presetId)), input.directionKey);
    const { jobId } = await sousPlafond('fal_video', { action: 'video:t2v', workspaceId: s.workspaceId, units: videoUnits(duree) }, () => (fal
      ? falSubmitVideo(fal, { prompt: briefT2v, aspectRatio: input.aspectRatio ?? '9:16', durationS: duree })
      : hfSubmitVideo(hf!, { prompt: briefT2v, aspectRatio: input.aspectRatio ?? '9:16', durationS: duree })));
    const generationId = await recordGeneration(brand.id, cost, { mode: 't2v', prompt, aspectRatio: input.aspectRatio ?? '9:16', durationS: duree, ...(memo.use ? { memoryUse: memo.use } : {}), ...(input.presetId ? { presetId: input.presetId } : {}) }, jobId, unlimited);
    return { jobId, generationId };
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · vidéo non lancée');
    return { error: logAndTranslate('video:start', e, { subject: 'le lancement de la vidéo', workspaceId: s.workspaceId }) };
  }
}

/** Image → vidéo (anime une image de départ). */
export async function startImageVideoAction(input: { prompt: string; imageUrl: string; aspectRatio?: '9:16' | '1:1' | '16:9'; durationS?: number; presetId?: string; directionKey?: string }): Promise<VideoStart> {
  const garde = await sessionGeste();
  if ('refus' in garde) return { error: garde.refus };
  const s = garde.s;
  const prompt = input.prompt?.trim();
  const imageUrl = input.imageUrl?.trim();
  if (!imageUrl) return { error: 'Choisis une image de départ (produit ou pub).' };
  if (!/^https?:\/\//i.test(imageUrl) && !/^data:image\//i.test(imageUrl)) return { error: "L'image doit être un lien http(s) ou une image importée." };

  const fal = falFromEnv();
  const hf = fal ? null : higgsfieldFromEnv();
  if (!fal && !hf) return { error: "La vidéo IA n'est pas encore activée (clé serveur manquante)." };

  // Même règle qu'en texte → vidéo · pas de vidéo payée et impossible à suivre.
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };

  const duree = safeVideoDuration(input.durationS);
  const cost = costFor('video') * videoUnits(duree);
  const unlimited = unlimitedCredits(s.user.email);
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · vidéo IA'))) {
    return { error: `Crédits insuffisants (${cost} requis pour une vidéo de ${duree} s).` };
  }

  const motion = prompt || 'Anime cette image de façon naturelle et cinématographique.';
  try {
    const memo = await avecMemoire(motion, brand.id, s.workspaceId);
    const briefI2v = promptVideo(avecPreset(memo.brief, await resolvePreset(s.workspaceId, input.presetId)), input.directionKey);
    const { jobId } = await sousPlafond('fal_video', { action: 'video:i2v', workspaceId: s.workspaceId, units: videoUnits(duree) }, () => (fal
      ? falSubmitVideo(fal, { prompt: briefI2v, imageUrl, aspectRatio: input.aspectRatio ?? '9:16', durationS: duree })
      : hfSubmitImageVideo(hf!, { prompt: briefI2v, imageUrl, aspectRatio: input.aspectRatio ?? '9:16', durationS: duree })));
    const generationId = await recordGeneration(brand.id, cost, { mode: 'i2v', prompt, imageUrl, aspectRatio: input.aspectRatio ?? '9:16', durationS: duree, ...(memo.use ? { memoryUse: memo.use } : {}), ...(input.presetId ? { presetId: input.presetId } : {}) }, jobId, unlimited);
    return { jobId, generationId };
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · vidéo non lancée');
    return { error: logAndTranslate('video:start', e, { subject: 'le lancement de la vidéo', workspaceId: s.workspaceId }) };
  }
}

/** Une page de la galerie Vidéo · lot 13 (voir core/galerie-pagination). */
export interface PageVideos {
  items: BrandVideo[];
  page: number;
  pages: number;
  de: number;
  a: number;
  /** Générations vidéo (en cours, prêtes, échouées). */
  generations: number;
  /** Vidéos prêtes (une génération en produit au plus une). */
  sorties: number;
  jusqua: string;
}

/**
 * Une page de l'historique vidéo de la marque active · lecture seule.
 *
 * Lot 13 · les 24 dernières générations seulement étaient chargées, et les
 * archivées retirées APRÈS ce découpage. La pagination porte désormais sur
 * toutes les générations visibles, ordre stable (date ↓, id ↓), sous la borne
 * de consultation, au plus TAILLE_PAGE_GALERIE lignes par appel.
 */
export async function pageVideosMarque(p: { page?: number; jusqua?: string } = {}): Promise<PageVideos> {
  const borne = borneConsultation(p.jusqua, new Date());
  const iso = borne.toISOString();
  const vide: PageVideos = { items: [], page: 0, pages: 1, de: 0, a: 0, generations: 0, sorties: 0, jusqua: iso };
  const s = await getSession();
  if (!s || !db) return vide;
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return vide;
  const g = schema.generations;
  const visible = and(eq(g.brandId, brand.id), eq(g.kind, 'video'), or(isNull(g.status), ne(g.status, 'archived')), lte(g.createdAt, borne));
  const [c] = await db.select({
    generations: sql<number>`count(*)::int`,
    sorties: sql<number>`count(*) filter (where ${g.status} = 'completed' and coalesce(array_length(${g.assetUrls}, 1), 0) > 0)::int`,
  }).from(g).where(visible);
  const f = fenetrePage(c?.generations ?? 0, p.page ?? 0, TAILLE_PAGE_GALERIE);
  const rows = await db.select({
    id: g.id, input: g.input, output: g.output, status: g.status, jobId: g.jobId, assetUrls: g.assetUrls, createdAt: g.createdAt,
  }).from(g).where(visible).orderBy(desc(g.createdAt), desc(g.id)).limit(TAILLE_PAGE_GALERIE).offset(f.offset);
  const items = rows.map((r) => {
    const input = (r.input ?? {}) as { prompt?: string; mode?: string; rating?: import('./creatives').Rating };
    const output = (r.output ?? {}) as { error?: string };
    return {
      id: r.id, prompt: input.prompt || '(sans description)', mode: input.mode || 't2v',
      status: r.status || 'processing', jobId: r.jobId, videoUrl: (r.assetUrls && r.assetUrls[0]) || null,
      error: output.error, createdAt: (r.createdAt as Date).toISOString(), rating: input.rating ?? null,
    };
  });
  return { items, page: f.page, pages: f.pages, de: f.de, a: f.a, generations: c?.generations ?? 0, sorties: c?.sorties ?? 0, jusqua: iso };
}

// Au-delà de ce délai sans complétion, on considère le job perdu (évite le spinner infini).
const STALE_MS = 15 * 60 * 1000;

/** Réponse neutre du suivi · ne dit pas si la génération existe ailleurs. */
const SUIVI_INDISPONIBLE = 'Suivi indisponible pour cette vidéo.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marque une génération vidéo en échec et rembourse les crédits · UNE seule fois.
 *
 * ── Le défaut (audit L0-C) ───────────────────────────────────────────────────
 *
 * On lisait le statut, puis on écrivait `failed` sans condition, puis on
 * remboursait si le statut LU n'était pas terminal. Deux suivis concurrents
 * (deux onglets sur /studio/video, ou deux polls qui se croisent) lisaient
 * tous deux « en cours » et remboursaient tous deux · double crédit. Et une
 * vidéo déjà `completed` pouvait être réécrite `failed`.
 *
 * ── Ce qui le rend unique ────────────────────────────────────────────────────
 *
 * La bascule est un seul UPDATE conditionnel (`status` ni `failed` ni
 * `completed`) qui RENVOIE la ligne changée. Postgres sérialise les deux
 * UPDATE sur la même ligne · le second, réévalué après le premier, ne trouve
 * plus rien. On ne rembourse que si une ligne est revenue, avec le coût lu
 * dans cette même instruction.
 */
async function failAndRefund(generationId: string, workspaceId: string, error: string): Promise<void> {
  if (!db) return;
  try {
    // Appartenance vérifiée · la génération doit être dans l'espace demandeur,
    // via sa marque (`generations` n'a pas de workspaceId direct). Sans ce
    // filtre, un generationId d'un AUTRE espace se faisait marquer en échec ET
    // rembourser sur l'espace de l'appelant · vol de crédits + DoS.
    const [g] = await db.select({ status: schema.generations.status })
      .from(schema.generations)
      .innerJoin(schema.brands, eq(schema.generations.brandId, schema.brands.id))
      .where(and(eq(schema.generations.id, generationId), eq(schema.brands.workspaceId, workspaceId)))
      .limit(1);
    if (!g) return; // n'appartient pas à cet espace · aucun effet
    // Déjà terminale · rien à écrire. Ce n'est qu'un raccourci : la garantie
    // d'unicité vient de la condition reposée dans l'UPDATE ci-dessous.
    if (g.status === 'failed' || g.status === 'completed') return;
    const basculees = await db.update(schema.generations)
      .set({ status: 'failed', output: { error } })
      .where(and(
        eq(schema.generations.id, generationId),
        or(isNull(schema.generations.status), notInArray(schema.generations.status, ['failed', 'completed'])),
      ))
      .returning({ cost: schema.generations.creditsCost });
    // Remboursement seulement si CETTE instruction a fait la bascule.
    const cout = basculees[0]?.cost ?? 0;
    if (basculees.length && cout > 0) {
      await refundCredits(workspaceId, cout, 'Studio · vidéo échouée (remboursement)');
    }
  } catch { /* best-effort */ }
}

/**
 * Interroge le statut d'un job vidéo (appelé en polling par le client).
 *
 * ── Limite connue (chantier L0, à déplacer en L3) ────────────────────────────
 *
 * Ce suivi est lancé par l'ÉCRAN · ouvrir /studio/video reprend le suivi des
 * vidéos encore « en cours », et la réponse du fournisseur est réconciliée ici
 * (statut, adresse de la vidéo, échec et remboursement). Ce n'est pas une
 * lecture pure au sens de BASE-03, mais la supprimer perdrait les vidéos
 * terminées pendant l'absence de l'utilisateur. Elle reste donc, rendue
 * idempotente (remboursement unique ci-dessus, `completed` jamais réécrit), et
 * doit migrer vers le worker (webhook fournisseur ou tâche planifiée) pour que
 * l'écran ne fasse plus que lire.
 */
export async function pollVideoAction(_jobIdClient: string, generationId?: string): Promise<VideoStatus> {
  const garde = await sessionGeste();
  if ('refus' in garde) return { status: 'unknown', error: garde.refus };
  const s = garde.s;

  // ── SEC-07 · le job est RELU en base, dans la portée de l'espace ───────────
  //
  // Le `jobId` venait du navigateur et partait tel quel chez le fournisseur,
  // avec la clé fal en en-tête · un `jobId` forgé emmenait la clé vers l'hôte
  // de son choix. Il n'est plus lu (le paramètre reste pour l'écran actuel) :
  // seul compte le job ENREGISTRÉ sur une génération vidéo d'une marque de
  // l'espace. Génération inconnue, d'un autre espace, ou sans job → réponse
  // neutre, aucune requête sortante, aucune écriture.
  if (!db || !generationId || !UUID.test(generationId)) return { status: 'unknown', error: SUIVI_INDISPONIBLE };
  const [gen] = await db.select({ jobId: schema.generations.jobId, createdAt: schema.generations.createdAt })
    .from(schema.generations)
    .innerJoin(schema.brands, eq(schema.generations.brandId, schema.brands.id))
    .where(and(eq(schema.generations.id, generationId), eq(schema.generations.kind, 'video'), eq(schema.brands.workspaceId, s.workspaceId)))
    .limit(1);
  if (!gen?.jobId) return { status: 'unknown', error: SUIVI_INDISPONIBLE };
  const jobId = gen.jobId;

  try {
    let job: VideoStatus;
    if (isFalJob(jobId)) {
      const fal = falFromEnv();
      if (!fal) return { status: 'unknown', error: 'Vidéo IA non configurée.' };
      job = await falGetVideo(fal, jobId);
    } else {
      const hf = higgsfieldFromEnv();
      if (!hf) return { status: 'unknown', error: 'Vidéo IA non configurée.' };
      job = await hfGetJob(hf, jobId);
    }

    // Garde-fou anti-blocage : un job « en cours » trop vieux est déclaré en échec.
    if (job.status === 'processing' || job.status === 'queued' || job.status === 'unknown') {
      const age = gen.createdAt ? Date.now() - new Date(gen.createdAt as Date).getTime() : 0;
      if (age > STALE_MS) {
        const error = 'La génération a pris trop de temps et a été interrompue. Crédits remboursés, relance-la.';
        await failAndRefund(generationId, s.workspaceId, error);
        return { status: 'failed', error };
      }
    }

    if (db && generationId && job.status === 'failed') {
      await failAndRefund(generationId, s.workspaceId, job.error || 'La génération vidéo a échoué.');
      return { status: 'failed', error: (job.error ? job.error + ' · ' : '') + 'Crédits remboursés.' };
    }
    if (db && generationId && job.status === 'completed') {
      try {
        // Appartenance vérifiée avant d'écrire l'URL · sinon un generationId
        // d'un autre espace se faisait injecter une URL vidéo arbitraire.
        const [own] = await db.select({ status: schema.generations.status })
          .from(schema.generations)
          .innerJoin(schema.brands, eq(schema.generations.brandId, schema.brands.id))
          .where(and(eq(schema.generations.id, generationId), eq(schema.brands.workspaceId, s.workspaceId)))
          .limit(1);
        if (own && own.status !== 'completed') {
          // Conditionnel · une vidéo déjà `completed` n'est pas réécrite à
          // chaque suivi (un second onglet ne refait aucune écriture).
          await db.update(schema.generations)
            .set({ status: 'completed', assetUrls: job.videoUrl ? [job.videoUrl] : [] })
            .where(and(
              eq(schema.generations.id, generationId),
              or(isNull(schema.generations.status), ne(schema.generations.status, 'completed')),
            ));
        }
      } catch { /* best-effort */ }
    }
    return { status: job.status, videoUrl: job.videoUrl, error: job.error };
  } catch (e) {
    return { status: 'unknown', error: logAndTranslate('video:poll', e, { subject: 'le suivi du rendu', workspaceId: s.workspaceId }) };
  }
}

/** Éléments à animer (image → vidéo) : photos produit + scènes de pubs + bibliothèque Assets. */
export interface AnimatableAsset { url: string; label: string; kind: 'product' | 'ad' | 'asset' }
export async function listAnimatableAssets(): Promise<AnimatableAsset[]> {
  const s = await getSession();
  if (!s || !db) return [];
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return [];
  const out: AnimatableAsset[] = [];

  // Bibliothèque Assets : images (marque + communes) utilisables par l'IA, en URL http (i2v).
  const libImgs = await db.select({ name: schema.assets.name, url: schema.assets.url })
    .from(schema.assets)
    .where(and(
      eq(schema.assets.workspaceId, s.workspaceId),
      eq(schema.assets.kind, 'image'),
      eq(schema.assets.useForAi, true),
      or(eq(schema.assets.brandId, brand.id), isNull(schema.assets.brandId)),
    ))
    .orderBy(desc(schema.assets.createdAt)).limit(24);
  for (const a of libImgs) {
    if (a.url && /^https?:\/\//.test(a.url)) out.push({ url: a.url, label: a.name, kind: 'asset' });
  }

  const prods = await db.select({ name: schema.products.name, imageUrl: schema.products.imageUrl, imageUrls: schema.products.imageUrls })
    .from(schema.products).where(eq(schema.products.brandId, brand.id));
  for (const p of prods) {
    const url = (p.imageUrls && p.imageUrls[0]) || p.imageUrl;
    if (url) out.push({ url, label: p.name, kind: 'product' });
  }

  const ads = await db.select({ input: schema.generations.input, assetUrls: schema.generations.assetUrls })
    .from(schema.generations)
    .where(and(eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad')))
    .orderBy(desc(schema.generations.createdAt)).limit(12);
  for (const a of ads) {
    const url = a.assetUrls && a.assetUrls[0];
    if (url && /^https?:\/\//.test(url)) {
      const rec = (a.input ?? {}) as { headline?: string };
      out.push({ url, label: rec.headline || 'Scène de pub', kind: 'ad' });
    }
  }
  return out;
}

/** Propose une consigne de mouvement (ancrée marque/produit) pour la vidéo. */
export async function suggestVideoBriefAction(input: { productId?: string; fromImage?: boolean }): Promise<{ text?: string; error?: string }> {
  const garde = await sessionGeste();
  if ('refus' in garde) return { error: garde.refus };
  const s = garde.s;
  const client = guardedAnthropic({ workspaceId: s.workspaceId, action: 'video' });
  if (!client) return { error: GUARD.aiOff() };
  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('suggest');
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · consigne vidéo suggérée'))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
  }
  const brand = await getActiveBrand(s.workspaceId);
  let tone: string | null = null;
  let creativeRules: string | null = null;
  let product: { name: string; description: string | null } | null = null;
  if (db && brand) {
    const [row] = await db.select({ tone: schema.brands.tone, creativeRules: schema.brands.creativeRules }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
    tone = row?.tone ?? null;
    creativeRules = row?.creativeRules ?? null;
    if (input.productId) {
      const [p] = await db.select({ name: schema.products.name, description: schema.products.description })
        .from(schema.products).where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
      if (p) product = p;
    }
  }
  try {
    const text = await suggestVideoBrief(client, { brand: brand?.name, tone: tone ?? undefined, productName: product?.name, productDesc: product?.description ?? undefined, fromImage: input.fromImage, edenRules: creativeRules ?? undefined });
    return { text: text || undefined };
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · consigne vidéo');
    return { error: logAndTranslate('video:brief', e, { subject: 'la proposition de consigne', workspaceId: s.workspaceId }) };
  }
}

/** Supprime une vidéo (rendu raté ou bloqué) de la galerie de la marque. */
export async function deleteVideoAction(id: string): Promise<{ ok?: true; error?: string }> {
  const garde = await sessionGeste();
  if ('refus' in garde) return { error: garde.refus };
  const s = garde.s;
  if (!db) return { error: GUARD.db() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };
  await db.delete(schema.generations)
    .where(and(eq(schema.generations.id, id), eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'video')));
  return { ok: true };
}
