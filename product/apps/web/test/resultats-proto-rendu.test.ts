import { describe, expect, it } from 'vitest';
import { apercuLotsResultats, tonStatutLot, type FaitsLotApercu } from '@tiktrends/core';

/**
 * V5 · Résultats · alignement de la vue d'ensemble sur la maquette de Kevin.
 *
 * On cloue le RÉSULTAT là où on peut le rendre (le bloc Jarvis et l'aperçu des
 * lots, rendus en HTML) et la STRUCTURE à la source pour la page serveur. Le
 * raccordement réel est préservé · le bloc Jarvis AMÈNE au vrai `/jarvis`, les
 * cartes de lot ne portent AUCUNE performance, et rien n'est fabriqué.
 */


// Vague 4 · `ParcoursBoucle` (V5) est retiré avec la Veille V5, son dernier écran · Résultats est servi par Spatial.

describe('V5 · apercuLotsResultats (noyau pur)', () => {
  it('ne fabrique rien · but vide → null, statut inconnu → lui-même, importé lu des faits', () => {
    const cartes = apercuLotsResultats([
      { id: 'x', number: 9, status: 'analyzed', goal: '   ', launchedAt: null, ads: 1 },
      { id: 'y', number: 10, status: 'inconnu', goal: 'Un but', launchedAt: '2026-01-01', ads: 0 },
    ]);
    expect(cartes[0]!.but).toBeNull();
    expect(cartes[0]!.importe).toBe(true); // analysé sans lancement = import
    expect(cartes[1]!.statut).toBe('inconnu'); // pas de libellé inventé
    expect(cartes[1]!.importe).toBe(false);
  });

  it('au plus 4 cartes, les premières (plus récentes d’abord)', () => {
    const lots: FaitsLotApercu[] = Array.from({ length: 7 }, (_, i) => ({ id: `b${i}`, number: i, status: 'done', goal: null, launchedAt: null, ads: 0 }));
    expect(apercuLotsResultats(lots)).toHaveLength(4);
  });
});

// La barre d'onglets V5 (`BarreOnglets`) est retirée avec l'ancienne coquille · Résultats a sa sous-navigation Spatiale.

describe('V5 · tonStatutLot (noyau pur)', () => {
  it('importé prime, diffusion → accent, terminé → vert, le reste en attente', () => {
    expect(tonStatutLot('testing', false)).toBe('diffusion');
    expect(tonStatutLot('live', false)).toBe('diffusion');
    expect(tonStatutLot('done', false)).toBe('termine');
    expect(tonStatutLot('analyzed', false)).toBe('termine');
    expect(tonStatutLot('ready', false)).toBe('attente');
    expect(tonStatutLot('inconnu', false)).toBe('attente');
    // Un historique importé passe toujours au ton « importe », quel que soit son statut.
    expect(tonStatutLot('analyzed', true)).toBe('importe');
    expect(tonStatutLot('testing', true)).toBe('importe');
  });
});

