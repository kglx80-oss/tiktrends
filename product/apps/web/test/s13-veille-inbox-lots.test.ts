import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * S13 · harmonisation · les erreurs passent par le composant partagé `Bandeau`
 * (comme la Veille et la Table Adsmap le font déjà), et la Veille gagne un
 * « Réinitialiser » quand un critère est actif.
 *
 * Composants non rendables · garde par adoption de la source.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('S13 · erreurs via Bandeau (Inbox, Lots) et reset Veille', () => {


  it('Veille propose Réinitialiser quand un critère est actif', () => {
    // Vague 4 · la Veille est servie par Spatial · la barre des critères (`BarreVeille`).
    const s = read('spatial/vues/veille/client.tsx');
    // La réinitialisation est GARDÉE par un critère actif · sinon elle
    // s'afficherait même sur la vue par défaut (rien à réinitialiser). Le bloc
    // « critères actifs » (puces retirables) porte aussi la réinitialisation.
    const i = s.indexOf('{puces.length > 0 && (');
    expect(i, 'le reset n’est pas gardé par un critère actif').toBeGreaterThan(-1);
    const bloc = s.slice(i, s.indexOf('</div>', i));
    expect(bloc).toContain('onClick={() => aller({ p: undefined, country: undefined, media: undefined, status: undefined, searchIn: undefined })}');
    expect(bloc).toContain('Tout effacer');
  });
});
