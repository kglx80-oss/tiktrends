import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { testedKeys } from './milestones';
import { analyzeAdAsset } from '@tiktrends/ai';
import { ttSearchAds, ttGetTranscript, ttTranscriptSupported, type InspoAd } from '@tiktrends/integrations';
import {
  selectForAnalysis, radarDigest, findingHeadline, estimateCost,
  normalizeAnalysis, summarizeAnalysis,
  type RadarCandidate, type RadarFinding, type RadarSignal,
} from '@tiktrends/core';
import { guardedAnthropic, SpendBlockedError } from './spend-guard';
import { invalidateJarvisMemory } from './jarvis-memory';

/**
 * Le passage de nuit.
 *
 * ── Ce qui coûte, et ce qui ne coûte pas ─────────────────────────────────────
 *
 * Récupérer les pubs des concurrents est déjà fait par le suivi de marques et
 * ne coûte rien de plus. Repérer laquelle a franchi trois semaines de diffusion
 * est de l'arithmétique. **Seule la description coûte un appel modèle**, et on
 * ne la déclenche que sur ce que la sélection a retenu.
 *
 * ── Trois barrières, dans cet ordre ──────────────────────────────────────────
 *
 * 1. **Le radar est éteint.** `brands.radar_armed` vaut faux tant que personne
 *    ne l'a armé. Une dépense qu'on n'a pas déclenchée est une dépense qu'on ne
 *    surveille pas.
 * 2. **Un plafond en unités, par marque et par nuit.** Trois créas par défaut,
 *    soit environ 0,06 $. Le plafond est vérifié AVANT le premier appel, pas
 *    après le dixième.
 * 3. **La garde globale.** Chaque appel passe par `guardedAnthropic` · si le
 *    plafond des 30 jours est atteint, le passage s'arrête proprement et le dit,
 *    plutôt que de rater à moitié.
 *
 * ── Ce qu'on signale, et ce qu'on ne signale pas ─────────────────────────────
 *
 * Une créa franchit son cap une fois. `reported_at` garantit qu'on le dit une
 * fois. Un radar qui répète chaque nuit qu'une pub de trois semaines est
 * toujours là devient du bruit, et un fil de bruit ne se lit plus.
 */

const PER_BRAND = 24;   // pubs relues par concurrent · même volume que le suivi

interface RadarRun {
  brandId: string;
  analyzed: number;
  spentUsd: number;
  deferred: number;
  digest: string;
  blocked?: string;
}

const bucket = (sec: number | null): string | null => {
  if (sec === null || !Number.isFinite(sec)) return null;
  if (sec < 10) return '<10s';
  if (sec < 15) return '10-15s';
  if (sec < 30) return '15-30s';
  if (sec < 60) return '30-60s';
  return '>60s';
};

/* -------------------------------------------------------------------------- */
/*  Le passage                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Un passage pour une marque armée.
 *
 * Renvoie toujours un compte rendu · une nuit sans trouvaille est une
 * information, pas un échec.
 */
