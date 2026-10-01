import { describe, expect, it } from 'vitest';
import { BORDURES, CADRE_PAGE, EXCEPTIONS_LECTURE, LECTURE, gouttiereCss } from '../src/cadre-page';

/**
 * B2 (#118) · le cadre extérieur commun. Mesuré avant B2 · neuf largeurs (700 à
 * 1200), gouttières 32 ou 36, titre de x=60 à x=234 selon l'écran.
 */
describe('cadre extérieur · la charte', () => {
  it('1200 au plus, gouttières 32 desktop / 16 mobile', () => {
    expect(CADRE_PAGE.largeurMax).toBe(1200);
    expect(gouttiereCss()).toBe('clamp(16px, 4vw, 32px)');
  });
  it('bordures · cadre 12 %, contrôle 20 %', () => {
    expect(BORDURES).toEqual({ cadre: 0.12, controle: 0.2 });
  });
  it('une lecture intérieure reste plus étroite que le cadre (sinon ce n’est pas une exception)', () => {
    for (const v of Object.values(LECTURE)) expect(v).toBeLessThan(CADRE_PAGE.largeurMax - 2 * CADRE_PAGE.gouttiereDesktop);
  });
  it('chaque exception dit pourquoi', () => {
    for (const [route, e] of Object.entries(EXCEPTIONS_LECTURE)) expect(e.raison.length, route).toBeGreaterThan(10);
  });
});
