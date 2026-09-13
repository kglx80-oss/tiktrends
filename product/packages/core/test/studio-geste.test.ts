import { describe, expect, it } from 'vitest';
import { prochainGesteStudio } from '../src/studio-geste';

/**
 * Le « prochain geste » du hub Studio ne renvoie JAMAIS vers un studio · ce
 * serait dédoubler la carte du studio, déjà présente dans la grille. Il porte
 * toujours sur la mesure (Adsmap), ou rien.
 */
describe('prochainGesteStudio · jamais un CTA qui dédouble une carte studio', () => {
  it('marque neuve · rien à juger ⇒ pas de bandeau (la carte Pubs IA suffit)', () => {
    expect(prochainGesteStudio({ jugees: 0, enAttente: 0 })).toBeNull();
    // Lectures échouées · on ne devine pas un geste, on n'affiche rien.
    expect(prochainGesteStudio({ jugees: null, enAttente: null })).toBeNull();
    // Rien produit, rien en attente · aucun bandeau vers /studio/ads.
    expect(prochainGesteStudio({ jugees: null, enAttente: 0 })).toBeNull();
  });

  it('des créas attendent un verdict ⇒ va juger (lots), pas ouvrir un studio', () => {
    const g = prochainGesteStudio({ jugees: 0, enAttente: 3 });
    expect(g?.href).toBe('/adsmap/lots');
  });

  it('des verdicts existent ⇒ itère (suites), pas ouvrir un studio', () => {
    const g = prochainGesteStudio({ jugees: 5, enAttente: 0 });
    expect(g?.href).toBe('/adsmap/suites');
  });

  it('INVARIANT · quel que soit l’état, le geste ne pointe jamais vers /studio', () => {
    for (const jugees of [null, 0, 1, 40]) {
      for (const enAttente of [null, 0, 1, 12]) {
        const g = prochainGesteStudio({ jugees, enAttente });
        if (g) {
          expect(g.href.startsWith('/studio'), `état {jugees:${jugees}, enAttente:${enAttente}} renvoie vers un studio · CTA dédoublé`).toBe(false);
          expect(g.href.startsWith('/adsmap'), 'le geste doit porter sur la mesure').toBe(true);
        }
      }
    }
  });
});
