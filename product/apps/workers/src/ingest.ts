import { Worker } from 'bullmq';
import { connection } from './queue';
import { normalizeTikTokAd, normalizeMetaAd } from '@tiktrends/integrations';
import { dedupeCreatives, aggregateCreativeMetrics } from '@tiktrends/core';

/** Ingestion : payload plateforme -> normalisation -> dédup -> agrégation.
 *  (L'upsert DB via @tiktrends/db arrive avec l'accès API réel.) */
export function startIngestWorker() {
  return new Worker(
    'ingest',
    async (job) => {
      const { platform, ads } = job.data as { platform: 'tiktok' | 'meta'; ads: unknown[] };
      const norm = ads.map((a) => (platform === 'tiktok' ? normalizeTikTokAd(a as never) : normalizeMetaAd(a as never)));
      const creatives = dedupeCreatives(norm.map((n) => n.creative));
      const metrics = aggregateCreativeMetrics(norm.flatMap((n) => n.metrics), platform);
      // TODO: upsert creatives / ad_instances / metrics_daily, puis enfiler 'radar'.
      return { creatives: creatives.length, creativeMetrics: metrics.length };
    },
    { connection },
  );
}
