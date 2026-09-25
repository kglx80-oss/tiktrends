import { describe, it, expect } from 'vitest';
import { chromeCoquille, RAIL_DEVELOPPE, RAIL_REDUIT } from '../lib/chrome-coquille';

/**
 * La géométrie de la coquille. Le rail suit la direction validée (design.md § 5)
 * · 184px développé, 64px réduit, replier libère 120px. Desktop INTACT, tiroir
 * sur mobile.
 */
describe('la coquille adapte sa géométrie à la largeur', () => {
  it('les largeurs suivent la charte · 184 / 64, delta de 120px', () => {
    expect(RAIL_DEVELOPPE).toBe(184);
    expect(RAIL_REDUIT).toBe(64);
    expect(RAIL_DEVELOPPE - RAIL_REDUIT).toBe(120);
  });

  it('desktop · deux colonnes (184px), rail collé et visible, pas de hamburger', () => {
    const c = chromeCoquille({ mobile: false, collapsed: false, drawerOuvert: false });
    expect(c.colonnes).toBe('184px minmax(0,1fr)');
    expect(c.railTiroir).toBe(false);
    expect(c.railVisible).toBe(true);
    expect(c.hamburger).toBe(false);
    expect(c.voile).toBe(false);
  });

  it('desktop replié · le rail en barre d’icônes (64px), géométrie inchangée sinon', () => {
    const c = chromeCoquille({ mobile: false, collapsed: true, drawerOuvert: false });
    expect(c.colonnes).toBe('64px minmax(0,1fr)');
    expect(c.railTiroir).toBe(false);
  });

  it('mobile fermé · une colonne, rail en tiroir HORS écran, hamburger visible', () => {
    const c = chromeCoquille({ mobile: true, collapsed: false, drawerOuvert: false });
    expect(c.colonnes).toBe('1fr');
    expect(c.railTiroir).toBe(true);
    expect(c.railVisible, 'le rail ne doit pas manger l’écran tant qu’on ne l’ouvre pas').toBe(false);
    expect(c.hamburger).toBe(true);
    expect(c.voile).toBe(false);
  });

  it('mobile ouvert · le rail à l’écran, un voile pour le refermer', () => {
    const c = chromeCoquille({ mobile: true, collapsed: false, drawerOuvert: true });
    expect(c.railVisible).toBe(true);
    expect(c.voile).toBe(true);
  });
});
