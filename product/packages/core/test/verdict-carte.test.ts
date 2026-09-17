import { describe, it, expect } from 'vitest';
import { etatVerdictCarte, VERDICT_CARTE, type EtatVerdictCarte } from '../src/adsmap/verdict-carte';
import type { VerdictValue } from '../src/adsmap/types';

describe('etatVerdictCarte · le verdict marché ramené sur la carte', () => {
  it('une créa non suivie ne rend aucun état · la carte propose déjà de la suivre', () => {
    expect(etatVerdictCarte({ suivie: false, verdict: null, arbitre: false })).toBeNull();
    // Même si un verdict traînait, non suivie prime · rien à montrer.
    expect(etatVerdictCarte({ suivie: false, verdict: 'winner', arbitre: true })).toBeNull();
  });

  it('suivie sans verdict arbitré = en mesure, jamais rien', () => {
    expect(etatVerdictCarte({ suivie: true, verdict: null, arbitre: false })).toBe('en_mesure');
  });

  it('un verdict PROVISOIRE (computed, non arbitré) reste « en mesure » · on n’annonce pas une défaite non tranchée', () => {
    expect(etatVerdictCarte({ suivie: true, verdict: 'loser', arbitre: false })).toBe('en_mesure');
    expect(etatVerdictCarte({ suivie: true, verdict: 'winner', arbitre: false })).toBe('en_mesure');
  });

  it('chaque verdict arbitré se traduit en un état nommé', () => {
    const cas: Array<[VerdictValue, EtatVerdictCarte]> = [
      ['winner', 'gagnante'],
      ['baby_winner', 'petite_gagnante'],
      ['relative_winner', 'gagnante_relative'],
      ['loser', 'perdante'],
      ['insufficient_delivery', 'diffusion_faible'],
      ['inconclusive', 'non_concluant'],
    ];
    for (const [verdict, attendu] of cas) {
      expect(etatVerdictCarte({ suivie: true, verdict, arbitre: true }), `${verdict} → ${attendu}`).toBe(attendu);
    }
  });

  it('tout état a un libellé et un ton · les gagnantes MESURÉES en ton win, la perdante en lose', () => {
    const etats: EtatVerdictCarte[] = ['gagnante', 'petite_gagnante', 'gagnante_relative', 'perdante', 'non_concluant', 'diffusion_faible', 'en_mesure'];
    for (const e of etats) {
      expect(VERDICT_CARTE[e]?.court, `libellé de ${e}`).toBeTruthy();
    }
    expect(VERDICT_CARTE.gagnante.ton).toBe('win');
    expect(VERDICT_CARTE.petite_gagnante.ton).toBe('win');
    expect(VERDICT_CARTE.perdante.ton).toBe('lose');
    expect(VERDICT_CARTE.en_mesure.ton).toBe('attente');
  });

  it('la gagnante RELATIVE ne gonfle pas la certitude · prometteuse, pas gagnée (CDC v6 · R01)', () => {
    const v = VERDICT_CARTE.gagnante_relative;
    // Ni « gagné » ni ton win · une comparaison relative n'est pas une victoire prouvée.
    expect(v.ton, 'une gagnante relative ne doit pas s’afficher en ton win (vert)').not.toBe('win');
    expect(v.court.toLowerCase(), 'le libellé doit dire « prometteuse », pas « gagne »').toContain('prometteuse');
    expect(v.court.toLowerCase()).not.toContain('gagne');
    // La limite est dite en clair, pas seulement suggérée par la couleur.
    expect(v.note, 'la limite de la comparaison relative doit être explicite').toMatch(/relative|seuil/);
  });
});
