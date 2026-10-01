import { describe, expect, it } from 'vitest';
import { chargementCompletRequis } from '../src';

/**
 * Recette #106b · un lien du rail vers le chemin courant, recherche différente,
 * est confié au navigateur (le routeur client ne terminait pas la transition ·
 * mesuré · « Veille » depuis /veille?q=…, 4 échecs sur 4).
 */
const u = (s: string) => new URL(s, 'http://local');
describe('chargementCompletRequis', () => {
  it('même chemin, autre recherche · le rail laisserait le routeur bloqué', () => {
    expect(chargementCompletRequis(u('/veille?q=zzz'), u('/veille')), 'le rail laisserait le routeur bloqué').toBe(true);
    expect(chargementCompletRequis(u('/adsmap?vue=table'), u('/adsmap')), 'le rail laisserait le routeur bloqué').toBe(true);
  });
  it('autre chemin, ou simple ancre, ou autre origine · le routeur garde la main', () => {
    expect(chargementCompletRequis(u('/veille?q=zzz'), u('/radar'))).toBe(false);
    expect(chargementCompletRequis(u('/brands/x?tab=overview'), u('/brands/x?tab=overview#charte'))).toBe(false);
    expect(chargementCompletRequis(u('/veille'), new URL('https://ailleurs.example/veille?q=1'))).toBe(false);
    expect(chargementCompletRequis(u('/veille'), u('/veille'))).toBe(false);
  });
});
