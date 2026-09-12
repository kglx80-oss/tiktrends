import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CreativeIntel } from '../app/(app)/analytics/CreativeIntel';
import { MetaKeyMetrics } from '../app/(app)/analytics/MetaKeyMetrics';
import type { MetaAdsInsights, MetaKpiSet } from '@tiktrends/integrations';

/**
 * Les barres proportionnées de l'Analytics passent par le composant partagé
 * `BarreValeur` (contrat progressbar + filet minimal), plus jamais par un
 * `<div style={{ width: N% }}>` écrit à la main · trois barres identiques dans
 * trois fichiers, chacune muette pour l'assistive et menteuse sur les petites
 * parts (une part de 1 % rendue à ~1 px, donc invisible).
 *
 * On éprouve le RÉSULTAT rendu, pas la présence d'un appel : on lit le HTML.
 */

/** Les largeurs de barre rendues, dans l'ordre du DOM. */
function largeurs(html: string): number[] {
  return [...html.matchAll(/width:(\d+)%/g)].map((m) => Number(m[1]));
}
/** Les valeurs d'accessibilité, dans l'ordre du DOM. */
function ariaValeurs(html: string): number[] {
  return [...html.matchAll(/aria-valuenow="(\d+)"/g)].map((m) => Number(m[1]));
}

describe('CreativeIntel · gabarits et tags en barres partagées', () => {
  // Un gros et un tout petit · le petit doit RESTER visible (filet minimal),
  // et le gros doit être plus large. Deux gabarits + deux tags = quatre barres.
  const stats = {
    score: 62,
    total: 40,
    templates: [
      { key: 'a', label: 'Gros', n: 100 },
      { key: 'b', label: 'Minuscule', n: 1 },
    ],
    tags: [
      { tag: 'gros', n: 80 },
      { tag: 'rare', n: 1 },
    ],
  };
  const html = renderToStaticMarkup(<CreativeIntel stats={stats} />);

  it('chaque barre est une progressbar accessible · plus de div nu', () => {
    // Quatre barres proportionnées (2 gabarits + 2 tags).
    expect((html.match(/role="progressbar"/g) ?? []).length).toBe(4);
  });

  it('la largeur reflète la part · le gros dépasse le petit', () => {
    const a = ariaValeurs(html);
    expect(a).toContain(100); // le max de son groupe → plein
    expect(a).toContain(1);   // la part de 1 % est bien exposée telle quelle
    expect(Math.max(...a)).toBeGreaterThan(Math.min(...a));
  });

  it('une part minuscule reste VISIBLE · filet minimal atteint l’écran', () => {
    // La part de 1 % (aria=1) ne se rend jamais à 1 % : le filet la relève à 3 %.
    const l = largeurs(html);
    const petites = l.filter((w) => w > 0 && w < 10);
    expect(petites.length, 'au moins une petite barre').toBeGreaterThan(0);
    for (const w of petites) expect(w).toBeGreaterThanOrEqual(3);
  });
});

describe('MetaKeyMetrics · le breakdown par plateforme en barres partagées', () => {
  const kpi: MetaKpiSet = {
    spend: 1000, revenue: 3000, purchases: 40, roas: 3, cpa: 25, aov: 75,
    impressions: 100000, clicks: 2000, linkClicks: 1500, cpcAll: 0.5, cpcLink: 0.66, cpm: 10, ctr: 2,
  };
  const insights: MetaAdsInsights = {
    currency: '€',
    window: kpi,
    previous: kpi,
    topAds: [],
    breakdowns: {
      platform: [
        { key: 'facebook', spend: 900, roas: 3, purchases: 30 },
        { key: 'instagram', spend: 9, roas: 2, purchases: 1 },
      ],
      ageGender: [],
    },
    spend30d: 1000, purchases30d: 40, revenue30d: 3000, roas30d: 3,
  };
  const html = renderToStaticMarkup(<MetaKeyMetrics insights={insights} syncedAt={null} />);

  it('le breakdown rend des progressbars · plus de div de largeur codé à la main', () => {
    expect((html.match(/role="progressbar"/g) ?? []).length).toBe(2);
  });

  it('la petite dépense reste visible · filet minimal', () => {
    // 9 / 900 = 1 % → aria 1, largeur relevée à 3 %.
    expect(ariaValeurs(html)).toContain(1);
    const petites = largeurs(html).filter((w) => w > 0 && w < 10);
    for (const w of petites) expect(w).toBeGreaterThanOrEqual(3);
  });
});
