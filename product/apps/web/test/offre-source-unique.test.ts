import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { FORFAITS_ACTUELS, FORFAITS_V2, RECHARGES_ACTUELLES } from '@tiktrends/core';
import { PLAN_CREDITS, PLAN_LABEL, PLAN_PRICE } from '../lib/rbac';
import { CREDIT_PACKS, packByKey } from '../lib/credit-packs';

/**
 * L'offre a UNE source · `packages/core/src/offre` (audit crédits du 29/10,
 * incohérences 4 et 14). Les constantes de l'appli en DÉRIVENT, et aucun
 * prix de forfait ni de recharge n'est réécrit en dur dans `apps/web`.
 */
const RACINE = join(__dirname, '..');
function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'node_modules' || n === '.next' || n === 'test') return [];
    return statSync(p).isDirectory() ? fichiers(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('offre · source unique', () => {
  it('rbac et recharges rendent exactement les valeurs du noyau', () => {
    for (const p of ['starter', 'core', 'plus', 'business'] as const) {
      expect([PLAN_LABEL[p], PLAN_PRICE[p], PLAN_CREDITS[p]]).toEqual([FORFAITS_ACTUELS[p].libelle, FORFAITS_ACTUELS[p].prixMensuelEur, FORFAITS_ACTUELS[p].creditsMois]);
    }
    expect(CREDIT_PACKS).toEqual(RECHARGES_ACTUELLES);
    expect(packByKey('pack_5k')).toEqual({ key: 'pack_5k', credits: 50000, eur: 79 });
  });

  it('aucun prix de forfait ou de recharge écrit en dur dans apps/web', () => {
    const prix = [...new Set([
      ...Object.values(FORFAITS_ACTUELS).map((f) => f.prixMensuelEur),
      // L'offre V2 aussi · les pages publiques (`/tarifs`, accueil) la lisent dans le noyau.
      ...Object.values(FORFAITS_V2).map((f) => f.prixMensuelTtc),
      ...RECHARGES_ACTUELLES.map((r) => r.eur),
    ].filter((n) => n > 0))];
    const motif = new RegExp(`(['"\`>\\s(]|^)(${prix.join('|')})\\s?€|\\beur:\\s*\\d|PLAN_(PRICE|CREDITS)[^=\\n]*=\\s*\\{`, 'm');
    const fautes = ['app', 'lib', 'spatial', 'components'].flatMap((d) => fichiers(join(RACINE, d)))
      .filter((f) => motif.test(sansCommentaires(readFileSync(f, 'utf8'))))
      .map((f) => relative(RACINE, f));
    expect(fautes).toEqual([]);
  });
});
