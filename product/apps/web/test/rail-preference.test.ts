import { describe, it, expect } from 'vitest';
import { RAIL_COOKIE, railCollapsedFromCookie, railCookieString } from '../lib/rail-preference';

/**
 * La préférence de repli du rail, lue AU RENDU · pas de flash déployé→replié.
 *
 * ── La règle, testée par son RÉSULTAT ────────────────────────────────────────
 *
 * Seule la valeur « 1 » vaut replié · tout le reste (absent, « 0 », vide,
 * inconnu) rend le rail déployé. Le défaut sûr est le rail VISIBLE · une valeur
 * corrompue ne doit pas cacher la navigation.
 */
describe('railCollapsedFromCookie · la valeur du cookie décide, défaut déployé', () => {
  it('« 1 » · et rien d’autre · vaut replié', () => {
    expect(railCollapsedFromCookie('1')).toBe(true);
  });

  it('absent, « 0 », vide ou inconnu · le rail reste déployé', () => {
    expect(railCollapsedFromCookie(undefined)).toBe(false);
    expect(railCollapsedFromCookie(null)).toBe(false);
    expect(railCollapsedFromCookie('0')).toBe(false);
    expect(railCollapsedFromCookie('')).toBe(false);
    expect(railCollapsedFromCookie('true')).toBe(false);
  });

  it('la chaîne écrite au navigateur porte la préférence, un an, path racine, lax', () => {
    expect(railCookieString(true)).toContain(`${RAIL_COOKIE}=1`);
    expect(railCookieString(false)).toContain(`${RAIL_COOKIE}=0`);
    expect(railCookieString(true)).toContain('path=/');
    expect(railCookieString(true)).toMatch(/max-age=\d+/);
    expect(railCookieString(true).toLowerCase()).toContain('samesite=lax');
  });
});

// Le câblage dans la coquille V5 (`AppShell`, layout `(app)`) est retiré avec elle · la coquille
// Spatial lit la même règle au rendu (`lib/spatial/coquille`, layout racine) et la réécrit au basculement.
