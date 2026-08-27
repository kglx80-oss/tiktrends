import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  buildJarvisMemory, computeBrandStats, globalHitRate, prelaunchScore, summarizePrelaunch,
  type StatSourceAd, type StatRow, type PrelaunchInput, type PrelaunchScore,
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

/** Statistiques et taux global · pour le score de pré-lancement et les écrans. */
export async function jarvisStats(brandId: string, workspaceId: string): Promise<{ stats: StatRow[]; globalRate: number | null; nAds: number }> {
  const { ads } = await loadCached(brandId, workspaceId);
  return { stats: computeBrandStats(ads), globalRate: globalHitRate(ads), nAds: ads.length };
}

/** Situe un concept avant de dépenser · agent A7, calculé en code. */
export async function scoreConceptBeforeLaunch(
  brandId: string, workspaceId: string, input: PrelaunchInput,
): Promise<PrelaunchScore & { summary: string }> {
  const { stats, globalRate } = await jarvisStats(brandId, workspaceId);
  const score = prelaunchScore(input, stats, globalRate);
  return { ...score, summary: summarizePrelaunch(score) };
}

/** Vide le cache d'une marque · à appeler après un import ou un nouveau verdict. */
export function invalidateJarvisMemory(brandId: string): void {
  cache.delete(brandId);
}
