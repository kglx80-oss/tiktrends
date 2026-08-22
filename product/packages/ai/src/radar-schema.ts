import { z } from 'zod';

/** Contrat de sortie Radar (CDC §5.6). */
export const Grade = z.enum(['A', 'B', 'C', 'D']);
export type Grade = z.infer<typeof Grade>;

export const Bucket = z.enum(['winner', 'high_potential', 'iteration', 'kill_candidate', 'fatigued', 'insufficient']);
export type Bucket = z.infer<typeof Bucket>;

export const Recommendation = z.object({
  priority: z.number().int().min(1).max(5),
  title: z.string(),
  rewritten_example: z.string(),
});

export const RadarScore = z.object({
  creative_id: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  grades: z.object({ hook: Grade, hold: Grade, ctr: Grade, conv: Grade, overall: Grade }),
  global_score: z.number(),
  bucket: Bucket,
  persona_detected: z.string().nullable(),
  diagnosis: z.array(z.string()),
  recommendations: z.array(Recommendation).max(5),
});
export type RadarScore = z.infer<typeof RadarScore>;
