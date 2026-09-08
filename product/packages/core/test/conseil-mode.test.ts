import { describe, expect, it } from 'vitest';
import { conseilMode, SEUIL_ENTIERE_FIABLE, type SignalFiabiliteEntiere } from '../src/conseil-mode';
import { MIN_RELECTURES } from '../src/adsmap/bilan-copie';

/**
 * Le mode par défaut suit la mesure, ou reste l'entière.
 *
 * La discipline de la carte · un minimum d'effectif, et la borne basse de Wilson
 * au-dessus d'un seuil plutôt qu'à zéro · l'entière se trompe parfois partout, et
 * basculer au moindre raté priverait des marques d'un mode qui marche pour elles.
 */

const sig = (o: Partial<SignalFiabiliteEntiere>): SignalFiabiliteEntiere => ({
  relues: o.relues ?? 0, accroche: o.accroche ?? 0,
  avecReference: o.avecReference ?? 0, produitsInfideles: o.produitsInfideles ?? 0,
  avecTexte: o.avecTexte ?? 0, illisibles: o.illisibles ?? 0,
});

describe('le mode par défaut', () => {
  it('sans mesure suffisante, reste l’entière · une marque neuve y a droit', () => {
    const c = conseilMode(sig({ relues: MIN_RELECTURES - 1, accroche: MIN_RELECTURES - 1 }));
    expect(c.defaut).toBe('entiere');
    expect(c.mesure).toBe(false);
    expect(c.motif).toBe('');
  });

  it('une entière fiable reste le défaut', () => {
    // Peu d'écarts sur un bon effectif · l'entière marche ici, on ne bascule pas.
    const c = conseilMode(sig({ relues: 30, accroche: 2, avecReference: 30, produitsInfideles: 1, avecTexte: 30, illisibles: 1 }));
    expect(c.defaut).toBe('entiere');
    expect(c.mesure).toBe(false);
  });

  it('une accroche mesurément réécrite bascule en composée, annoncé', () => {
    const c = conseilMode(sig({ relues: 20, accroche: 12 }));
    expect(c.defaut).toBe('composee');
    expect(c.mesure).toBe(true);
    expect(c.motif).toContain('accroches réécrites');
    expect(c.motif).toContain('composée');
  });

  it('un produit mesurément infidèle bascule aussi', () => {
    const c = conseilMode(sig({ relues: 20, avecReference: 20, produitsInfideles: 12 }));
    expect(c.defaut).toBe('composee');
    expect(c.motif).toContain('produits infidèles');
  });

  it('on compare à un seuil, pas à zéro · un écart faible ne bascule pas', () => {
    // 3 accroches réécrites sur 30 (10 %) · sous le seuil, l'entière tient.
    const c = conseilMode(sig({ relues: 30, accroche: 3 }));
    expect(c.defaut).toBe('entiere');
  });

  it('le motif nomme le PIRE écart installé', () => {
    const c = conseilMode(sig({
      relues: 20, accroche: 10,
      avecTexte: 20, illisibles: 16,
    }));
    // Illisible (80 %) est pire que l'accroche (50 %) · c'est lui qu'on nomme.
    expect(c.motif).toContain('texte illisible');
  });

  it('le seuil est bas mais non nul', () => {
    expect(SEUIL_ENTIERE_FIABLE).toBeGreaterThan(0);
    expect(SEUIL_ENTIERE_FIABLE).toBeLessThan(0.5);
  });
});
