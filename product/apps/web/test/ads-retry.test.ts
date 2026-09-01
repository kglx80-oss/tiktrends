import { describe, it, expect } from 'vitest';
import { refusDefinitif } from '../lib/fal-retry';

describe('un refus du fournisseur ne se rejoue pas', () => {
  it('un 404 sur un modèle inconnu est définitif', () => {
    expect(refusDefinitif(new Error('Source image : 404 model not found'))).toBe(true);
  });

  it('un 422 sur un paramètre refusé est définitif', () => {
    expect(refusDefinitif(new Error('Source image : 422 unprocessable'))).toBe(true);
  });

  it('un 401 ou 403 est définitif · la clé ne changera pas d’ici la seconde tentative', () => {
    expect(refusDefinitif(new Error('Source image : 401 unauthorized'))).toBe(true);
    expect(refusDefinitif(new Error('Source image : 403 forbidden'))).toBe(true);
  });

  it('un 500 mérite sa seconde chance', () => {
    expect(refusDefinitif(new Error('Source image : 500 internal'))).toBe(false);
  });

  it('un 502 et un 503 aussi · ce sont des pannes passagères', () => {
    expect(refusDefinitif(new Error('Source image : 502 bad gateway'))).toBe(false);
    expect(refusDefinitif(new Error('Source image : 503 unavailable'))).toBe(false);
  });

  it('un délai dépassé mérite sa seconde chance · il n’a pas de code', () => {
    expect(refusDefinitif(new Error('The operation was aborted due to timeout'))).toBe(false);
    expect(refusDefinitif(new DOMException('Aborted', 'TimeoutError'))).toBe(false);
  });

  it('une erreur sans message ne bloque pas le réessai', () => {
    expect(refusDefinitif(null)).toBe(false);
    expect(refusDefinitif(undefined)).toBe(false);
    expect(refusDefinitif(new Error(''))).toBe(false);
  });

  it('un nombre à trois chiffres hors plage 4xx ne compte pas', () => {
    // « 1080 » et « 300 » apparaissent dans nos propres messages · les prendre
    // pour un code d'erreur ferait renoncer à un réessai légitime.
    expect(refusDefinitif(new Error('image 1080x1350 refusée'))).toBe(false);
    expect(refusDefinitif(new Error('timeout après 300 s'))).toBe(false);
  });
});
