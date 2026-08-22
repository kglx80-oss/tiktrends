/** Radar — scoring prescriptif (CDC §5.6). Logique pure, testable. */
export type Grade = 'A' | 'B' | 'C' | 'D';
export type Bucket = 'winner' | 'high_potential' | 'iteration' | 'kill_candidate' | 'fatigued' | 'insufficient';

export interface CreativeMetrics {
  id: string;
  spend: number;
  impressions: number;
  hookRate: number;   // v2s/impr (TikTok) ou v3s/impr (Meta)
  holdRate: number;   // v15s/v3s (ou p50/impr)
  ctr: number;        // clicks/impr
  convEff: number;    // ROAS si dispo, sinon 1/CPA
  frequency?: number;
  ctr7?: number; ctr14?: number; hook7?: number; hook14?: number;
  daysActive?: number;
  prevBucket?: Bucket;
}

export interface RadarResult {
  id: string;
  grades: { hook: Grade; hold: Grade; ctr: Grade; conv: Grade; overall: Grade };
  globalScore: number;
  bucket: Bucket;
  eligible: boolean;
}

export const ELIGIBLE_SPEND = 50;
export const ELIGIBLE_IMPRESSIONS = 1000;

const gradeValue = (g: Grade): number => (g === 'A' ? 4 : g === 'B' ? 3 : g === 'C' ? 2 : 1);

function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  const a = sortedAsc[lo] ?? 0, b = sortedAsc[hi] ?? a;
  return a + (b - a) * (idx - lo);
}

function gradeByPercentile(v: number, sortedAsc: number[]): Grade {
  const p75 = percentile(sortedAsc, 0.75), p50 = percentile(sortedAsc, 0.5), p25 = percentile(sortedAsc, 0.25);
  if (v >= p75) return 'A';
  if (v >= p50) return 'B';
  if (v >= p25) return 'C';
  return 'D';
}

// Seuils absolus de repli si < 8 créas éligibles (CDC §5.6).
const ABSOLUTE: Record<'tiktok' | 'meta', { hook: [number, number, number]; hold: number; ctr: number }> = {
  tiktok: { hook: [0.35, 0.25, 0.18], hold: 0.30, ctr: 0.012 },
  meta:   { hook: [0.30, 0.22, 0.16], hold: 0.25, ctr: 0.015 },
};
function gradeAbsolute(v: number, thresholds: [number, number, number]): Grade {
  if (v >= thresholds[0]) return 'A';
  if (v >= thresholds[1]) return 'B';
  if (v >= thresholds[2]) return 'C';
  return 'D';
}

function overallGrade(score: number): Grade {
  if (score >= 3.5) return 'A';
  if (score >= 2.75) return 'B';
  if (score >= 2.0) return 'C';
  return 'D';
}

function bucketOf(r: RadarResult['grades'], score: number, m: CreativeMetrics): Bucket {
  const noA = r.hook !== 'A' && r.hold !== 'A' && r.ctr !== 'A' && r.conv !== 'A';
  // Fatigue : winner/high_potential précédent + déclin > 20 % + fréquence >= 2.5
  const decline =
    (m.ctr7 != null && m.ctr14 != null && m.ctr14 > 0 && m.ctr7 / m.ctr14 <= 0.8) ||
    (m.hook7 != null && m.hook14 != null && m.hook14 > 0 && m.hook7 / m.hook14 <= 0.8);
  if ((m.prevBucket === 'winner' || m.prevBucket === 'high_potential') && decline && (m.frequency ?? 0) >= 2.5) return 'fatigued';
  if ((r.conv === 'A' || r.conv === 'B') && score >= 3.2) return 'winner';
  if ((r.hook === 'A' && (r.conv === 'C' || r.conv === 'D')) || (r.conv === 'A' && (r.hook === 'C' || r.hook === 'D'))) return 'high_potential';
  if (r.conv === 'D' && (m.daysActive ?? 0) >= 7) return 'kill_candidate';
  if (score >= 2.0 && score < 3.2 && noA) return 'iteration';
  return 'iteration';
}

export function computeRadar(creatives: CreativeMetrics[], platform: 'tiktok' | 'meta' = 'tiktok'): RadarResult[] {
  const eligible = creatives.filter((c) => c.spend >= ELIGIBLE_SPEND && c.impressions >= ELIGIBLE_IMPRESSIONS);
  const usePercentile = eligible.length >= 8;
  const asc = (f: (c: CreativeMetrics) => number) => eligible.map(f).sort((a, b) => a - b);
  const Sh = asc((c) => c.hookRate), Sd = asc((c) => c.holdRate), Sc = asc((c) => c.ctr), Sv = asc((c) => c.convEff);

  return creatives.map((c) => {
    if (c.spend < ELIGIBLE_SPEND || c.impressions < ELIGIBLE_IMPRESSIONS) {
      return { id: c.id, grades: { hook: 'D', hold: 'D', ctr: 'D', conv: 'D', overall: 'D' }, globalScore: 0, bucket: 'insufficient', eligible: false };
    }
    const abs = ABSOLUTE[platform];
    const hook = usePercentile ? gradeByPercentile(c.hookRate, Sh) : gradeAbsolute(c.hookRate, abs.hook);
    const hold = usePercentile ? gradeByPercentile(c.holdRate, Sd) : gradeAbsolute(c.holdRate, [abs.hold, abs.hold * 0.8, abs.hold * 0.6]);
    const ctr = usePercentile ? gradeByPercentile(c.ctr, Sc) : gradeAbsolute(c.ctr, [abs.ctr, abs.ctr * 0.75, abs.ctr * 0.5]);
    const conv = gradeByPercentile(c.convEff, Sv); // conv toujours relatif au compte
    const score = 0.4 * gradeValue(conv) + 0.25 * gradeValue(hook) + 0.2 * gradeValue(hold) + 0.15 * gradeValue(ctr);
    const grades = { hook, hold, ctr, conv, overall: overallGrade(score) };
    return { id: c.id, grades, globalScore: Number(score.toFixed(3)), bucket: bucketOf(grades, score, c), eligible: true };
  });
}
