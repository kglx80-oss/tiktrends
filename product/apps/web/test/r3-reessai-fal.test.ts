import { describe, it, expect } from 'vitest';
import { inutileDeReessayer } from '../lib/fal-retry';

/**
 * R3 · Pubs IA (`genScene`, `apps/web/app/actions/ads.ts`) rejouait une image
 * fal après une 5xx ou une coupure réseau. Ni l'une ni l'autre ne prouve que
 * fal n'a pas produit, donc facturé, la première image : le réessai pouvait
 * payer deux images pour une seule réservation. On lit la DÉCISION rendue par
 * la règle que la boucle consulte (dans `catch` et sur réponse vide).
 */
describe('fal (site) · aucun réessai après un échec possiblement facturé', () => {
  it.each([
    ['5xx', new Error('Source image (fal-ai/x) : 500 internal')],
    ['502', new Error('Source image (fal-ai/x) : 502 bad gateway')],
    ['coupure réseau', new TypeError('fetch failed')],
    ['socket', new Error('socket hang up')],
    ['réponse sans image', new Error('Le fournisseur n’a renvoyé aucune image.')],
    ['délai', new Error('The operation was aborted due to timeout')],
    ['inconnu', new Error('quelque chose')],
  ])('%s ⇒ pas de réessai', (_nom, e) => {
    expect(inutileDeReessayer(e), `réessai d’une génération possiblement facturée · « ${(e as Error).message} »`).toBe(true);
  });

  it('un refus certain reste sans réessai (inutile : même demande, même refus)', () => {
    expect(inutileDeReessayer(new Error('Source image : 422 unprocessable'))).toBe(true);
    expect(inutileDeReessayer(new Error('Source image : 429 too many requests'))).toBe(true);
  });
});
