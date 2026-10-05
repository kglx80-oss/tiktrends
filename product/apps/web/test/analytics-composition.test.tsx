import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lot UI Analytics · audit /analytics. Un seul écart de présentation mesuré au
 * rendu réel : les titres de section propres à la page rompaient la charte que
 * suivent le h1 ET les trois composants embarqués (Diversité créative, Key
 * Metrics, Bilan avancé), tous en fontSize 19 / fontWeight 500 :
 *  - « Aperçu créas » était en 15 / 800 (plus petit ET plus gras que son bloc
 *    pair « Diversité créative ») ;
 *  - « Répartition Radar », « Dépense par plateforme », « Top créas par ROAS »
 *    (const `h2`) en 15 / 700.
 *
 * On aligne la graisse à 500 partout, et les titres de SECTION à 19. Aucun
 * calcul touché · le rendu réel (hiérarchie cohérente) est prouvé par la
 * recette CDP jointe.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const page = read('components/accueil/VueAnalytics.tsx');

describe('Analytics · les titres suivent la charte (graisse 500, sections à 19)', () => {
  it('le h1 reste l’ancre de charte (500)', () => {
    expect(page).toContain("fontWeight: 500");
    expect(page).toContain("const h1 = { margin: 0, fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500,");
  });

  it('le const h2 (titres de carte / section) est en graisse 500, plus en 700', () => {
    expect(page, 'les titres de section retombent en 700, plus gras que la charte')
      .toContain('const h2 = { margin: 0, fontSize: 15, fontWeight: 500,');
  });

  it('« Aperçu créas » pèse comme son bloc pair « Diversité créative » (19 / 500)', () => {
    expect(page, '« Aperçu créas » repasse en 15/800, plus petit et plus gras que « Diversité créative »')
      .toContain("fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>Aperçu créas");
  });

  it('« Top créas par ROAS » est un titre de SECTION (19)', () => {
    expect(page).toContain('{ ...h2, fontSize: 19, marginTop: 28, marginBottom: 12 }');
  });
});

describe('Analytics · calculs INCHANGÉS (non-régression)', () => {
  it('l’agrégation et le tri des créas restent en place', () => {
    expect(page).toContain('const rows = buildAnalysis();');
    expect(page).toContain('const t = analysisTotals(rows);');
    // Top ROAS trié sur l'efficacité de conversion, pas retouché.
    expect(page).toContain('.sort((a, b) => b.convEff - a.convEff)');
    // Répartition Radar par bucket, calcul conservé.
    expect(page).toContain('rows.filter((r) => r.bucket === b.key).length');
  });
});
