import { describe, expect, it } from 'vitest';
import { basculeMarqueNecessaire, nomSelecteurMarque } from '../src/bascule-marque';

describe('Bascule de marque · quand recharger, et le nom du sélecteur', () => {
  it('recharge seulement si la marque choisie diffère de l’active', () => {
    expect(basculeMarqueNecessaire('b', 'a')).toBe(true);
    expect(basculeMarqueNecessaire('a', 'a'), 'la marque active rechoisie recharge pour rien').toBe(false);
    expect(basculeMarqueNecessaire('', null), '« Toutes les marques » déjà actif recharge pour rien').toBe(false);
    expect(basculeMarqueNecessaire('', 'a')).toBe(true);
    expect(basculeMarqueNecessaire('a', null)).toBe(true);
  });
  it('le nom accessible porte la marque active en entier', () => {
    const long = 'Maison Lumière des Herboristes Associés · Collection Printemps-Été Édition Limitée';
    expect(nomSelecteurMarque(long)).toBe(`Marque active : ${long} · changer de marque`);
    expect(nomSelecteurMarque(null)).toBe('Marque active : toutes les marques · changer de marque');
  });
});
