import { describe, expect, it } from 'vitest';
import { durcirEntiere, TOLERANCE_DEFAUT } from '../src/durcir-entiere';
import { MIN_RELECTURES } from '../src/adsmap/bilan-copie';

/**
 * On ne durcit la consigne d'entière que sur les défauts MESURÉS, et confiants.
 *
 * La discipline est celle du reste de la carte · un minimum d'effectif avant de
 * parler, et une comparaison à une tolérance plutôt qu'à zéro. Un renfort ne
 * peut que aider, donc la barrière ne protège pas d'un risque · elle garde le
 * prompt léger, en ne durcissant que là où le défaut est installé.
 */

const clairAccents = (cs: string[]) => cs.some((c) => /accent/i.test(c));
const clairLisibilite = (cs: string[]) => cs.some((c) => /ILLEGIBLE/i.test(c));

describe('le durcissement suit la mesure, jamais l’instinct', () => {
  it('une marque neuve ne durcit rien · sous le minimum, le silence', () => {
    // Même une marque qui a raté tous ses accents, si elle n'a pas assez de
    // relectures, ne durcit pas · l'intervalle couvre trop pour conclure.
    const cs = durcirEntiere({ relues: MIN_RELECTURES - 1, accents: MIN_RELECTURES - 1, avecTexte: 0, illisibles: 0 });
    expect(cs).toEqual([]);
  });

  it('un défaut d’accents installé durcit sur les accents', () => {
    const cs = durcirEntiere({ relues: 20, accents: 8, avecTexte: 0, illisibles: 0 });
    expect(clairAccents(cs), 'un défaut d’accents mesuré et confiant n’a pas durci').toBe(true);
    expect(clairLisibilite(cs), 'la lisibilité a durci sans défaut mesuré').toBe(false);
  });

  it('un texte illisible installé durcit sur la lisibilité', () => {
    // La lisibilité se compte sur les seules relues où il y avait du texte à
    // juger · son dénominateur est `avecTexte`, pas `relues`.
    const cs = durcirEntiere({ relues: 20, accents: 0, avecTexte: 16, illisibles: 6 });
    expect(clairLisibilite(cs), 'un défaut de lisibilité mesuré n’a pas durci').toBe(true);
    expect(clairAccents(cs), 'les accents ont durci sans défaut mesuré').toBe(false);
  });

  it('on compare à une tolérance, pas à zéro · un accident isolé ne durcit pas', () => {
    // Un seul raté sur vingt (5 %) ne prouve pas un défaut installé · sa borne
    // basse de Wilson reste sous la tolérance. Durcir là-dessus chargerait le
    // prompt sur du bruit.
    const cs = durcirEntiere({ relues: 20, accents: 1, avecTexte: 20, illisibles: 1 });
    expect(cs).toEqual([]);
  });

  it('un lot propre ne durcit rien', () => {
    const cs = durcirEntiere({ relues: 30, accents: 0, avecTexte: 30, illisibles: 0 });
    expect(cs).toEqual([]);
  });

  it('la tolérance est basse mais non nulle · c’est ce qui distingue installé d’accidentel', () => {
    expect(TOLERANCE_DEFAUT).toBeGreaterThan(0);
    expect(TOLERANCE_DEFAUT).toBeLessThan(0.2);
  });
});
