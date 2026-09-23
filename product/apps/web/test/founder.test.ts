import { afterEach, describe, it, expect } from 'vitest';
import { isFounder } from '../lib/founder';

/**
 * Les fondateurs de la plateforme sont reconnus SANS dépendre de l'environnement
 * du VPS · c'est ce qui débloque l'accès complet par simple déploiement, là où un
 * `.env.deploy` ne prenait pas (le process ne le rechargeait pas). L'accès
 * fondateur ouvre la vue plateforme ET, via `effectiveAccess`, tout le produit
 * quel que soit le plan · on vérifie donc que la liste est EXACTE : les deux
 * fondateurs oui, n'importe qui d'autre non (pas de sur-attribution).
 */

afterEach(() => { delete process.env.FOUNDER_EMAILS; });

describe('fondateurs · reconnus par le code, liste exacte', () => {
  it('kguilbaux et marine sont fondateurs même sans FOUNDER_EMAILS', () => {
    delete process.env.FOUNDER_EMAILS;
    expect(isFounder('kguilbaux@agence-glx.fr')).toBe(true);
    expect(isFounder('marine@agence-melie.fr')).toBe(true);
  });

  it('insensible à la casse et aux espaces', () => {
    expect(isFounder('  MARINE@Agence-Melie.FR ')).toBe(true);
  });

  it('personne d’autre n’est fondateur (pas de sur-attribution)', () => {
    delete process.env.FOUNDER_EMAILS;
    expect(isFounder('quelquun@ailleurs.com')).toBe(false);
    expect(isFounder(null)).toBe(false);
    expect(isFounder('')).toBe(false);
  });

  it('FOUNDER_EMAILS peut AJOUTER un fondateur sans retirer ceux du code', () => {
    process.env.FOUNDER_EMAILS = 'extra@agence-glx.fr';
    expect(isFounder('extra@agence-glx.fr')).toBe(true);
    expect(isFounder('marine@agence-melie.fr')).toBe(true);
  });
});
