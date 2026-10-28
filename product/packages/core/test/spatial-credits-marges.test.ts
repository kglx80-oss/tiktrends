import { describe, expect, it } from 'vitest';
import { COST_MODEL, analyzePlanNet, ecranCreditsMarges, eurosParPalier, lectureRentabilite } from '../src';

const nb = (s: string) => s.replace(/ | /g, ' ');

describe('Spatial · Crédits & marges · règles', () => {
  it('euros par palier · millième sous 1 €, centime ensuite, entier dès 100 €', () => {
    expect([eurosParPalier(0.0123), eurosParPalier(33.3333), eurosParPalier(1234.5)].map(nb)).toEqual(['0,012 €', '33,33 €', '1 235 €']);
  });
  it('formules payantes seulement · mêmes calculs que le modèle économique', () => {
    const e = ecranCreditsMarges({ forfaits: [{ libelle: 'Starter', prix: 0, credits: 200 }, { libelle: 'Core', prix: 99, credits: 2000 }], markup: 3, taux: 0.25 });
    expect(e.operations.length).toBe(COST_MODEL.length);
    expect(e.nets.map((n) => n.forfait)).toEqual(['Core']);
    expect(e.nets[0]!.net).toBe(Math.round(analyzePlanNet('Core', 99, 2000, 3, 0.25).netEur));
    expect(e.risques.map((r) => r.forfait)).toEqual(['Core']);
  });
  it('la lecture vient des chiffres · saine, ou l’action fautive nommée avec ses formules', () => {
    expect(lectureRentabilite([])).toContain('Aucune formule payante');
    expect(lectureRentabilite([{ forfait: 'Core', plancher: 80, action: 'Vidéo', sain: true }])).toContain('tiennent 70 %');
    const l = lectureRentabilite([
      { forfait: 'Core', plancher: 30, action: 'Image', sain: false },
      { forfait: 'Plus', plancher: 50, action: 'Image', sain: false },
      { forfait: 'Business', plancher: 60, action: 'Vidéo', sain: false },
    ]);
    expect(l).toContain('3 formules sous 70 %');
    expect(l).toContain('« Image » (Core, Plus)');
  });
});
