import 'server-only';
import { recordMilestones } from './milestones';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { MARKET_COLS, toMarketAd } from './market-rows';
import {
  buildJarvisMemory, computeBrandStats, globalHitRate, prelaunchScore, summarizePrelaunch,
  computeMarketStats, contrastMarketVsBrand, buildMarketMemory,
  buildHookLibrary, formatHooksForPrompt, countHooks, summarizeHooks,
  prelaunchBrief,
  type HookSource, type HookEntry, type HookCounts,
  type PrelaunchBrief, type MarketRow,
  type StatSourceAd, type StatRow, type PrelaunchInput, type PrelaunchScore,
  type MarketAd, type BrandRow,
} from '@tiktrends/core';

/**
 * Mémoire de marque pour Jarvis · §8.1 du cahier des charges ADSMAP.
 *
 * Jusqu'ici, Jarvis générait à partir de texte libre : des patterns distillés
 * depuis la veille concurrente, et des créas notées au pouce par le client.
 * C'est de l'opinion, et une opinion sur les pubs des autres.
 *
 * ADSMAP apporte autre chose : des verdicts mesurés sur les pubs de CETTE marque,
 * avec leur cause. « Le mécanisme listicle donne 3 gagnantes sur 8 tests
 * concluants ici » n'est pas du même ordre qu'« utilise des listicles ».
 *
 * On lit donc le graphe, on agrège, et on injecte le tableau. L'agrégation
 * elle-même est pure et vit dans `@tiktrends/core` · ici il n'y a que la lecture.
 */

/** Durée de vie du cache mémoire · l'agrégation ne bouge qu'au rythme des verdicts. */
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; ads: StatSourceAd[]; learnings: string[] }>();

/** Tranche de durée · l'IA raisonne mieux par palier que par seconde exacte. */
function lengthBucket(sec: number | null | undefined): string | null {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return null;
  if (sec < 10) return '<10s';
  if (sec < 15) return '10-15s';
  if (sec < 30) return '15-30s';
  if (sec < 60) return '30-60s';
  return '>60s';
}

/**
 * Lit les ads de la marque et les réduit à ce qui sert à apprendre.
 * Une seule requête pour la hiérarchie, une pour les éléments · pas de N+1.
 */
async function loadSourceAds(brandId: string, workspaceId: string): Promise<{ ads: StatSourceAd[]; learnings: string[] }> {
  if (!db) return { ads: [], learnings: [] };

  const rows = await db.select({
    adId: schema.ads.id,
    format: schema.ads.format,
    mechanism: schema.angles.mechanism,
    awareness: schema.desires.awarenessStage,
    avatar: schema.personas.name,
    hookType: schema.creatives.hookType,
    openingType: schema.creatives.openingType,
    talent: schema.creatives.talent,
    durationS: schema.creatives.durationS,
    verdictComputed: schema.verdicts.computed,
    verdictValidated: schema.verdicts.validated,
    comparable: schema.verdicts.comparable,
    metricsAgg: schema.verdicts.metricsAgg,
  })
    .from(schema.ads)
    .leftJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
    .leftJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .leftJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .leftJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .leftJoin(schema.creatives, eq(schema.ads.creativeId, schema.creatives.id))
    .innerJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
    .where(and(eq(schema.ads.workspaceId, workspaceId), eq(schema.personas.brandId, brandId)))
    .limit(600);

  // Éléments réutilisés · c'est le signal le plus fort dont on dispose.
  const ids = rows.map((r) => r.adId);
  const elems = ids.length
    ? await db.select({ adId: schema.adElements.adId, type: schema.creativeElements.type, content: schema.creativeElements.content })
        .from(schema.adElements)
        .leftJoin(schema.creativeElements, eq(schema.adElements.elementId, schema.creativeElements.id))
        .where(inArray(schema.adElements.adId, ids))
    : [];
  const parAd = new Map<string, string[]>();
  for (const e of elems) {
    if (!e.type || !e.content) continue;
    const cle = `${e.type}:${e.content.slice(0, 60)}`;
    parAd.set(e.adId, [...(parAd.get(e.adId) ?? []), cle]);
  }

  const ads: StatSourceAd[] = rows.map((r) => {
    const agg = (r.metricsAgg ?? null) as { hookRate?: number; holdRate?: number; ctr?: number; cpa?: number } | null;
    return {
      mechanism: r.mechanism, format: r.format, awareness: r.awareness, avatar: r.avatar,
      hookType: r.hookType, openingType: r.openingType, talent: r.talent,
      lengthBucket: lengthBucket(r.durationS),
      elementKeys: parAd.get(r.adId),
      // Le verdict humain fait foi quand il existe : c'est lui qui a été validé.
      verdict: (r.verdictValidated ?? r.verdictComputed) as StatSourceAd['verdict'],
      comparable: !!r.comparable,
      hookRate: agg?.hookRate ?? null, holdRate: agg?.holdRate ?? null,
      ctr: agg?.ctr ?? null, cpa: agg?.cpa ?? null,
    };
  });

  const learnRows = await db.select({ statement: schema.learnings.statement })
    .from(schema.learnings)
    .where(and(
      eq(schema.learnings.brandId, brandId),
      eq(schema.learnings.status, 'validated'),
      eq(schema.learnings.refuted, false),
    ))
    .orderBy(desc(schema.learnings.confidence), desc(schema.learnings.createdAt))
    .limit(12);

  return { ads, learnings: learnRows.map((l) => l.statement) };
}

