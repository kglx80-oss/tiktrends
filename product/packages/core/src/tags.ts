/** Top Creative Tags — analyse par ingrédient créatif (CDC §2.2 / §F3).
 *  Transforme l'analyse par ad en analyse par dimension (persona × hook…). */
export interface TaggedCreative {
  id: string;
  spend: number;
  metric: number; // métrique cible (ROAS, CTR…)
  tags: Record<string, string[]>;
}
export interface TagStat { value: string; weightedMetric: number; spend: number; count: number; }
export interface MatrixCell { persona: string; hook: string; weightedMetric: number; spend: number; count: number; }

/** Par dimension : chaque valeur notée par la moyenne de la métrique pondérée par le spend. */
export function topCreativeTags(creatives: TaggedCreative[], dimension: string): TagStat[] {
  const agg = new Map<string, { num: number; spend: number; count: number }>();
  for (const c of creatives) {
    for (const v of c.tags[dimension] ?? []) {
      const a = agg.get(v) ?? { num: 0, spend: 0, count: 0 };
      a.num += c.metric * c.spend;
      a.spend += c.spend;
      a.count += 1;
      agg.set(v, a);
    }
  }
  return [...agg.entries()]
    .map(([value, a]) => ({ value, weightedMetric: a.spend > 0 ? a.num / a.spend : 0, spend: a.spend, count: a.count }))
    .sort((x, y) => y.weightedMetric - x.weightedMetric);
}

/** Matrice persona × hook : trouver la combinaison gagnante. */
export function personaHookMatrix(creatives: TaggedCreative[]): MatrixCell[] {
  const agg = new Map<string, { num: number; spend: number; count: number }>();
  for (const c of creatives) {
    for (const p of c.tags['persona'] ?? []) {
      for (const h of c.tags['hook_type'] ?? []) {
        const key = p + '||' + h;
        const a = agg.get(key) ?? { num: 0, spend: 0, count: 0 };
        a.num += c.metric * c.spend;
        a.spend += c.spend;
        a.count += 1;
        agg.set(key, a);
      }
    }
  }
  return [...agg.entries()]
    .map(([k, a]) => {
      const [persona, hook] = k.split('||');
      return { persona: persona ?? '', hook: hook ?? '', weightedMetric: a.spend > 0 ? a.num / a.spend : 0, spend: a.spend, count: a.count };
    })
    .sort((x, y) => y.weightedMetric - x.weightedMetric);
}
