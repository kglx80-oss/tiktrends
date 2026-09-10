import { describe, it, expect } from 'vitest';
import { chromeCoquille } from '../lib/chrome-coquille';

/**
 * La géométrie de la coquille. Le défaut : un rail de 250px fixes qui, sur un
 * téléphone, mangeait l'écran. La règle doit garder le desktop INTACT et faire
 * du rail un tiroir sur mobile.
 */
describe('la coquille adapte sa géométrie à la largeur', () => {
  it('desktop · deux colonnes, rail collé et visible, pas de hamburger', () => {
    const c = chromeCoquille({ mobile: false, collapsed: false, drawerOuvert: false });
    expect(c.colonnes).toBe('250px minmax(0,1fr)');
    expect(c.railTiroir).toBe(false);
    expect(c.railVisible).toBe(true);
    expect(c.hamburger).toBe(false);
    expect(c.voile).toBe(false);
  });

  it('desktop replié · le rail en barre d’icônes (72px), géométrie inchangée sinon', () => {
    const c = chromeCoquille({ mobile: false, collapsed: true, drawerOuvert: false });
    expect(c.colonnes).toBe('72px minmax(0,1fr)');
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
