import { describe, it, expect } from 'vitest';
import { adsFromRows } from '../src/meta-insights';

/**
 * Perf par annonce (Radar live) · mapping des lignes Meta `level:'ad'`.
 *
 * Le point sensible · `daysActive`. L'agrégat 30 j ne porte pas l'âge réel de
 * l'annonce. Une version précédente le déduisait de la fenêtre (30 j pour
 * toutes) · le Radar coupe une créa à faible conv « si active depuis ≥ 7 j »,
 * donc TOUTE pub live passait pour vieille et devenait « À couper », même une
 * pub de trois jours. Le garde verrouille · `adsFromRows` ne fabrique jamais
 * d'ancienneté, elle reste `undefined` tant qu'on ne remonte pas la vraie date.
 */
const ligneVideo = {
  ad_id: 'a1', ad_name: 'Promo', spend: '80', impressions: '2000', clicks: '40', inline_link_clicks: '30',
  action_values: [{ action_type: 'omni_purchase', value: '240' }],
  actions: [{ action_type: 'omni_purchase', value: '6' }],
  video_3_sec_watched_actions: [{ action_type: 'video_view', value: '1200' }],
  video_p75_watched_actions: [{ action_type: 'video_view', value: '600' }],
};

describe('adsFromRows · perf par annonce', () => {
  it('mappe les métriques de base et la rétention vidéo', () => {
    const [a] = adsFromRows([ligneVideo]);
    expect(a).toBeTruthy();
    expect(a!.spend).toBe(80);
    expect(a!.impressions).toBe(2000);
    expect(a!.roas).toBe(3);          // 240 / 80
    expect(a!.purchases).toBe(6);
    expect(a!.hookRate).toBe(60);     // 1200 / 2000 · %
    expect(a!.holdRate).toBe(50);     // 600 / 1200 · %
  });

  it('n’invente jamais d’ancienneté · daysActive reste inconnu', () => {
    // Deux annonces d'âges réels différents · aucune ne doit recevoir une
    // ancienneté fabriquée (surtout pas la longueur de la fenêtre, 30 j).
    const perf = adsFromRows([
      ligneVideo,
      { ad_id: 'a2', ad_name: 'Autre', spend: '120', impressions: '5000' },
    ]);
    expect(perf.length).toBe(2);
    for (const a of perf) {
      expect(a.daysActive, `${a.name} · une ancienneté fabriquée désarmerait le garde « ≥ 7 jours » du Radar`).toBeUndefined();
    }
  });

  it('écarte les annonces sans dépense ni impression, garde le reste', () => {
    const perf = adsFromRows([
      { ad_name: 'vide' },                              // ni spend ni impressions → écartée
      { ad_name: 'vue seule', impressions: '500' },     // impressions seules → gardée
    ]);
    expect(perf.map((a) => a.name)).toEqual(['vue seule']);
  });

  it('tolère une entrée absente', () => {
    expect(adsFromRows(undefined)).toEqual([]);
    expect(adsFromRows([])).toEqual([]);
  });
});
