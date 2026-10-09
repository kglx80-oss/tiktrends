import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { documentSynthetique, type DocumentStudio, type CalqueForme } from '@tiktrends/core';
import { rendreDocument } from '../lib/studios/rendu/compositeur';

/**
 * L8-C · le compositeur optimisé rend les MÊMES pixels, au bit près.
 *
 * Les formes (rectangles, ellipses suréchantillonnées 4 × 4) sont dessinées en
 * JavaScript pur, sans sharp ni rotation : leurs pixels ne dépendent d'aucune
 * bibliothèque native, l'empreinte est la même sur toute machine. Référence
 * relevée avec le compositeur d'avant l'optimisation (base `f2b9fc4`) sur
 * les formes du document synthétique de 1000 calques, posées à plat.
 */

const REFERENCE_PIXELS = '9e33056bc6680866b41c3601b733bff473ea049ffeea850d5c1ae50ae0d319f2';

/** Les formes du document synthétique, sans rotation · opacités et tailles variées, ellipses comprises. */
function formesAPlat(): DocumentStudio {
  const d = documentSynthetique(1000, 1);
  const layers: DocumentStudio['layers'] = {};
  for (const l of Object.values(d.layers)) if (l.kind === 'shape') layers[l.id] = { ...(l as CalqueForme), rotationDeg: 0, visible: true };
  return { ...d, layers };
}

describe('L8-C · rendu des formes identique au bit près', () => {
  it('formes du document de 1000 calques · empreinte des pixels inchangée', async () => {
    const doc = formesAPlat();
    const n = Object.values(doc.layers).length;
    expect(n).toBeGreaterThan(250);
    expect(Object.values(doc.layers).filter((l) => l.kind === 'shape' && l.shape === 'ellipse').length).toBeGreaterThan(100);
    const r = await rendreDocument(doc, new Map());
    if (!r.ok) throw new Error(`${r.code} ${JSON.stringify(r.violations.slice(0, 2))}`);
    expect(createHash('sha256').update(r.pixels.donnees).digest('hex')).toBe(REFERENCE_PIXELS);
  }, 120_000);
});
