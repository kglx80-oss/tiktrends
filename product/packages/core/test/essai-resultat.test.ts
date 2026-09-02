import { describe, expect, it } from 'vitest';
import {
  cumulEssais, estCumulable, lireEssai, lireEssais, MIN_ESSAIS,
  type AdEssai, type EssaiLu, type VariableEssai,
} from '../src/adsmap/essai-resultat';
import type { VerdictValue } from '../src/adsmap/types';

const ad = (groupe: string, valeur: string, verdict: VerdictValue | null, variable: VariableEssai = 'mise_en_page'): AdEssai =>
  ({ groupe, variable, valeur, verdict });

/** Un essai tranché sur `gagnant`, parmi `bras`. */
const essaiTranche = (groupe: string, bras: string[], gagnant: string): AdEssai[] =>
  bras.map((b) => ad(groupe, b, b === gagnant ? 'winner' : 'loser'));

describe('lire un essai', () => {
  it('tranche quand un seul bras gagne et que tout est arbitré', () => {
    const e = lireEssai(essaiTranche('g1', ['immersif', 'affiche', 'champ'], 'affiche'))!;
    expect(e.tranche).toBe(true);
    expect(e.gagnant).toBe('affiche');
  });

  it('ne tranche pas tant qu’un verdict manque', () => {
    // Un essai dont deux publicités attendent encore n'a pas fini de parler,
    // même si la troisième a déjà gagné.
    const e = lireEssai([ad('g', 'immersif', 'winner'), ad('g', 'affiche', null)])!;
    expect(e.tranche).toBe(false);
    expect(e.gagnant).toBeNull();
    expect(e.resume).toContain('attendent');
  });

  it('ne tranche pas quand deux bras gagnent', () => {
    const e = lireEssai([ad('g', 'a', 'winner'), ad('g', 'b', 'baby_winner')])!;
    expect(e.tranche).toBe(false);
    expect(e.resume).toContain('ne tranche pas');
  });

  it('« aucun gagnant » est une réponse, pas un silence', () => {
    const e = lireEssai([ad('g', 'a', 'loser'), ad('g', 'b', 'loser')])!;
    expect(e.tranche).toBe(false);
    expect(e.resume).toContain('reste une réponse');
  });

  it('ne promet jamais une mesure sur un seul lot', () => {
    // C'est LE piège : un taux calculé sur une observation a l'air d'une
    // mesure et n'en est pas une.
    const e = lireEssai(essaiTranche('g', ['a', 'b'], 'a'))!;
    expect(e.resume).toContain('piste');
    expect(e.resume).toContain('répétant');
  });
});

describe('regrouper les lots', () => {
  it('sépare les groupes', () => {
    const lus = lireEssais([...essaiTranche('g1', ['a', 'b'], 'a'), ...essaiTranche('g2', ['a', 'b'], 'b')]);
    expect(lus.length).toBe(2);
    expect(lus.map((l) => l.gagnant).sort()).toEqual(['a', 'b']);
  });

  it('ignore un lot réduit à un bras', () => {
    // L'afficher ferait croire qu'un essai a eu lieu.
    expect(lireEssais([ad('seul', 'a', 'winner')])).toEqual([]);
  });

  it('ignore une publicité sans groupe', () => {
    expect(lireEssais([ad('', 'a', 'winner'), ad('', 'b', 'loser')])).toEqual([]);
  });
});

describe('le cumul', () => {
  const lots = (n: number, gagnant: string): EssaiLu[] =>
    Array.from({ length: n }, (_, i) =>
      lireEssai(essaiTranche(`g${i}`, ['immersif', 'affiche', 'champ', 'split'], gagnant))!);

  it('refuse de cumuler les accroches, et dit pourquoi', () => {
    // Additionner leurs victoires reviendrait à compter combien de fois la
    // première accroche écrite gagne.
    const c = cumulEssais([], 'accroche');
    expect(c.conclusif).toBe(false);
    expect(c.resume).toContain('ne se cumulent pas');
    expect(estCumulable('accroche')).toBe(false);
  });

  it('ne conclut pas sous le seuil d’essais', () => {
    const c = cumulEssais(lots(MIN_ESSAIS - 1, 'affiche'), 'mise_en_page');
    expect(c.conclusif).toBe(false);
    expect(c.resume).toContain(String(MIN_ESSAIS));
  });

  it('conclut quand un bras gagne systématiquement', () => {
    const c = cumulEssais(lots(10, 'affiche'), 'mise_en_page');
    expect(c.conclusif).toBe(true);
    expect(c.lignes[0]!.valeur).toBe('affiche');
    expect(c.lignes[0]!.gagne).toBe(true);
  });

  it('compare au HASARD, pas à zéro', () => {
    // Un bras parmi quatre gagne une fois sur quatre par pur hasard · comparer
    // à zéro déclarerait gagnante n'importe quelle coquille.
    const alterne = ['immersif', 'affiche', 'champ', 'split'];
    const melange = Array.from({ length: 12 }, (_, i) =>
      lireEssai(essaiTranche(`g${i}`, alterne, alterne[i % 4]!))!);
    const c = cumulEssais(melange, 'mise_en_page');
    expect(c.hasard).toBeCloseTo(0.25, 5);
    expect(c.conclusif, 'un tirage parfaitement uniforme est déclaré concluant').toBe(false);
    expect(c.resume).toContain('aucun bras ne se détache');
  });

  it('le hasard suit la taille réelle des lots', () => {
    const duo = Array.from({ length: 6 }, (_, i) => lireEssai(essaiTranche(`g${i}`, ['a', 'b'], 'a'))!);
    expect(cumulEssais(duo, 'mise_en_page').hasard).toBeCloseTo(0.5, 5);
  });

  it('ne compte que les essais tranchés', () => {
    const enCours = lireEssai([ad('x', 'a', 'winner'), ad('x', 'b', null)])!;
    const c = cumulEssais([...lots(6, 'affiche'), enCours], 'mise_en_page');
    expect(c.essais).toBe(6);
  });

  it('dit qu’il n’y a rien plutôt que de se taire', () => {
    const c = cumulEssais([], 'mise_en_page');
    expect(c.essais).toBe(0);
    expect(c.resume).toContain('Aucun essai tranché');
  });

  it('un bras qui n’a jamais gagné reste listé', () => {
    // Savoir que « champ » a perdu dix fois vaut autant que savoir qui gagne.
    const c = cumulEssais(lots(10, 'affiche'), 'mise_en_page');
    const champ = c.lignes.find((l) => l.valeur === 'champ')!;
    expect(champ.participations).toBe(10);
    expect(champ.victoires).toBe(0);
    expect(champ.gagne).toBe(false);
  });
});
