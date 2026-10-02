import { describe, expect, it } from 'vitest';
import { basculeMarqueNecessaire, nomSelecteurMarque, rectangleALecran } from '../src/bascule-marque';

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

describe('Retour de focus · le sélecteur doit être à l’écran', () => {
  const r = (left: number, top: number, w = 160, h = 44) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });
  it('dans le rail ouvert · à l’écran', () => { expect(rectangleALecran(r(12, 110), 1280, 720)).toBe(true); });
  it('dans le tiroir fermé à 390 (mesuré x = −172) · hors écran', () => { expect(rectangleALecran(r(-172, 110, 160), 390, 844)).toBe(false); });
  it('non rendu (0 × 0) · hors écran', () => { expect(rectangleALecran(r(0, 0, 0, 0), 390, 844)).toBe(false); });
});