export async function runRadarForBrand(workspaceId: string, brandId: string): Promise<RadarRun> {
  const vide: RadarRun = { brandId, analyzed: 0, spentUsd: 0, deferred: 0, digest: '' };
  const apiKey = process.env.TRENDTRACK_API_KEY;
  if (!db || !apiKey) return { ...vide, digest: 'Veille indisponible · la source n’est pas configurée.' };

  const [brand] = await db.select({
    id: schema.brands.id, armed: schema.brands.radarArmed, cap: schema.brands.radarCap,
  }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);

  // La barrière la plus importante du fichier, et la plus simple.
  if (!brand?.armed) return { ...vide, digest: 'Radar éteint pour cette marque.' };
  const cap = Math.max(0, Math.min(brand.cap ?? 0, 20));

  const suivies = await db.select({ name: schema.followedBrands.name, platform: schema.followedBrands.platform })
    .from(schema.followedBrands)
    .where(eq(schema.followedBrands.workspaceId, workspaceId));

  if (!suivies.length) {
    return { ...vide, digest: 'Aucun concurrent suivi · le radar n’a rien à surveiller.' };
  }

  // 1 · Récolte · gratuite.
  const ads: InspoAd[] = [];
  for (const s of suivies) {
    if (s.platform !== 'meta') continue;   // seule plateforme qui expose la durée de diffusion
    try {
      const r = await ttSearchAds({ apiKey }, {
        search: s.name, searchIn: 'brand', status: 'active',
        sortBy: 'longestRunning', order: 'desc', limit: PER_BRAND, offset: 0,
      });
      ads.push(...r.ads);
    } catch { /* un concurrent en échec n'arrête pas les autres */ }
  }
  if (!ads.length) return { ...vide, digest: 'Aucune créa concurrente lisible cette nuit.' };

  // 2 · Ce qu'on sait déjà · évite de repayer une description.
  const ids = ads.map((a) => a.id).filter(Boolean);
  const connues = ids.length
    ? await db.select({
        externalId: schema.marketCreatives.externalId, advertiser: schema.marketCreatives.advertiser,
      })
      .from(schema.marketCreatives)
      .where(eq(schema.marketCreatives.workspaceId, workspaceId))
    : [];

  const perAdvertiser = new Map<string, number>();
  for (const c of connues) {
    const a = c.advertiser ?? '(inconnu)';
    perAdvertiser.set(a, (perAdvertiser.get(a) ?? 0) + 1);
  }

  const candidats: RadarCandidate[] = ads.map((a) => ({
    externalId: a.id,
    advertiser: a.advertiserName ?? null,
    daysRunning: a.daysRunning ?? 0,
    reachDelta30d: a.reachDelta30d ?? null,
    liveAdsCount: a.liveAdsCount ?? null,
    format: a.mediaType ?? null,
    hasImage: !!(a.thumbnailUrl || a.mediaUrl),
    hasText: !!a.body,
  }));

  // 3 · Sélection · c'est ici que le budget est décidé, avant tout appel.
  const sel = selectForAnalysis(
    candidats,
    { analyzedIds: new Set(connues.map((c) => c.externalId)), perAdvertiser },
    cap,
  );

  if (!sel.picked.length) {
    await marquerPasse(brandId);
    return { ...vide, deferred: sel.deferred, digest: radarDigest([], sel.deferred) };
  }

  // 4 · Description · la seule partie payante.
  const client = guardedAnthropic({ workspaceId, action: 'radar' });
  if (!client) return { ...vide, digest: 'L’IA n’est pas configurée sur le serveur.' };

  const parAd = new Map(ads.map((a) => [a.id, a]));
  const trouvailles: RadarFinding[] = [];
  let bloque: string | undefined;
  let decrites = 0;

  for (const p of sel.picked) {
    const a = parAd.get(p.candidate.externalId);
    if (!a) continue;
    try {
      const transcript = ttTranscriptSupported() ? await ttGetTranscript({ apiKey }, a.id) : null;
      const brut = await analyzeAdAsset(client, {
        imageUrl: a.thumbnailUrl || a.mediaUrl || null,
        transcript, copy: a.body || null, format: a.mediaType || null,
      });
      if (!brut) continue;

      const n = normalizeAnalysis(brut);
      await db.insert(schema.marketCreatives).values({
        workspaceId, brandId,
        platform: a.platform, externalId: a.id,
        advertiser: a.advertiserName ?? null,
        daysRunning: a.daysRunning ?? 0,
        reachDelta30d: a.reachDelta30d ?? null,
        liveAdsCount: a.liveAdsCount ?? null,
        format: a.mediaType ?? null,
        hookType: n.hookType, openingType: n.openingType, talent: n.talent,
        lengthBucket: bucket(n.durationS),
        analysis: {
          hookSpoken: n.hookSpoken, claims: n.claims, proofElements: n.proofElements,
          unmapped: n.unmapped, summary: summarizeAnalysis(n),
          radarReason: p.reason,
        },
        analysisConfidence: n.confidence,
        radarSignal: p.signal,
        analyzedAt: new Date(),
      }).onConflictDoNothing();
      decrites++;

      // Les dimensions viennent d'une taxonomie fermée · on les élargit en
      // chaînes ici, parce que la trouvaille les compare à des clés de
      // statistiques qui, elles, sont du texte libre.
      const traits: string[] = [n.openingType, n.hookType].filter(Boolean).map((x) => String(x));
      const base = {
        externalId: a.id, advertiser: a.advertiserName ?? null,
        signal: p.signal as RadarSignal, daysRunning: a.daysRunning ?? 0,
        traits, unexplored: false,   // renseigné juste après, en une seule requête
      };
      trouvailles.push({ ...base, headline: findingHeadline(base) });
    } catch (e) {
      // Le plafond global arrête le passage proprement · continuer produirait
      // autant d'échecs qu'il reste de créas, pour rien.
      if (e instanceof SpendBlockedError) { bloque = e.message; break; }
      console.error('[radar] créa ignorée', (e as Error).message);
    }
  }

  // 5 · Ce qui ouvre quelque chose · la comparaison à ce que la marque a testé.
  if (trouvailles.length) await marquerInexplore(brandId, trouvailles);

  await marquerSignalees(workspaceId, trouvailles.map((t) => t.externalId));
  await marquerPasse(brandId);
  if (decrites) invalidateJarvisMemory(brandId);

  const digest = bloque
    ? `${radarDigest(trouvailles, sel.deferred)} Passage interrompu · ${bloque}`
    : radarDigest(trouvailles, sel.deferred);

  return {
    brandId, analyzed: decrites, spentUsd: estimateCost(decrites),
    deferred: sel.deferred, digest, blocked: bloque,
  };
}

/**
 * Une trouvaille est « inexplorée » quand la marque n'a jamais conclu de test
 * sur cette ouverture ou ce type d'accroche.
 *
 * C'est la seule question qui rend une créa concurrente actionnable : « ils
 * ouvrent sur une démonstration produit et tu ne l'as jamais essayé » ouvre
 * quelque chose, là où « ils ouvrent sur une démonstration produit » informe
 * sans rien ouvrir.
 */
