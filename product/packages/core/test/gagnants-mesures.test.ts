import { describe, expect, it } from 'vitest';
import { gagnantsMesures, libelleGagnant, type CumulEssais, type LigneCumul, type VariableEssai } from '../src/adsmap/essai-resultat';
import { LAYOUT_LABEL, AD_LAYOUTS } from '../src/ad-layouts';
import { AD_DIRECTIONS } from '../src/ad-directions';
import { essaiSuivant, type EtatPourEssai } from '../src/adsmap/essai-suivant';

function ligne(valeur: string, gagne: boolean): LigneCumul {
  return { valeur, participations: 8, victoires: gagne ? 6 : 1, taux: gagne ? 0.75 : 0.12, interval: { lo: gagne ? 0.4 : 0, hi: gagne ? 0.95 : 0.35 }, gagne };
}
function cumul(variable: VariableEssai, gagnante: string | null): CumulEssais {
  const lignes = gagnante
    ? [ligne(gagnante, true), ligne('autre', false)]
    : [ligne('a', false), ligne('b', false)];
  return { variable, essais: 8, lignes, hasard: 0.25, conclusif: !!gagnante, resume: '' };
}
const etat = (o: Partial<EtatPourEssai> = {}): EtatPourEssai =>
  ({ cumuls: [], trancheParVariable: {}, tauxDefauts: null, suspect: null, ...o });

describe('gagnantsMesures · nommer ce que la mesure a tranché', () => {
  it('extrait la valeur gagnante de chaque dimension conclusive', () => {
    const g = gagnantsMesures([cumul('mise_en_page', 'affiche'), cumul('univers', 'studio')]);
    expect(g).toEqual([
      { variable: 'mise_en_page', valeur: 'affiche', essais: 8 },
      { variable: 'univers', valeur: 'studio', essais: 8 },
    ]);
  });

  it('ignore une dimension non conclusive · le silence reste une réponse', () => {
    expect(gagnantsMesures([cumul('mise_en_page', null)])).toEqual([]);
    expect(gagnantsMesures([])).toEqual([]);
  });
});

describe('libelleGagnant · habille la clé mesurée avec le libellé du sélecteur', () => {
  it('une mise en page prend son libellé de gabarit', () => {
    const cle = AD_LAYOUTS[0]!;
    expect(libelleGagnant({ variable: 'mise_en_page', valeur: cle, essais: 8 })).toBe(LAYOUT_LABEL[cle]);
  });

  it('un univers prend son libellé de direction', () => {
    const dir = AD_DIRECTIONS[0]!;
    expect(libelleGagnant({ variable: 'univers', valeur: dir.key, essais: 8 })).toBe(dir.label);
  });

  it('une clé inconnue retombe sur elle-même · mieux qu’un blanc', () => {
    expect(libelleGagnant({ variable: 'univers', valeur: 'inexistant_zzz', essais: 8 })).toBe('inexistant_zzz');
  });
});

describe('essaiSuivant nomme désormais les gagnants (le « applique ce qui a gagné » qui ne nommait rien)', () => {
  it('surface les valeurs gagnantes quel que soit le chemin', () => {
    const s = essaiSuivant(etat({ cumuls: [cumul('mise_en_page', 'affiche')] }));
    expect(s.gagnants).toEqual([{ variable: 'mise_en_page', valeur: 'affiche', essais: 8 }]);
  });

  it('les gagnants accompagnent la prochaine hypothèse · mise en page et univers tranchés, l’accroche reste à tester', () => {
    // mise_en_page et univers ont répondu · l'accroche (non cumulable) reste
    // ouverte, donc c'est elle qu'on propose · les deux gagnants s'affichent avec.
    const cumuls = [cumul('mise_en_page', 'affiche'), cumul('univers', 'studio')];
    const s = essaiSuivant(etat({ cumuls }));
    expect(s.variable).toBe('accroche');
    expect(s.gagnants.map((x) => x.valeur).sort()).toEqual(['affiche', 'studio']);
  });

  it('aucun gagnant tant que rien n’a tranché', () => {
    expect(essaiSuivant(etat()).gagnants).toEqual([]);
  });
});
