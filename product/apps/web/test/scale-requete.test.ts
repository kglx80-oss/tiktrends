import { describe, it, expect } from 'vitest';
import { estMonoMarque, hoteRequete, plafondParMarque } from '../lib/scale-requete';

/**
 * « Ce qui scale » plafonnait à 3 créas/marque même pour l'analyse d'UN domaine ·
 * on ne voyait alors que ~10 créas de la marque visée. On distingue donc niche
 * (plafond) et marque unique (sans plafond).
 */
describe('la requête scale distingue niche et marque unique', () => {
  it('une URL ou un domaine = une marque', () => {
    expect(estMonoMarque('https://fincutmen.com/')).toBe(true);
    expect(estMonoMarque('fincutmen.com')).toBe(true);
    expect(estMonoMarque('gruns.co/collections')).toBe(true);
  });

  it('un mot de niche n’est pas une marque', () => {
    expect(estMonoMarque('café')).toBe(false);
    expect(estMonoMarque('compléments alimentaires')).toBe(false);
    expect(estMonoMarque('')).toBe(false);
  });

  it('extrait l’hôte nu', () => {
    expect(hoteRequete('https://www.fincutmen.com/')).toBe('fincutmen.com');
    expect(hoteRequete('fincutmen.com/path')).toBe('fincutmen.com');
  });

  it('lève le plafond en mono-marque, le garde en niche', () => {
    expect(plafondParMarque('fincutmen.com'), 'une marque unique doit tout montrer').toBeGreaterThan(3);
    expect(plafondParMarque('café')).toBe(3);
  });
});