async function marquerInexplore(brandId: string, trouvailles: RadarFinding[]): Promise<void> {
  if (!db) return;
  // Les voies déjà testées viennent des JALONS, pas de `adsmap_brand_stats` ·
  // cette table-là n'est écrite nulle part, l'ensemble revenait donc toujours
  // vide et TOUTE trouvaille passait pour « une voie jamais testée ». Une phrase
  // toujours vraie ne dit rien.
  const testees = await testedKeys(brandId);
  for (const t of trouvailles) {
    t.unexplored = t.traits.length > 0 && t.traits.every((tr) => !testees.has(tr));
    t.headline = findingHeadline(t);
  }
}

async function marquerSignalees(workspaceId: string, ids: string[]): Promise<void> {
  if (!db || !ids.length) return;
  await db.update(schema.marketCreatives).set({ reportedAt: new Date() })
    .where(and(
      eq(schema.marketCreatives.workspaceId, workspaceId),
      inArray(schema.marketCreatives.externalId, ids),
      isNull(schema.marketCreatives.reportedAt),
    ));
}

async function marquerPasse(brandId: string): Promise<void> {
  if (!db) return;
  await db.update(schema.brands).set({ radarLastRunAt: new Date() })
    .where(eq(schema.brands.id, brandId));
}

/* -------------------------------------------------------------------------- */
/*  Cron                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Toutes les marques armées.
 *
 * On ne balaie que celles qui l'ont été · une requête qui listerait tout puis
 * filtrerait en mémoire ferait grossir le coût de la nuit avec le nombre de
 * comptes, dont la quasi-totalité n'a rien demandé.
 */
export async function runRadarAll(): Promise<{ brands: number; analyzed: number; spentUsd: number }> {
  if (!db) return { brands: 0, analyzed: 0, spentUsd: 0 };

  const armees = await db.select({ id: schema.brands.id, workspaceId: schema.brands.workspaceId })
    .from(schema.brands)
    .where(eq(schema.brands.radarArmed, true));

  let analyzed = 0;
  let spentUsd = 0;

  for (const b of armees) {
    try {
      const r = await runRadarForBrand(b.workspaceId, b.id);
      analyzed += r.analyzed;
      spentUsd += r.spentUsd;
      if (r.digest && r.analyzed > 0) await notifier(b.workspaceId, r.digest);
      // Le plafond global vaut pour tout le monde · inutile de tenter les suivantes.
      if (r.blocked) break;
    } catch (e) {
      console.error('[radar] marque ignorée', b.id, (e as Error).message);
    }
  }

  return { brands: armees.length, analyzed, spentUsd };
}

/** Pose le compte rendu sur le bureau · seulement quand il y a quelque chose à dire. */
async function notifier(workspaceId: string, digest: string): Promise<void> {
  if (!db) return;
  try {
    const membres = await db.select({ uid: schema.workspaceMembers.userId, role: schema.workspaceMembers.role })
      .from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, workspaceId));
    const cibles = membres.filter((m) => m.role !== 'client_viewer').map((m) => m.uid);
    if (!cibles.length) return;
    await db.insert(schema.notifications).values(cibles.map((uid) => ({
      workspaceId, userId: uid, type: 'radar',
      title: 'Radar de veille', body: digest.slice(0, 400), href: '/adsmap/radar',
    })));
  } catch { /* la notification est un confort, jamais le résultat */ }
}

/* -------------------------------------------------------------------------- */
/*  Lecture                                                                   */
/* -------------------------------------------------------------------------- */

export interface RadarState {
  armed: boolean;
  cap: number;
  lastRunAt: string | null;
  /** Ce que coûterait une nuit pleine · affiché avant d'armer, pas après. */
  nightlyCostUsd: number;
  monthlyCostUsd: number;
  followed: number;
}

export async function radarState(workspaceId: string, brandId: string): Promise<RadarState> {
  const vide: RadarState = { armed: false, cap: 3, lastRunAt: null, nightlyCostUsd: 0.06, monthlyCostUsd: 1.8, followed: 0 };
  if (!db) return vide;

  const [b] = await db.select({
    armed: schema.brands.radarArmed, cap: schema.brands.radarCap, last: schema.brands.radarLastRunAt,
  }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  if (!b) return vide;

  const [n] = await db.select({ c: sql<number>`count(*)` })
    .from(schema.followedBrands)
    .where(eq(schema.followedBrands.workspaceId, workspaceId));

  const nuit = estimateCost(b.cap ?? 0);
  return {
    armed: !!b.armed, cap: b.cap ?? 0,
    lastRunAt: b.last ? (b.last as Date).toISOString() : null,
    nightlyCostUsd: nuit,
    // Trente nuits pleines · le pire cas, qui est le seul chiffre honnête à
    // montrer avant d'armer quelque chose qui tourne tout seul.
    monthlyCostUsd: Math.round(nuit * 30 * 100) / 100,
    followed: Number(n?.c ?? 0),
  };
}
