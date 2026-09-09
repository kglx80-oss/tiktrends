import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La symétrie du rafraîchissement · le lot on-demand suit le radar.
 *
 * ── Le défaut symétrique ─────────────────────────────────────────────────────
 *
 * #293 a réparé le radar nocturne : une créa déjà connue voit ses chiffres de
 * survie rafraîchis GRATIS, sinon elle reste figée par `onConflictDoNothing` et
 * ne franchit jamais le cap dans notre base. Le lot on-demand (`market-learn`)
 * avait EXACTEMENT le même trou · il écartait « Déjà décrite » sans rien
 * rafraîchir.
 *
 * La règle pure (`majSurvie`) est déjà éprouvée par valeur (#293) · ici on garde
 * l'invariant de câblage : le lot lit l'état stocké et rafraîchit par UPDATE,
 * sans repayer une description.
 */

const LEARN = readFileSync(join(process.cwd(), 'app/actions/market-learn.ts'), 'utf8');

describe('le lot on-demand rafraîchit les créas connues, sans repayer', () => {
  it('il lit l’état de survie stocké (jours + signal)', () => {
    expect(LEARN).toMatch(/daysRunning: schema\.marketCreatives\.daysRunning/);
    expect(LEARN).toMatch(/radarSignal: schema\.marketCreatives\.radarSignal/);
  });

  it('il rafraîchit par UPDATE via majSurvie · aucune description repayée', () => {
    // Le bloc de rafraîchissement met à jour, il ne décrit pas.
    const bloc = LEARN.slice(LEARN.indexOf('const parId = new Map'), LEARN.indexOf('let candidats'));
    expect(bloc).toMatch(/majSurvie\(/);
    expect(bloc).toMatch(/db!\.update\(schema\.marketCreatives\)/);
    expect(bloc, 'le rafraîchissement ne doit RIEN décrire au modèle').not.toMatch(/analyzeAdAsset/);
  });
});
