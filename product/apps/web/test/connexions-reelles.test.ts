import { describe, expect, it } from 'vitest';
import { CONNECTEURS_DISPONIBLES, CONNEXIONS_REELLES } from '@tiktrends/core';

/**
 * Les connexions réelles du noyau sont celles que l'écran Connexions déclare
 * branchables. Le composant `LogoMarque` de l'ancienne interface (bande
 * « Connecté » de la fiche V5) est retiré avec elle · l'écran Spatial compte
 * ses branchables sur `CONNECTEURS_DISPONIBLES`.
 */
describe('la liste du noyau est celle des écrans', () => {
  it('CONNEXIONS_REELLES = ce que l’écran Connexions déclare branchable', () => {
    expect(Object.values(CONNEXIONS_REELLES), 'le noyau et l’écran Connexions divergent sur les connexions réelles').toEqual([...CONNECTEURS_DISPONIBLES]);
  });
});
