import { describe, it, expect } from 'vitest';
import { lireDemandeRendu, RATIOS_RENDU } from '@tiktrends/core/src/lectures-pures';

/**
 * Chantier L0 · les bornes d'une lecture, en règle pure (noyau).
 * Le pendant RÉSULTAT de ces règles vit dans `l0-lectures-pures.test.ts`
 * (handler appelé, 400 et zéro écriture).
 */
describe('lireDemandeRendu · seuls les formats connus passent', () => {
  it('sans paramètre · format de la recette, plein format', () => {
    expect(lireDemandeRendu(null, null)).toEqual({ ok: true, ratio: null, vignette: false });
    expect(lireDemandeRendu('', '')).toEqual({ ok: true, ratio: null, vignette: false });
  });
  it('chaque ratio proposé par le Studio passe, en plein et en vignette', () => {
    for (const r of RATIOS_RENDU) {
      expect(lireDemandeRendu(r, null)).toEqual({ ok: true, ratio: r, vignette: false });
      expect(lireDemandeRendu(r, '1')).toEqual({ ok: true, ratio: r, vignette: true });
    }
    expect(lireDemandeRendu(null, '0')).toEqual({ ok: true, ratio: null, vignette: false });
  });
  it('toute autre valeur est refusée · jamais rabattue sur un défaut', () => {
    for (const r of ['zzz', '4:5 ', '16:9', '4/5', '1:1x', ' ', '4:5;drop']) {
      expect(lireDemandeRendu(r, null).ok, `ratio « ${r} » accepté`).toBe(false);
    }
    for (const t of ['2', 'true', 'oui', ' 1']) expect(lireDemandeRendu(null, t).ok, `vignette « ${t} » acceptée`).toBe(false);
  });
});
