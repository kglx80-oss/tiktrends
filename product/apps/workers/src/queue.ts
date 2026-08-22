import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

/** Files : ingestion, tagging, scoring (Radar), génération, crons. */
export const QUEUES = ['ingest', 'tag', 'radar', 'generate', 'cron'] as const;
export type QueueName = (typeof QUEUES)[number];

export const queues: Record<QueueName, Queue> = Object.fromEntries(
  QUEUES.map((n) => [n, new Queue(n, { connection })]),
) as Record<QueueName, Queue>;
