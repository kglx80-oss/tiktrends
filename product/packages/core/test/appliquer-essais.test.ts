import { describe, expect, it } from 'vitest';
import { appliquerEssais, layoutsForBatchFavori } from '../src/appliquer-essais';
import { AD_LAYOUTS, layoutsForBatch, type AdLayout } from '../src/ad-layouts';
import type { CumulEssais, LigneCumul } from '../src/adsmap/essai-resultat';

const ligne = (valeur: string, victoires: number, participations: number, gagne = false): LigneCumul =>
  ({ valeur, participations, victoires, taux: participations ? victoires / participations : null, interval: null, gagne });

const cumul = (o: Partial<CumulEssais> = {}): CumulEssais => ({
  variable: 'mise_en_page', essais: 8, lignes: [], hasard: 0.25, conclusif: true, resume: '', ...o,
});

describe('les essais l’emportent sur les taux', () => {
  it('désigne un favori quand un bras s’est détaché', () => {
    const d = appliquerEssais({
      cumul: cumul({ lignes: [ligne('affiche', 6, 8, true), ligne('immersif', 2, 8)] }),
      // Des taux qui diraient l'inverse · les essais sont appariés, pas eux.
      rates: [{ layout: 'affiche', nConclusive: 20, hitRate: 0.01 }],
      globalRate: 0.5,
    });
    expect(d.source).toBe('essais');
    expect(d.favori).toBe('affiche');
    expect(d.ecartees).not.toContain('affiche');
  });

  it('retombe sur les taux quand aucun essai n’a tranché', () => {
    const d = appliquerEssais({
      cumul: cumul({ conclusif: false }),
      rates: [{ layout: 'champ', nConclusive: 10, hitRate: 0.02 }],
      globalRate: 0.5,
    });
    expect(d.source).toBe('taux');
    expect(d.ecartees).toEqual(['champ']);
    expect(d.favori).toBeNull();
    // On dit que la preuve est plus faible · sinon on la croit aussi solide.
    expect(d.resume).toContain('non appariée');
  });

  it('se tait quand rien ne parle', () => {
    const d = appliquerEssais({});
    expect(d.source).toBe('aucune');
    expect(d.resume).toBe('');
    expect(d.ecartees).toEqual([]);
  });

  it('ignore un cumul portant sur une autre variable', () => {
    const d = appliquerEssais({ cumul: cumul({ variable: 'univers', lignes: [ligne('studio', 8, 8, true)] }) });
    expect(d.source).toBe('aucune');
  });
});

describe('écarter reste sévère', () => {
  it('n’écarte que ce qui n’a JAMAIS gagné, sur assez d’essais', () => {
    const d = appliquerEssais({
      cumul: cumul({ essais: 8, lignes: [ligne('affiche', 8, 8, true), ligne('champ', 0, 8), ligne('split', 1, 8)] }),
    });
    expect(d.ecartees).toEqual(['champ']);
    expect(d.ecartees).not.toContain('split');
  });

  it('n’écarte rien sous cinq essais', () => {
    const d = appliquerEssais({
      cumul: cumul({ essais: 4, lignes: [ligne('affiche', 4, 4, true), ligne('champ', 0, 4)] }),
    });
    expect(d.ecartees).toEqual([]);
    expect(d.favori).toBe('affiche');
  });

  it('garde toujours deux coquilles en lice', () => {
    // Sinon le lot redevient quatre fois la même image · au nom d'une mesure,
    // ce qui la rendrait plus difficile à contester.
    const d = appliquerEssais({
      cumul: cumul({
        essais: 9,
        lignes: [ligne('affiche', 9, 9, true), ...AD_LAYOUTS.filter((l) => l !== 'affiche').map((l) => ligne(l, 0, 9))],
      }),
    });
    expect(AD_LAYOUTS.length - d.ecartees.length).toBeGreaterThanOrEqual(2);
    expect(d.ecartees).not.toContain('affiche');
  });

  it('ne dépend pas de l’ordre des lignes reçues', () => {
    const lignes = [ligne('affiche', 9, 9, true), ...AD_LAYOUTS.filter((l) => l !== 'affiche').map((l) => ligne(l, 0, 9))];
    const a = appliquerEssais({ cumul: cumul({ essais: 9, lignes }) });
    const b = appliquerEssais({ cumul: cumul({ essais: 9, lignes: [...lignes].reverse() }) });
    expect(a.ecartees).toEqual(b.ecartees);
  });
});

describe('appliquer n’est pas figer', () => {
  it('le favori prend une place de plus, jamais toutes', () => {
    for (const n of [2, 3, 4, 8]) {
      const lot = layoutsForBatchFavori(n, 0, AD_LAYOUTS, 'affiche');
      expect(lot.length, `n=${n}`).toBe(n);
      expect(new Set(lot).size, `n=${n} · un lot uniforme ne compare plus rien`).toBeGreaterThanOrEqual(2);
    }
  });

  it('augmente l’exposition du favori, quel que soit le point de départ', () => {
    // La première version posait le favori en tête et laissait la rotation
    // remplir le reste · elle ne repasse jamais par lui, et le favori gardait
    // UNE place. « Appliquer ce qui a gagné » ne s'appliquait pas.
    for (let seed = 0; seed < 6; seed++) {
      for (const n of [3, 4, 8]) {
        const sans = layoutsForBatch(n, seed, AD_LAYOUTS).filter((l) => l === 'affiche').length;
        const avec = layoutsForBatchFavori(n, seed, AD_LAYOUTS, 'affiche').filter((l) => l === 'affiche').length;
        expect(avec, `n=${n} seed=${seed}`).toBeGreaterThan(sans);
      }
    }
  });

  it('ne dépasse jamais la moitié du lot', () => {
    for (const n of [2, 3, 4, 8]) {
      const lot = layoutsForBatchFavori(n, 0, AD_LAYOUTS, 'affiche');
      expect(lot.filter((l) => l === 'affiche').length, `n=${n}`).toBeLessThanOrEqual(Math.ceil(n / 2));
    }
  });

  it('sans favori, rend exactement la rotation d’avant', () => {
    // Aucune décision non prise ne doit changer un rendu.
    for (let seed = 0; seed < 6; seed++) {
      expect(layoutsForBatchFavori(4, seed, AD_LAYOUTS, null)).toEqual(layoutsForBatch(4, seed, AD_LAYOUTS));
    }
  });

  it('ignore un favori absent du vivier', () => {
    const vivier: AdLayout[] = ['immersif', 'champ'];
    expect(layoutsForBatchFavori(3, 1, vivier, 'affiche')).toEqual(layoutsForBatch(3, 1, vivier));
  });

  it('un lot d’une seule pub reste la rotation', () => {
    // Une place de plus n'a aucun sens quand il n'y a qu'une place.
    expect(layoutsForBatchFavori(1, 0, AD_LAYOUTS, 'affiche')).toEqual(layoutsForBatch(1, 0, AD_LAYOUTS));
  });

  it('rend toujours le nombre demandé', () => {
    for (const n of [0, 1, 2, 3, 4, 8]) {
      expect(layoutsForBatchFavori(n, 3, AD_LAYOUTS, 'affiche').length).toBe(n);
    }
  });
});
