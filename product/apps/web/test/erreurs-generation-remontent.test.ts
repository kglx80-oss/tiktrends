import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Une erreur de génération remonte TOUJOURS jusqu'aux incidents.
 *
 * ── Le trou qu'un incident a révélé ──────────────────────────────────────────
 *
 * Les erreurs de génération sont censées se voir dans « Incidents techniques »
 * (/admin/incidents), qui lit `error_log`. Mais ce journal n'est alimenté que
 * par `logAndTranslate`, appelé dans les `catch`. Quand `composeBatch` (ou un
 * appel serveur) LEVAIT au lieu de renvoyer { error }, l'exception s'échappait
 * de l'action · rien n'était journalisé, la page restait vide, et il fallait le
 * terminal du serveur pour voir la panne.
 *
 * On enveloppe donc les deux entrées de génération · toute exception qui
 * s'échappe est journalisée (→ elle remonte dans les incidents) et renvoyée
 * comme un échec lisible. Ce garde tombe si l'enveloppe saute.
 */

const ADS = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');

describe('les entrées de génération enveloppent leurs exceptions', () => {
  it('generateAdsAction délègue à un interne et journalise ce qui s’échappe', () => {
    expect(ADS).toMatch(/async function genererLotInterne/);
    expect(ADS).toMatch(/return await genererLotInterne\(input\)/);
    expect(ADS, 'le catch doit journaliser sous ads:generate').toMatch(/logAndTranslate\('ads:generate'/);
  });

  it('cloneAdAction a la même barrière', () => {
    expect(ADS).toMatch(/async function clonerLotInterne/);
    expect(ADS).toMatch(/return await clonerLotInterne\(input\)/);
    expect(ADS, 'le catch doit journaliser sous ads:clone').toMatch(/logAndTranslate\('ads:clone'/);
  });
});
