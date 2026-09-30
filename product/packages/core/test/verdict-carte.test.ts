import { describe, it, expect } from 'vitest';
import { etatVerdictCarte, VERDICT_CARTE, type EtatVerdictCarte } from '../src/adsmap/verdict-carte';
import type { VerdictValue } from '../src/adsmap/types';

describe('etatVerdictCarte · le verdict marché ramené sur la carte', () => {
  it('une créa non suivie ne rend aucun état · la carte propose déjà de la suivre', () => {
    expect(etatVerdictCarte({ suivie: false, lancee: true, verdict: null, arbitre: false })).toBeNull();
    // Même si un verdict traînait, non suivie prime · rien à montrer.
    expect(etatVerdictCarte({ suivie: false, lancee: true, verdict: 'winner', arbitre: true })).toBeNull();
  });

  it('suivie, LANCÉE, sans verdict arbitré = en mesure, jamais rien', () => {
    expect(etatVerdictCarte({ suivie: true, lancee: true, verdict: null, arbitre: false })).toBe('en_mesure');
  });

  it('suivie mais JAMAIS lancée, sans aucun chiffre = « à lancer », jamais « en mesure » (I1)', () => {
    // Recette I1 · une ad restée brouillon s'affichait « En mesure » · l'absence
    // de données n'est pas une mesure.
    expect(etatVerdictCarte({ suivie: true, lancee: false, verdict: null, arbitre: false }), 'un brouillon jamais diffusé est annoncé en mesure').toBe('a_lancer');
    // Un verdict provisoire prouve que des chiffres existent · il reste « en mesure ».
    expect(etatVerdictCarte({ suivie: true, lancee: false, verdict: 'loser', arbitre: false })).toBe('en_mesure');
  });

  it('un test lié INTROUVABLE (supprimé, hors marque) se dit, ne se déguise pas en mesure', () => {
    expect(etatVerdictCarte({ suivie: true, lancee: false, introuvable: true, verdict: null, arbitre: false }), 'un lien rompu est affiché comme un test en cours').toBe('introuvable');
    expect(VERDICT_CARTE.introuvable.ton).not.toBe('win');
  });

  it('un verdict PROVISOIRE (computed, non arbitré) reste « en mesure » · on n’annonce pas une défaite non tranchée', () => {
    expect(etatVerdictCarte({ suivie: true, lancee: true, verdict: 'loser', arbitre: false })).toBe('en_mesure');
    expect(etatVerdictCarte({ suivie: true, lancee: true, verdict: 'winner', arbitre: false })).toBe('en_mesure');
  });

  it('chaque verdict arbitré COMPARABLE se traduit en un état nommé', () => {
    const cas: Array<[VerdictValue, EtatVerdictCarte]> = [
      ['winner', 'gagnante'],
      ['baby_winner', 'petite_gagnante'],
      ['relative_winner', 'gagnante_relative'],
      ['loser', 'perdante'],
      ['insufficient_delivery', 'diffusion_faible'],
      ['inconclusive', 'non_concluant'],
    ];
    for (const [verdict, attendu] of cas) {
      expect(etatVerdictCarte({ suivie: true, lancee: true, verdict, arbitre: true, comparable: true }), `${verdict} → ${attendu}`).toBe(attendu);
    }
  });

  it('un gagnant NON comparable (importé/déclaré) s’affiche prometteuse, pas gagnée (CDC v7 · N02)', () => {
    // Le cas Mistakes v4 · un « winner » retenu sans protocole ne gonfle pas la
    // certitude sur la carte · il devient « prometteuse relative ».
    expect(etatVerdictCarte({ suivie: true, lancee: true, verdict: 'winner', arbitre: true, comparable: false })).toBe('gagnante_relative');
    expect(etatVerdictCarte({ suivie: true, lancee: true, verdict: 'baby_winner', arbitre: true, comparable: false })).toBe('gagnante_relative');
    // Sans champ comparable, on ne SUPPOSE jamais le protocole · même prudence.
    expect(etatVerdictCarte({ suivie: true, lancee: true, verdict: 'winner', arbitre: true })).toBe('gagnante_relative');
    // Une perdante non comparable n'est pas gonflée vers le haut · elle reste perdante.
    expect(etatVerdictCarte({ suivie: true, lancee: true, verdict: 'loser', arbitre: true, comparable: false })).toBe('perdante');
  });

  it('tout état a un libellé et un ton · les gagnantes MESURÉES en ton win, la perdante en lose', () => {
    const etats: EtatVerdictCarte[] = ['gagnante', 'petite_gagnante', 'gagnante_relative', 'perdante', 'non_concluant', 'diffusion_faible', 'en_mesure', 'a_lancer', 'introuvable'];
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
