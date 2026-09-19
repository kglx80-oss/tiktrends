import { describe, it, expect } from 'vitest';
import {
  natureLot, estLotImporte, lotEnLectureSeule, LIBELLE_NATURE_LOT,
} from '../src/adsmap/lot-nature';

/**
 * CDC v8 · R04 · lot 29 · un lot « Analysé » qui contient des ads « Brouillon »
 * n'est pas une contradiction quand il est IMPORTÉ · sa nature l'explique. On
 * vérifie que la nature se LIT dans les faits (statut + date de lancement), sans
 * réécrire aucun statut, et que l'importé passe en lecture seule.
 */
describe('la nature d’un lot se lit dans ses faits', () => {
  it('analysé SANS lancement = importé · le parcours opérationnel ne produit pas ça', () => {
    const f = { status: 'analyzed', launchedAt: null };
    expect(natureLot(f)).toBe('importe');
    expect(estLotImporte(f)).toBe(true);
    expect(lotEnLectureSeule(f)).toBe(true);
  });

  it('analysé APRÈS un lancement réel = suivi · la date de lancement le prouve', () => {
    // Cas défensif · aujourd'hui seul l'import pose « analyzed », mais si un jour
    // le parcours l'atteint après un vrai test, `launchedAt` le distingue.
    const f = { status: 'analyzed', launchedAt: new Date('2026-01-01T00:00:00Z') };
    expect(natureLot(f)).toBe('suivi');
    expect(estLotImporte(f)).toBe(false);
    expect(lotEnLectureSeule(f)).toBe(false);
  });

  it('un lot en cours (planned/ready/testing) n’est jamais « importé »', () => {
    for (const status of ['planned', 'in_production', 'ready', 'testing']) {
      expect(natureLot({ status, launchedAt: null }), status).toBe('suivi');
    }
    expect(natureLot({ status: 'testing', launchedAt: new Date() })).toBe('suivi');
  });

  it('le libellé importé porte le mot « historique » et explique la coexistence avec « Brouillon »', () => {
    const l = LIBELLE_NATURE_LOT.importe;
    expect(l.court).toBe('Importé · historique');
    expect(l.phrase).toBeTruthy();
    expect(l.phrase!).toContain('Brouillon');
    expect(l.phrase!).toMatch(/importé|outil tiers/i);
    // Le cas suivi ne porte aucun badge · rien à signaler.
    expect(LIBELLE_NATURE_LOT.suivi.court).toBeNull();
    expect(LIBELLE_NATURE_LOT.suivi.phrase).toBeNull();
  });
});
