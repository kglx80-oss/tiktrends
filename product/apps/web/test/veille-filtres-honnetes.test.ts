import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v6 · R14 · aucun filtre affiché ne doit être silencieusement ignoré. Le
 * connecteur Trendtrack déclare `adLanguage`, `minReach`, `minDaysRunning` mais
 * ne les envoie PAS à `/v1/ads/query`. La Veille offrait pourtant ces filtres.
 * On les retire (langue) / ne les propose plus (reach, ancienneté) et on ne les
 * transmet plus au connecteur, avec une explication à l'écran. Composant serveur
 * · non rendable · adoption source.
 */
const veille = readFileSync(join(process.cwd(), 'app/(app)/veille/page.tsx'), 'utf8');
const connecteur = readFileSync(join(process.cwd(), '../../packages/integrations/src/trendtrack.ts'), 'utf8');

describe('R14 · la Veille n’offre que des filtres honorés', () => {
  it('n’expose plus les contrôles langue / reach mini / ancienneté mini', () => {
    expect(veille, 'le contrôle Langue subsiste').not.toContain('name="lang"');
    expect(veille, 'le contrôle Reach mini subsiste').not.toContain('name="minReach"');
    expect(veille, 'le contrôle Ancienneté mini subsiste').not.toContain('name="minDays"');
  });

  it('ne transmet plus ces filtres non honorés au connecteur', () => {
    expect(veille, 'la langue est encore envoyée au connecteur').not.toContain('adLanguage: sp.lang');
    expect(veille, 'le reach mini est encore envoyé').not.toContain('minReach: sp.minReach');
    expect(veille, 'l’ancienneté mini est encore envoyée').not.toContain('minDaysRunning: sp.minDays');
    // Le défaut ne prétend plus filtrer par un seuil de jours non branché.
    expect(veille, 'le défaut envoie encore un seuil de jours non honoré').not.toContain('minDaysRunning: 30');
  });

  it('explique à l’écran pourquoi ces filtres ne sont pas là', () => {
    expect(veille).toContain('non disponibles depuis la source');
  });

  it('le connecteur documente que ces paramètres ne sont pas transmis', () => {
    expect(connecteur, 'le connecteur ne prévient pas que les filtres ne partent pas')
      .toContain('NON transmis à `/v1/ads/query`');
  });
});
