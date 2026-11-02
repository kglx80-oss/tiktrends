import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Une garde de TEMPS se mesure sur la base de ses mesures de référence · une
 * base migrée sur place (`pgMemoireNeuve`), jamais l'image rechargée du semis
 * global (`pgMemoire`), dont la queue de temps CPU est ~60 % plus lourde
 * (tableau mesuré dans `helpers/pg-memoire.ts`). Est une garde de temps tout
 * fichier de test qui chronomètre (`chronometrer`) ou compare à un budget
 * mesuré (`budgetGarde`, `MESURES`).
 */
const DOSSIER = __dirname;
const GARDE_DE_TEMPS = /\b(chronometrer(Async)?|budgetGarde|MESURES)\b/;

const fichiers = readdirSync(DOSSIER).filter((f) => /\.test\.tsx?$/.test(f) && f !== 'gardes-temps-base-neuve.test.ts');
const gardesDeTemps = fichiers.filter((f) => GARDE_DE_TEMPS.test(readFileSync(join(DOSSIER, f), 'utf8')));

describe('gardes de temps · base migrée sur place', () => {
  it('le recensement trouve les gardes de temps connues', () => {
    expect(gardesDeTemps).toEqual(expect.arrayContaining(['l8c-budgets-web.test.ts', 'l8c-mesure-web.test.ts']));
  });

  it.each(gardesDeTemps)('%s monte sa base par pgMemoireNeuve, jamais par l\'image rechargée', (f) => {
    const src = readFileSync(join(DOSSIER, f), 'utf8');
    if (!/pgMemoire/.test(src)) return;
    expect(/\bpgMemoire\s*\(|\bpgMemoireBrut\s*\(/.test(src), `${f} · garde de temps montée sur l'image rechargée (pgMemoire) · utiliser pgMemoireNeuve`).toBe(false);
    expect(src).toMatch(/\bpgMemoireNeuve\s*\(/);
  });
});
