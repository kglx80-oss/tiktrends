import { describe, expect, it } from 'vitest';
import { termeDecouverte, decouvertes } from '../src/decouverte-marche';
import { PROVEN_DAYS } from '../src/adsmap/market-stats';
import type { RadarCandidate } from '../src/adsmap/radar';

/**
 * La découverte · ce que la veille te trouve hors de ta watchlist.
 *
 * Ce qu'on éprouve · qu'elle ne remonte que l'ÉPROUVÉ, jamais ce que tu vois ou
 * suis déjà, et qu'un seul annonceur n'occupe pas la liste.
 */

const cand = (o: Partial<RadarCandidate> & { externalId: string }): RadarCandidate => ({
  advertiser: o.advertiser ?? 'Marque',
  daysRunning: o.daysRunning ?? 0,
  reachDelta30d: o.reachDelta30d ?? null,
  liveAdsCount: o.liveAdsCount ?? null,
  format: o.format ?? null,
  hasImage: o.hasImage ?? true,
  hasText: o.hasText ?? true,
  externalId: o.externalId,
});

const VIDE = { connus: new Set<string>(), suivis: new Set<string>() };

describe('termeDecouverte', () => {
  it('prend la catégorie, nettoyée', () => {
    expect(termeDecouverte({ category: '  Matelas  ' })).toBe('Matelas');
  });
  it('rien à chercher sans catégorie exploitable', () => {
    // Sans catégorie, on ne devine pas le secteur depuis le nom · chercher la
    // marque ne ramènerait qu'elle. Sous 3 caractères, un terme ratisse tout.
    expect(termeDecouverte({ category: null })).toBeNull();
    expect(termeDecouverte({ category: 'x' })).toBeNull();
  });
});

describe('ne remonte que l’éprouvé', () => {
  it('écarte une créa qui n’a rien prouvé', () => {
    const out = decouvertes([cand({ externalId: 'jeune', daysRunning: 3 })], VIDE);
    expect(out).toHaveLength(0);
  });
  it('garde une créa qui tient depuis le seuil', () => {
    const out = decouvertes([cand({ externalId: 'vieille', daysRunning: PROVEN_DAYS })], VIDE);
    expect(out.map((c) => c.externalId)).toEqual(['vieille']);
  });
});

describe('ce que tu connais déjà n’est pas une découverte', () => {
  it('déduplique ce qui est déjà en base', () => {
    const out = decouvertes(
      [cand({ externalId: 'connue', daysRunning: 40 }), cand({ externalId: 'neuve', daysRunning: 40 })],
      { connus: new Set(['connue']), suivis: new Set() },
    );
    expect(out.map((c) => c.externalId)).toEqual(['neuve']);
  });

  it('exclut les annonceurs déjà suivis, quelle que soit la casse', () => {
    // Une découverte est ce que tu ne surveilles pas · un annonceur suivi qui
    // remonte ici n'apprend rien de neuf.
    const out = decouvertes(
      [cand({ externalId: 'a', advertiser: 'Emma', daysRunning: 40 }), cand({ externalId: 'b', advertiser: 'Nouveau', daysRunning: 40 })],
      { connus: new Set(), suivis: new Set(['emma']) },
    );
    expect(out.map((c) => c.externalId)).toEqual(['b']);
  });
});

describe('un annonceur n’occupe pas la liste', () => {
  it('plafonne à trois créas par annonceur', () => {
    const lot = [1, 2, 3, 4, 5].map((i) => cand({ externalId: `e${i}`, advertiser: 'Prolifique', daysRunning: 40 }));
    const out = decouvertes(lot, VIDE);
    expect(out).toHaveLength(3);
  });

  it('classe le prouvé avant le simple volume', () => {
    const proven = cand({ externalId: 'proven', advertiser: 'A', daysRunning: PROVEN_DAYS });
    const scaling = cand({ externalId: 'scaling', advertiser: 'B', daysRunning: 8, liveAdsCount: 20 });
    const out = decouvertes([scaling, proven], VIDE);
    expect(out[0]!.externalId, 'la survie prime sur le volume').toBe('proven');
  });
});
