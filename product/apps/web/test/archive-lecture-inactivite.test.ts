import { describe, it, expect } from 'vitest';
import { LectureInactive, morceauxBornes, DELAI_INACTIVITE_LECTURE_MS } from '../lib/archive-lecture';

/**
 * Archive ZIP · une lecture amont qui CALE au milieu (aucun octet) est coupée
 * en erreur, et le flux amont est fermé · sans cette borne, la requête et sa
 * connexion au stockage restaient ouvertes sans fin (relecture sécurité #986).
 */
const flux = (morceaux: Uint8Array[], calerApres: boolean) => {
  let annule = false;
  const f = new ReadableStream<Uint8Array>({
    start(c) { for (const m of morceaux) c.enqueue(m); if (!calerApres) c.close(); },
    cancel() { annule = true; },
  });
  return { f, annule: () => annule };
};
const tout = async (it: AsyncIterable<Uint8Array>) => { const r: number[] = []; for await (const m of it) r.push(...m); return r; };

describe('morceauxBornes', () => {
  it('lit un flux complet sans le couper', async () => {
    const { f } = flux([new Uint8Array([1, 2]), new Uint8Array([3])], false);
    expect(await tout(morceauxBornes(f, 50))).toEqual([1, 2, 3]);
  });
  it('un flux qui cale après un premier morceau · coupé en erreur, flux amont annulé', async () => {
    const { f, annule } = flux([new Uint8Array([9])], true);
    await expect(tout(morceauxBornes(f, 50))).rejects.toBeInstanceOf(LectureInactive);
    expect(annule(), 'la connexion amont est fermée').toBe(true);
  });
  it('le délai par défaut est borné (ni absent, ni plus de 2 minutes)', () => {
    expect(DELAI_INACTIVITE_LECTURE_MS).toBeGreaterThan(0);
    expect(DELAI_INACTIVITE_LECTURE_MS).toBeLessThanOrEqual(120_000);
  });
});
