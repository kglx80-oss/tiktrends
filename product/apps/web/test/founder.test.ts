import { afterEach, describe, it, expect } from 'vitest';
import { aPouvoirsFondateur, estFondateurCode, estFondateurEnvironnement } from '../lib/founder';

/**
 * Les fondateurs de la plateforme sont reconnus SANS dépendre de l'environnement
 * du VPS · c'est ce qui débloque l'accès complet par simple déploiement. Les
 * pouvoirs fondateur sont réservés à la liste CODÉE (« Codé seul », suivi de
 * #1115) · on vérifie donc que la liste est EXACTE : les deux fondateurs oui,
 * n'importe qui d'autre non, et `FOUNDER_EMAILS` n'ajoute plus personne.
 */

afterEach(() => { delete process.env.FOUNDER_EMAILS; });

describe('fondateurs · reconnus par le code, liste exacte', () => {
  it('kguilbaux et marine ont les pouvoirs fondateur sans FOUNDER_EMAILS', () => {
    delete process.env.FOUNDER_EMAILS;
    expect(aPouvoirsFondateur('kguilbaux@agence-glx.fr')).toBe(true);
    expect(aPouvoirsFondateur('marine@agence-melie.fr')).toBe(true);
  });

  it('insensible à la casse et aux espaces', () => {
    expect(aPouvoirsFondateur('  MARINE@Agence-Melie.FR ')).toBe(true);
  });

  it('personne d’autre n’est fondateur (pas de sur-attribution)', () => {
    delete process.env.FOUNDER_EMAILS;
    expect(aPouvoirsFondateur('quelquun@ailleurs.com')).toBe(false);
    expect(aPouvoirsFondateur(null)).toBe(false);
    expect(aPouvoirsFondateur('')).toBe(false);
  });

  it('FOUNDER_EMAILS n’ajoute AUCUN fondateur · l’adresse est lue, sans pouvoir, et ceux du code restent', () => {
    process.env.FOUNDER_EMAILS = 'extra@agence-glx.fr, marine@agence-melie.fr';
    expect(aPouvoirsFondateur('extra@agence-glx.fr'), 'la variable ouvre encore les pouvoirs fondateur').toBe(false);
    expect(estFondateurCode('extra@agence-glx.fr')).toBe(false);
    expect(estFondateurEnvironnement('extra@agence-glx.fr')).toBe(true);
    expect(aPouvoirsFondateur('marine@agence-melie.fr')).toBe(true);
    expect(estFondateurEnvironnement('marine@agence-melie.fr'), 'un fondateur codé n’est pas « de l’environnement »').toBe(false);
  });
});
