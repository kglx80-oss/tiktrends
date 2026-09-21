import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v8 · F10 · une lecture sans infobulle ne transforme ni un proxy, ni une
 * prévision, en certitude. On vérifie que les textes qui promettaient un
 * traitement déterministe là où le rendu est probabiliste, ou une dépense future
 * comme acquise, sont repris.
 *
 * Fichiers client volumineux / action serveur · garde par adoption de la source
 * (le rendu réel de ces phrases est validé en ligne).
 */
const lire = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('F10 · les promesses ne dépassent plus leurs réserves', () => {
  it('l’assistant · l’emballage « guide le rendu », il n’est plus « reproduit à l’identique »', () => {
    const src = lire('app/(app)/studio/ads/AssistantPub.tsx');
    expect(src).toContain('ton emballage guide le rendu');
    expect(src, 'plus de « sera reproduit »').not.toContain('sera reproduit');
    expect(src, 'plus de « reproduit à l’identique »').not.toContain('reproduit à l’identique');
  });

  it('le budget d’un lot est PRÉVU · « devrait atteindre au rythme prévu », pas « atteindra »', () => {
    const src = lire('app/actions/adsmap-batch.ts');
    expect(src).toContain('devrait atteindre');
    expect(src, 'plus de « chaque ad atteindra » (certitude)').not.toMatch(/Chaque ad atteindra/);
  });
});
