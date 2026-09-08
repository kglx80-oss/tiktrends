import { describe, expect, it } from 'vitest';
import { temoinQualite, type FenetreDefauts } from '../src/temoin-qualite';
import { MIN_RELECTURES } from '../src/adsmap/bilan-copie';

/**
 * Le témoin ne conclut qu'à séparation nette des intervalles.
 *
 * La discipline de la carte · un minimum d'effectif par fenêtre, et une tendance
 * n'est déclarée que si les intervalles de Wilson ne se chevauchent pas. Deux
 * taux qui se recouvrent ne tranchent pas · le silence est la réponse.
 */

const fen = (o: Partial<FenetreDefauts>): FenetreDefauts => ({
  n: o.n ?? 0, accroche: o.accroche ?? 0, accents: o.accents ?? 0,
  avecTexte: o.avecTexte ?? 0, illisibles: o.illisibles ?? 0,
});

describe('le témoin constate une tendance, ou se tait', () => {
  it('sous le minimum d’effectif dans une fenêtre, il ne dit rien', () => {
    const t = temoinQualite(
      fen({ n: MIN_RELECTURES - 1, accents: MIN_RELECTURES - 1 }),
      fen({ n: MIN_RELECTURES, accents: 0 }),
    );
    expect(t.evolutions).toEqual([]);
    expect(t.resume).toBe('');
  });

  it('une baisse nette est une amélioration', () => {
    // Anciennement presque tous les accents perdus, récemment aucun · les
    // intervalles se séparent, la tendance est claire.
    const t = temoinQualite(
      fen({ n: 12, accents: 10 }),
      fen({ n: 12, accents: 0 }),
    );
    const acc = t.evolutions.find((e) => e.defaut === 'accents');
    expect(acc?.sens).toBe('amelioration');
    expect(t.resume).toContain('accents perdus');
    expect(t.resume).toContain('amélioration');
  });

  it('une hausse nette est une dégradation', () => {
    const t = temoinQualite(
      fen({ n: 12, accroche: 0 }),
      fen({ n: 12, accroche: 10 }),
    );
    expect(t.evolutions.find((e) => e.defaut === 'accroche')?.sens).toBe('degradation');
    expect(t.resume).toContain('dégradation');
  });

  it('des taux qui se chevauchent ne tranchent pas', () => {
    // 42 % contre 25 % sur douze chacun · les intervalles se recouvrent, c'est du
    // bruit. Le silence est la réponse honnête.
    const t = temoinQualite(
      fen({ n: 12, accents: 5 }),
      fen({ n: 12, accents: 3 }),
    );
    expect(t.evolutions).toEqual([]);
  });

  it('la lisibilité se compte sur les fenêtres avec texte, pas sur toutes les relues', () => {
    // Comme le bilan · le dénominateur de l'illisible est `avecTexte`. Une fenêtre
    // sans texte à juger ne peut pas trancher la lisibilité.
    const t = temoinQualite(
      fen({ n: 40, avecTexte: 12, illisibles: 10 }),
      fen({ n: 40, avecTexte: 12, illisibles: 0 }),
    );
    expect(t.evolutions.find((e) => e.defaut === 'illisible')?.sens).toBe('amelioration');
  });
});
