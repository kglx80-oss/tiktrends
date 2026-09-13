import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le pont Studio→Adsmap ne suivait que les PUBS (`kind: 'ad'`) et écrivait
 * `format: 'static'` en dur · la vidéo et l'image ne pouvaient pas être testées.
 * Il doit désormais accepter tout type SUIVABLE et déduire le format de la règle
 * du noyau (formatAdPourGeneration).
 *
 * Fichier `'use server'` (base, session) · non exécutable en test. Adoption par
 * la source, bornée à trackGeneratedAdAction.
 */
const src = readFileSync(join(process.cwd(), 'app/actions/adsmap-bridge.ts'), 'utf8');
const iStart = src.indexOf('export async function trackGeneratedAdAction');
const iEnd = src.indexOf('export async function trackSavedAdAction', iStart);
const fn = src.slice(iStart, iEnd > iStart ? iEnd : undefined);

describe('Pont Studio→Adsmap · vidéo et image suivables', () => {
  it('la fonction a bien été trouvée', () => {
    expect(iStart, 'trackGeneratedAdAction introuvable').toBeGreaterThan(-1);
    expect(iEnd, 'borne de fin introuvable').toBeGreaterThan(iStart);
  });

  it('ne restreint plus la sélection au seul kind « ad »', () => {
    expect(fn, "le pont filtre encore sur kind='ad' · vidéo/image exclues")
      .not.toContain("eq(schema.generations.kind, 'ad')");
  });

  it('déduit le format du type via la règle du noyau, et refuse le non-suivable', () => {
    expect(fn, 'le format n’est pas déduit de la règle').toContain('formatAdPourGeneration(gen.kind)');
    expect(fn, 'un type non suivable n’est pas refusé').toMatch(/if \(!format\) return \{ error/);
  });

  it('l’ad n’est plus figée en « static » · elle prend le format calculé', () => {
    expect(fn, 'le format de l’ad est encore figé en static').not.toContain("format: 'static'");
  });
});
