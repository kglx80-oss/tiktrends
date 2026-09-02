import { describe, expect, it } from 'vitest';
import { essaiSuivant, SEUIL_DEFAUTS, type EtatPourEssai } from '../src/adsmap/essai-suivant';
import type { CumulEssais, VariableEssai } from '../src/adsmap/essai-resultat';

const cumul = (variable: VariableEssai, conclusif: boolean): CumulEssais =>
  ({ variable, essais: conclusif ? 8 : 1, lignes: [], hasard: 0.25, conclusif, resume: '' });

const etat = (o: Partial<EtatPourEssai> = {}): EtatPourEssai =>
  ({ cumuls: [], trancheParVariable: {}, tauxDefauts: null, suspect: null, ...o });

describe('les ratés passent avant tout', () => {
  it('refuse de proposer un essai quand une image sur deux est abîmée', () => {
    // Un essai comparerait des scènes ratées entre elles · le verdict
    // dépendrait de si la scène était ratée, pas de ce qu'on croyait tester.
    const s = essaiSuivant(etat({ tauxDefauts: 0.6 }));
    expect(s.variable).toBeNull();
    expect(s.avantTout).toBeTruthy();
    expect(s.pourquoi).toContain('60 %');
  });

  it('nomme l’origine quand elle est connue', () => {
    const s = essaiSuivant(etat({ tauxDefauts: 0.8, suspect: { quoi: 'GPT Image 2', taux: 0.9 } }));
    expect(s.avantTout).toContain('GPT Image 2');
  });

  it('laisse passer sous le seuil', () => {
    const s = essaiSuivant(etat({ tauxDefauts: SEUIL_DEFAUTS }));
    expect(s.variable).not.toBeNull();
  });

  it('ne bloque pas quand aucune image n’a été regardée', () => {
    // « On ne sait pas » n'est pas « c'est cassé ».
    expect(essaiSuivant(etat({ tauxDefauts: null })).variable).not.toBeNull();
  });
});

describe('une dimension tranchée ne se re-teste pas', () => {
  it('passe à la suivante', () => {
    const s = essaiSuivant(etat({ cumuls: [cumul('mise_en_page', true)] }));
    expect(s.variable).toBe('accroche');
    expect(s.pourquoi).toContain('mise en page');
  });

  it('se tait quand tout a répondu', () => {
    // On ne propose pas « teste au hasard » · un lot payé pour occuper l'écran.
    const s = essaiSuivant(etat({
      cumuls: [cumul('mise_en_page', true), cumul('univers', true)],
      trancheParVariable: { accroche: 3 },
    }));
    // L'accroche ne se cumule pas · elle reste ouverte tant qu'elle n'a pas de
    // cumul conclusif, ce qui n'arrivera jamais. C'est voulu et c'est dit.
    expect(s.variable).toBe('accroche');
  });

  it('n’a plus rien à proposer quand les trois ont tranché', () => {
    const s = essaiSuivant(etat({
      cumuls: [cumul('mise_en_page', true), cumul('univers', true), cumul('accroche', true)],
    }));
    expect(s.variable).toBeNull();
    expect(s.pourquoi).toContain('réentendre');
  });

  it('un cumul non conclusif ne ferme rien', () => {
    const s = essaiSuivant(etat({ cumuls: [cumul('mise_en_page', false)] }));
    expect(s.variable).toBe('mise_en_page');
  });
});

describe('à questions ouvertes égales, la moins chère', () => {
  it('commence par la mise en page', () => {
    // Une image, et des bras qui se répètent · c'est elle qui construit une
    // mesure cumulée le plus vite.
    expect(essaiSuivant(etat()).variable).toBe('mise_en_page');
  });

  it('ne propose l’ambiance qu’en dernier', () => {
    // Quatre images · à information comparable, on commence par ce qui se paie
    // une fois.
    const s = essaiSuivant(etat({ cumuls: [cumul('mise_en_page', true), cumul('accroche', true)] }));
    expect(s.variable).toBe('univers');
  });

  it('signale quand l’essai ne coûte qu’une image', () => {
    expect(essaiSuivant(etat()).pourquoi).toContain('une image');
    const cher = essaiSuivant(etat({ cumuls: [cumul('mise_en_page', true), cumul('accroche', true)] }));
    expect(cher.pourquoi).not.toContain('une image');
  });
});

describe('le pourquoi dit la vérité sur le cumul', () => {
  it('promet un cumul là où il existe', () => {
    const s = essaiSuivant(etat({ trancheParVariable: { mise_en_page: 2 } }));
    expect(s.pourquoi).toContain('2 essai');
    expect(s.pourquoi).toContain('hasard');
  });

  it('n’en promet aucun pour les accroches', () => {
    // Chaque essai d'accroches en compare de nouvelles · laisser croire à un
    // cumul ferait attendre une conclusion qui ne viendra jamais.
    const s = essaiSuivant(etat({
      cumuls: [cumul('mise_en_page', true)],
      trancheParVariable: { accroche: 4 },
    }));
    expect(s.variable).toBe('accroche');
    expect(s.pourquoi).toContain('pas de cumul');
  });

  it('dit quand une dimension n’a jamais tranché', () => {
    expect(essaiSuivant(etat()).pourquoi).toContain('jamais tranché');
  });
});
