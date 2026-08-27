import { describe, it, expect } from 'vitest';
import { toDailyRow, toAdsetInfo } from '../src/meta-daily';

/**
 * Meta renvoie plusieurs variantes du même événement dans `actions`
 * (`purchase`, `omni_purchase`, `offsite_conversion.fb_pixel_purchase`).
 * Les additionner compterait un achat deux ou trois fois · c'est l'erreur qui
 * ferait passer une ad perdante pour une gagnante.
 */

const ligne = (o: Record<string, unknown> = {}) => ({
  ad_id: 'a1', ad_name: 'TF_B04_v1_HOOK', adset_id: 's1', adset_name: 'Set 1',
  campaign_id: 'c1', campaign_name: '[ADSMAP] TEST TrueFords B4', date_start: '2026-08-20',
  spend: '140.5', impressions: '20000', reach: '15000', clicks: '400', inline_link_clicks: '300',
  ...o,
});

describe('lignes quotidiennes', () => {
  it('lit les champs de base', () => {
    const r = toDailyRow(ligne())!;
    expect(r.adId).toBe('a1');
    expect(r.date).toBe('2026-08-20');
    expect(r.spend).toBeCloseTo(140.5, 2);
    expect(r.adsetId).toBe('s1');
    expect(r.campaignName).toBe('[ADSMAP] TEST TrueFords B4');
  });

  it('ne compte un achat qu’UNE fois malgré les variantes', () => {
    const r = toDailyRow(ligne({
      actions: [
        { action_type: 'purchase', value: '6' },
        { action_type: 'omni_purchase', value: '6' },
        { action_type: 'offsite_conversion.fb_pixel_purchase', value: '6' },
      ],
    }))!;
    expect(r.purchases).toBe(6);   // et non 18
  });

  it('retombe sur la variante disponible quand la préférée manque', () => {
    const r = toDailyRow(ligne({ actions: [{ action_type: 'purchase', value: '3' }] }))!;
    expect(r.purchases).toBe(3);
  });

  it('lit les paliers vidéo, y compris thruplay', () => {
    const r = toDailyRow(ligne({
      video_3_sec_watched_actions: [{ action_type: 'video_view', value: '6500' }],
      video_thruplay_watched_actions: [{ action_type: 'video_view', value: '2500' }],
      video_p50_watched_actions: [{ action_type: 'video_view', value: '3000' }],
      video_p100_watched_actions: [{ action_type: 'video_view', value: '900' }],
    }))!;
    expect(r.video3s).toBe(6500);
    expect(r.thruplays).toBe(2500);
    expect(r.videoP50).toBe(3000);
    expect(r.videoP100).toBe(900);
  });

  it('une créa statique n’a aucun palier vidéo, sans planter', () => {
    const r = toDailyRow(ligne())!;
    expect(r.video3s).toBe(0);
    expect(r.thruplays).toBe(0);
  });

  it('lit vues de page et ajouts au panier · nécessaires au diagnostic CONVERT', () => {
    const r = toDailyRow(ligne({
      actions: [
        { action_type: 'landing_page_view', value: '250' },
        { action_type: 'omni_add_to_cart', value: '40' },
      ],
    }))!;
    expect(r.landingViews).toBe(250);
    expect(r.addToCart).toBe(40);
  });

  it('rejette une ligne sans annonce ou sans date · rien à rattacher', () => {
    expect(toDailyRow({ date_start: '2026-08-20' })).toBeNull();
    expect(toDailyRow({ ad_id: 'a1' })).toBeNull();
  });

  it('ne rend jamais NaN sur des champs absents ou vides', () => {
    const r = toDailyRow({ ad_id: 'a1', date_start: '2026-08-20', spend: '' })!;
    for (const v of Object.values(r)) {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('ad sets', () => {
  it('convertit les budgets depuis les centimes', () => {
    const a = toAdsetInfo({ id: 's1', name: 'Set 1', daily_budget: '2000' })!;
    expect(a.dailyBudget).toBe(20);
  });

  it('repère le CBO au budget porté par la campagne', () => {
    const a = toAdsetInfo({ id: 's1', campaign: { daily_budget: '10000' } })!;
    expect(a.campaignBudgetOptimization).toBe(true);
    expect(a.dailyBudget).toBeNull();
  });

  it('un ad set à budget propre n’est pas en CBO', () => {
    const a = toAdsetInfo({ id: 's1', daily_budget: '2000' })!;
    expect(a.campaignBudgetOptimization).toBe(false);
  });

  it('un budget absent vaut null, pas zéro · l’ignorer et le mesurer diffèrent', () => {
    expect(toAdsetInfo({ id: 's1' })!.dailyBudget).toBeNull();
    expect(toAdsetInfo({ id: 's1', daily_budget: '0' })!.dailyBudget).toBeNull();
  });

  it('rejette un ad set sans identifiant', () => {
    expect(toAdsetInfo({ name: 'x' })).toBeNull();
  });
});
