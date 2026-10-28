import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FILTRES_VEILLE } from '@tiktrends/core';

/**
 * CDC v6 · R14 · aucun filtre affiché ne doit être silencieusement ignoré. Le
 * connecteur Trendtrack déclare `adLanguage`, `minReach`, `minDaysRunning` mais
 * ne les envoie PAS à `/v1/ads/query`. La Veille offrait pourtant ces filtres.
 * On les retire (langue) / ne les propose plus (reach, ancienneté) et on ne les
 * transmet plus au connecteur, avec une explication à l'écran. Composant serveur
 * · non rendable · adoption source.
 */
// Vague 4 · la page V5 est retirée · Pubs du moment (Spatial) · page et liste des filtres du noyau.
const veille = readFileSync(join(process.cwd(), 'app/(spatial)/sp/veille/page.tsx'), 'utf8')
  + readFileSync(join(process.cwd(), '../../packages/core/src/spatial/veille/recherche.ts'), 'utf8');
const connecteur = readFileSync(join(process.cwd(), '../../packages/integrations/src/trendtrack.ts'), 'utf8');

describe('R14 · la Veille n’offre que des filtres honorés', () => {
  it('n’expose plus les contrôles langue / reach mini / ancienneté mini', () => {
    const cles = FILTRES_VEILLE.flatMap((g) => g.filtres.map((f) => f.cle));
    expect(cles, 'un filtre non honoré est proposé').toEqual(expect.not.arrayContaining(['lang', 'minReach', 'minDays']));
    expect(cles.length, 'la liste des filtres n’est pas lue').toBeGreaterThan(3);
  });

  it('ne transmet plus ces filtres non honorés au connecteur', () => {
    expect(veille, 'la langue est encore envoyée au connecteur').not.toContain('adLanguage: sp.lang');
    expect(veille, 'le reach mini est encore envoyé').not.toContain('minReach: sp.minReach');
    expect(veille, 'l’ancienneté mini est encore envoyée').not.toContain('minDaysRunning: sp.minDays');
    // Le défaut ne prétend plus filtrer par un seuil de jours non branché.
    expect(veille, 'le défaut envoie encore un seuil de jours non honoré').not.toContain('minDaysRunning: 30');
  });

  it('le connecteur documente que ces paramètres ne sont pas transmis', () => {
    expect(connecteur, 'le connecteur ne prévient pas que les filtres ne partent pas')
      .toContain('NON transmis à `/v1/ads/query`');
  });
});
