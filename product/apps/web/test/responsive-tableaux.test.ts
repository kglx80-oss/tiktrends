import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Des tableaux (composants serveur, non rendables) figeaient leurs colonnes en
 * pistes fixes SANS conteneur scrollable · sur téléphone les colonnes se
 * tassaient et débordaient. Le patron maison des vraies <table> : une min-width
 * sur les lignes + un cadre `overflowX:'auto'` · le tableau DÉFILE à
 * l'horizontale au lieu d'écraser. On éprouve le CSS livré par la source.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const analytics = read('app/(app)/analytics/page.tsx');
const meta = read('app/(app)/analytics/MetaKeyMetrics.tsx');
const team = read('app/(app)/team/page.tsx');

describe('Tableaux · min-width + cadre scrollable, plus de colonnes écrasées', () => {
  it('Analytics · le tableau ROAS a une min-width et défile', () => {
    const trow = analytics.slice(analytics.indexOf('const trow ='), analytics.indexOf('const trow =') + 200);
    expect(trow, 'les 6 colonnes n’ont pas de min-width · elles se tassent').toContain('minWidth: 560');
    expect(analytics, 'le cadre du tableau ne défile pas').toContain("borderRadius: 16, overflowX: 'auto'");
  });

  it('Meta · les deux lignes (en-tête + créas) partagent min-width et cadre scrollable', () => {
    const n = meta.split("'1fr 90px 90px 100px', minWidth: 420").length - 1;
    expect(n, 'l’en-tête ET les lignes doivent porter la min-width').toBe(2);
    expect(meta, 'le cadre du tableau ne défile pas').toContain("borderRadius: 16, overflowX: 'auto'");
  });

  it('Team · l’en-tête et les lignes membres partagent min-width et cadre scrollable', () => {
    const n = team.split("'1fr 1fr 160px', minWidth: 480").length - 1;
    expect(n, 'l’en-tête ET les lignes membres doivent porter la min-width').toBe(2);
    expect(team, 'le cadre de la liste ne défile pas').toContain("borderRadius: 16, overflowX: 'auto'");
  });
});