async function loadCached(brandId: string, workspaceId: string) {
  const hit = cache.get(brandId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const data = await loadSourceAds(brandId, workspaceId).catch(() => ({ ads: [], learnings: [] }));
  const entry = { at: Date.now(), ...data };
  cache.set(brandId, entry);
  // Borne : un espace à cent marques ne doit pas garder cent tableaux en mémoire.
  if (cache.size > 50) cache.delete(cache.keys().next().value!);
  return entry;
}

/**
 * Bloc de mémoire mesurée à injecter dans un prompt.
 * Renvoie une chaîne vide tant que la marque n'a pas de verdicts · on ne fabrique
 * pas d'autorité à partir de rien.
 */
export async function jarvisMeasuredMemory(brandId: string, workspaceId: string): Promise<string> {
  const { ads, learnings } = await loadCached(brandId, workspaceId);
  if (!ads.length) return '';
  return buildJarvisMemory(ads, { learnings });
}

/**
 * Statistiques et taux global · pour le score de pré-lancement et les écrans.
 *
 * C'est aussi le seul endroit où les statistiques d'une marque existent · on en
 * profite pour dater les seuils franchis (`recordMilestones`). Il n'y a pas
 * d'instant « les stats sont recalculées » à attendre : elles sont dérivées à
 * la volée, à chaque fois qu'on en a besoin.
 *
 * L'écriture ne bloque pas et n'est pas attendue · un historique qui n'a pas pu
 * s'écrire sera posé au prochain passage, quelques heures plus tard.
 */
export async function jarvisStats(brandId: string, workspaceId: string): Promise<{ stats: StatRow[]; globalRate: number | null; nAds: number }> {
  const { ads } = await loadCached(brandId, workspaceId);
  const stats = computeBrandStats(ads);
  void recordMilestones(brandId, workspaceId, stats);
  return { stats, globalRate: globalHitRate(ads), nAds: ads.length };
}

/** Situe un concept avant de dépenser · agent A7, calculé en code. */
export async function scoreConceptBeforeLaunch(
  brandId: string, workspaceId: string, input: PrelaunchInput,
): Promise<PrelaunchScore & { summary: string }> {
  const { stats, globalRate } = await jarvisStats(brandId, workspaceId);
  const score = prelaunchScore(input, stats, globalRate);
  return { ...score, summary: summarizePrelaunch(score) };
}

/**
 * Ce que fait le MARCHÉ, et comment ça se confronte à nos chiffres.
 *
 * Renvoie une chaîne vide tant qu'aucune créa concurrente n'a été décrite · un
 * bloc « le marché fait peut-être ceci » vaut moins que pas de bloc du tout.
 *
 * L'ordre d'injection compte, et il est fixé chez l'appelant : la mémoire
 * MESURÉE passe devant. Ce qu'on sait de nos propres résultats prime toujours
 * sur ce qu'on devine des autres.
 */
export async function jarvisMarketMemory(brandId: string, workspaceId: string): Promise<string> {
  if (!db) return '';

  // Neuf colonnes, pas la table · `analysis` contient la description IA
  // complète de chaque créa, et six cents de ces documents traversaient la base
  // pour alimenter des champs qui tiennent sur une ligne.
  const rows = await db.select(MARKET_COLS).from(schema.marketCreatives)
    .where(and(
      eq(schema.marketCreatives.workspaceId, workspaceId),
      eq(schema.marketCreatives.brandId, brandId),
    ))
    .orderBy(desc(schema.marketCreatives.analyzedAt))
    .limit(600)
    .catch(() => []);
  if (!rows.length) return '';

  const ads: MarketAd[] = rows.map(toMarketAd);

  const marche = computeMarketStats(ads);
  const { ads: nos } = await loadCached(brandId, workspaceId);
  const brandRows: BrandRow[] = computeBrandStats(nos).map((s) => ({
    dimension: s.dimension, key: s.key, hitRate: s.hitRate, nConclusive: s.nConclusive,
  }));

  return buildMarketMemory(marche, {
    contrasts: contrastMarketVsBrand(marche, brandRows, globalHitRate(nos)),
    sampleSize: ads.length,
  });
}

/**
 * Les accroches relevées par A0, des deux côtés · avec ce qu'elles ont donné.
 *
 * C'est la donnée la plus directement utile de tout le module, et elle dormait :
 * A0 extrait les mots exacts de chaque accroche depuis le début, et personne ne
 * les relisait. Jarvis raisonnait sur des CATÉGORIES (« accroche chiffrée »)
 * quand il pouvait raisonner sur des EXEMPLES (« 3 erreurs que tu fais avec ta
 * crème »). On n'écrit pas une publicité à partir d'une catégorie.
 */
export async function jarvisHooks(brandId: string, workspaceId: string): Promise<HookEntry[]> {
  if (!db) return [];

  const [nos, marche] = await Promise.all([
    // Nos créas · l'accroche est dans l'analyse, le verdict à côté.
    db.select({
      analysis: schema.creatives.analysis,
      hookType: schema.creatives.hookType,
      mechanism: schema.angles.mechanism,
      computed: schema.verdicts.computed,
      validated: schema.verdicts.validated,
    })
      .from(schema.ads)
      .innerJoin(schema.creatives, eq(schema.ads.creativeId, schema.creatives.id))
      .leftJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .leftJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .leftJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .leftJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .where(and(eq(schema.ads.workspaceId, workspaceId), eq(schema.personas.brandId, brandId)))
      .limit(400)
      .catch(() => []),
    db.select({
      analysis: schema.marketCreatives.analysis,
      hookType: schema.marketCreatives.hookType,
      advertiser: schema.marketCreatives.advertiser,
      daysRunning: schema.marketCreatives.daysRunning,
      reachDelta30d: schema.marketCreatives.reachDelta30d,
    })
      .from(schema.marketCreatives)
      .where(and(
        eq(schema.marketCreatives.workspaceId, workspaceId),
        eq(schema.marketCreatives.brandId, brandId),
      ))
      .limit(400)
      .catch(() => []),
  ]);

  const texte = (a: unknown): string | null => {
    const h = (a as { hookSpoken?: unknown } | null)?.hookSpoken;
    return typeof h === 'string' && h.trim() ? h : null;
  };

  const sources: HookSource[] = [
    ...nos.flatMap((r) => {
      const t = texte(r.analysis);
      return t ? [{
        text: t, origin: 'brand' as const,
        // Le verdict humain fait foi quand il existe · c'est lui qui a été arbitré.
        verdict: r.validated ?? r.computed ?? null,
        hookType: r.hookType, mechanism: r.mechanism,
      }] : [];
    }),
    ...marche.flatMap((r) => {
      const t = texte(r.analysis);
      // Une créa concurrente qui n'a pas tenu n'apprend rien · on ne retient que
      // celles que leur annonceur continue de payer.
      const tient = r.daysRunning >= 21 || (r.reachDelta30d ?? 0) > 0;
      return t && tient ? [{
        text: t, origin: 'market' as const,
        advertiser: r.advertiser, daysRunning: r.daysRunning, hookType: r.hookType,
      }] : [];
    }),
  ];

  return buildHookLibrary(sources);
}

/** Lecture pour l'écran · la bibliothèque et son résumé. */
export async function jarvisHookView(brandId: string, workspaceId: string): Promise<{ entries: HookEntry[]; counts: HookCounts; summary: string }> {
  const entries = await jarvisHooks(brandId, workspaceId).catch(() => []);
  const counts = countHooks(entries);
  return { entries, counts, summary: summarizeHooks(counts) };
}

/**
 * La mémoire complète de Jarvis, dans l'ordre qui compte.
 *
 * Mesuré d'abord, marché ensuite. Un modèle lit ce qu'on lui donne dans l'ordre
 * où on le lui donne · mettre le marché en tête ferait suivre la mode aux
 * dépens de ce que la marque a payé pour apprendre.
 */
export async function jarvisFullMemory(brandId: string, workspaceId: string): Promise<string> {
  const [mesure, marche, accroches] = await Promise.all([
    jarvisMeasuredMemory(brandId, workspaceId),
    jarvisMarketMemory(brandId, workspaceId).catch(() => ''),
    jarvisHooks(brandId, workspaceId).then(formatHooksForPrompt).catch(() => ''),
  ]);
  // Les accroches en dernier, et c'est voulu : ce sont des EXEMPLES, et un
  // exemple se lit mieux après le principe qu'il illustre.
  return [mesure, marche, accroches].filter(Boolean).join('\n\n');
}

/** Ce qu'une génération a réellement reçu · consigné pour mesurer si ça aide. */
export interface MemoryUseOut { measured: boolean; market: boolean; hooks: number }

/**
 * La mémoire ET sa composition.
 *
 * On consigne ce qui a été injecté AU MOMENT de générer. Le reconstruire après
 * coup est impossible : la mémoire aura changé entre-temps, et on comparerait
 * des créas à un état de connaissance qui n'était pas le leur.
 */
export async function jarvisMemoryWithUse(
  brandId: string, workspaceId: string,
): Promise<{ text: string; use: MemoryUseOut }> {
  const [mesure, marche, entries] = await Promise.all([
    jarvisMeasuredMemory(brandId, workspaceId),
    jarvisMarketMemory(brandId, workspaceId).catch(() => ''),
    jarvisHooks(brandId, workspaceId).catch(() => [] as HookEntry[]),
  ]);
  const accroches = formatHooksForPrompt(entries);
  // Seules les accroches réellement INJECTÉES comptent · le bloc en écarte
  // certaines (plafonds, non testées seules), et compter la bibliothèque
  // entière ferait croire à une influence qui n'a pas eu lieu.
  const injectees = accroches ? (accroches.match(/^- « /gm)?.length ?? 0) : 0;

  return {
    text: [mesure, marche, accroches].filter(Boolean).join('\n\n'),
    use: { measured: !!mesure, market: !!marche, hooks: injectees },
  };
}

/** Parts d'usage du marché · lues une fois, partagées par les deux consommateurs. */
async function marketRows(brandId: string, workspaceId: string): Promise<MarketRow[]> {
  if (!db) return [];
  const rows = await db.select({
    advertiser: schema.marketCreatives.advertiser,
    hookType: schema.marketCreatives.hookType,
    openingType: schema.marketCreatives.openingType,
    talent: schema.marketCreatives.talent,
    lengthBucket: schema.marketCreatives.lengthBucket,
    format: schema.marketCreatives.format,
    daysRunning: schema.marketCreatives.daysRunning,
    reachDelta30d: schema.marketCreatives.reachDelta30d,
  })
    .from(schema.marketCreatives)
    .where(and(
      eq(schema.marketCreatives.workspaceId, workspaceId),
      eq(schema.marketCreatives.brandId, brandId),
    ))
    .limit(600)
    .catch(() => []);

  return computeMarketStats(rows.map((r) => ({
    advertiser: r.advertiser,
    hookType: r.hookType as MarketAd['hookType'],
    openingType: r.openingType as MarketAd['openingType'],
    talent: r.talent as MarketAd['talent'],
    lengthBucket: r.lengthBucket, format: r.format,
    daysRunning: r.daysRunning, reachDelta30d: r.reachDelta30d,
  })));
}

/**
 * L'avis complet avant de dépenser · les TROIS mémoires réunies.
 *
 * `scoreConceptBeforeLaunch` ne lisait que les statistiques par dimension. Il
 * ignorait les deux mémoires les plus concrètes : la bibliothèque d'accroches,
 * qui sait qu'une phrase précise a déjà perdu, et le marché.
 *
 * La différence pour l'utilisateur n'est pas de degré : « profil défavorable »
 * ne fait rien changer à personne, « son accroche est celle qui a perdu deux
 * fois ici » fait réécrire la ligne.
 */
export async function briefConceptBeforeLaunch(
  brandId: string, workspaceId: string,
  input: PrelaunchInput & { candidateHook?: string | null },
): Promise<PrelaunchBrief> {
  const [{ stats, globalRate }, hooks, market] = await Promise.all([
    jarvisStats(brandId, workspaceId),
    jarvisHooks(brandId, workspaceId).catch(() => [] as HookEntry[]),
    marketRows(brandId, workspaceId).catch(() => [] as MarketRow[]),
  ]);
  return prelaunchBrief(input, { stats, globalRate, hooks, market });
}

/** Vide le cache d'une marque · à appeler après un import ou un nouveau verdict. */
export function invalidateJarvisMemory(brandId: string): void {
  cache.delete(brandId);
}
