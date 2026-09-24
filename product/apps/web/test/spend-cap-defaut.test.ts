import { describe, it, expect, afterEach } from 'vitest';
import { spendCapUsd } from '../lib/spend-guard';

/**
 * Le PLAFOND par défaut · le garde-fou en dur.
 *
 * Il s'applique quand `AI_SPEND_CAP_USD` n'est pas posé — le cas réel, car
 * l'édition de `.env.deploy` sur le VPS « ne prenait pas » (process non
 * rechargé). On épingle donc le défaut au RÉSULTAT, et surtout on cloue le côté
 * prudent : une variable illisible ou négative ne doit JAMAIS ouvrir les vannes,
 * elle retombe sur le défaut. Le seuil vit dans le code, pas dans la tête.
 */

const CLE = 'AI_SPEND_CAP_USD';
const avant = process.env[CLE];
afterEach(() => { if (avant === undefined) delete process.env[CLE]; else process.env[CLE] = avant; });

describe('spendCapUsd · le plafond en dur', () => {
  it('sans variable → 50 $ (le défaut relevé)', () => {
    delete process.env[CLE];
    expect(spendCapUsd()).toBe(50);
    process.env[CLE] = '';
    expect(spendCapUsd()).toBe(50);
  });

  it('une variable valide prime sur le défaut', () => {
    process.env[CLE] = '20';
    expect(spendCapUsd()).toBe(20);
    process.env[CLE] = '100';
    expect(spendCapUsd()).toBe(100);
    process.env[CLE] = '0';
    expect(spendCapUsd()).toBe(0);
  });

  it('une variable illisible ou négative retombe sur le défaut · jamais l’infini', () => {
    process.env[CLE] = 'beaucoup';
    expect(spendCapUsd()).toBe(50);
    process.env[CLE] = '-5';
    expect(spendCapUsd()).toBe(50);
    process.env[CLE] = 'NaN';
    expect(spendCapUsd()).toBe(50);
  });
});
