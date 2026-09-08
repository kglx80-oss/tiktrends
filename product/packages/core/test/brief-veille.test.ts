import { describe, expect, it } from 'vitest';
import { briefDepuisVeille } from '../src/brief-veille';
import { PROVEN_DAYS } from '../src/adsmap/market-stats';

/**
 * Le brief qui arme le studio depuis la veille.
 *
 * Ce qu'on éprouve · qu'il DIRIGE (un angle, pas du vide), qu'il tient dans la
 * borne du studio, qu'il se présente comme une adaptation et non une copie, et
 * qu'il ne dit « éprouvée » que quand la survie le prouve.
 */

describe('le brief dirige, ou ne se propose pas', () => {
  it('sans matière (ni texte ni CTA), pas de brief', () => {
    // Un « reprends l'angle » générique ne dirige rien · mieux vaut ne pas
    // proposer le geste que le proposer vide.
    expect(briefDepuisVeille({})).toBeNull();
    expect(briefDepuisVeille({ body: '   ' })).toBeNull();
  });

  it('tient dans la borne d’angle du studio (300)', () => {
    // Le studio tronque à 300 · un brief plus long finirait coupé en pleine
    // phrase, sans l'instruction d'adaptation qui vit à la fin.
    const long = 'a'.repeat(1000);
    const b = briefDepuisVeille({ body: long, callToAction: 'Shop Now', daysRunning: 40 })!;
    expect(b.angle.length).toBeLessThanOrEqual(300);
    expect(b.angle, 'l’instruction d’adaptation doit survivre à la borne').toContain('nos mots');
  });

  it('se présente comme une adaptation, jamais une copie', () => {
    const b = briefDepuisVeille({ body: 'La seule crème qui tient 24 h', daysRunning: 30 })!;
    expect(b.angle).toContain('NOTRE version');
    expect(b.angle).toContain('ne recopie aucune phrase');
  });
});

describe('la survie est le seul vote crédible', () => {
  it('au-delà du seuil, la pub est « éprouvée »', () => {
    const b = briefDepuisVeille({ body: 'x', daysRunning: PROVEN_DAYS })!;
    expect(b.eprouvee).toBe(true);
    expect(b.angle).toContain('éprouvée');
    expect(b.angle).toContain(`${PROVEN_DAYS} j`);
  });

  it('sous le seuil, c’est une veille, pas une preuve', () => {
    // Une pub de 10 jours n'a rien prouvé · un annonceur qui lance n'a que
    // dépensé. Le dire « éprouvée » vendrait un pari pour une preuve.
    const b = briefDepuisVeille({ body: 'x', daysRunning: PROVEN_DAYS - 1 })!;
    expect(b.eprouvee).toBe(false);
    expect(b.angle).toContain('repérée en veille');
  });
});
