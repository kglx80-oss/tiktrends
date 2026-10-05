import { describe, expect, it } from 'vitest';
import {
  BORDURES, CADRE_PAGE, EXCEPTIONS_LECTURE, LECTURE, RAYONS, ROLES_CADRE, classerCadre, ecartAuRole, gouttiereCss, rayonSignal, styleCadre,
  type CadreObserve,
} from '../src/cadre-page';

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

/**
 * Lot 19D · bordures et rayons PAR RÔLE. Mesuré avant (`98fd2d64`, 37 routes à
 * 1440) · 291 cadres soumis à un rôle, 263 hors de leur rôle (rayons 10 à 24,
 * `--line-2` sur des panneaux).
 */
describe('cadres · bordure et rayon par rôle', () => {
  const obs = (o: Partial<CadreObserve> = {}): CadreObserve => ({
    controle: false, media: false, pilule: false, forme: false, flottant: false, neutre: true, pointille: false, imbrique: false, ...o,
  });
  it('les rayons sont ceux de la charte · carte 20, moyen 12', () => {
    expect(RAYONS).toEqual({ carte: 20, moyen: 12 });
  });
  it('surface · --line, r-card', () => {
    expect(styleCadre('surface')).toEqual({ border: '1px solid var(--line)', borderRadius: 'var(--r-card)' });
  });
  it('tuile · --line, r-md', () => {
    expect(styleCadre('tuile')).toEqual({ border: '1px solid var(--line)', borderRadius: 'var(--r-md)' });
  });
  it('vide · pointillé --line-2, r-card', () => {
    expect(styleCadre('vide')).toEqual({ border: '1px dashed var(--line-2)', borderRadius: 'var(--r-card)' });
  });
  it('aucun cadre neutre en trait plein ne porte la bordure des contrôles', () => {
    for (const r of ['surface', 'tuile'] as const) expect(styleCadre(r).border).not.toContain('--line-2');
  });
  it('signal · le rayon de son niveau', () => {
    expect(rayonSignal('surface')).toBe('var(--r-card)');
    expect(rayonSignal('tuile')).toBe('var(--r-md)');
  });
  it('classer · premier niveau → surface, imbriqué → tuile, pointillé → vide, couleur → signal', () => {
    expect(classerCadre(obs())).toBe('surface');
    expect(classerCadre(obs({ imbrique: true }))).toBe('tuile');
    expect(classerCadre(obs({ pointille: true }))).toBe('vide');
    expect(classerCadre(obs({ neutre: false }))).toBe('signal');
    expect(classerCadre(obs({ flottant: true }))).toBe('tuile');
    expect(classerCadre(obs({ controle: true, neutre: false }))).toBe('controle');
    expect(classerCadre(obs({ pilule: true }))).toBe('pilule');
    expect(classerCadre(obs({ forme: true }))).toBe('forme');
    expect(classerCadre(obs({ media: true }))).toBe('media');
  });
  it('écart · un panneau r16 en --line-2 est hors rôle, le même en r20 --line le tient', () => {
    expect(ecartAuRole('surface', { imbrique: false, trait: 'solid', alpha: 0.2, rayon: 16 })).toBe('surface · bordure 0.2 ≠ 0.12 · rayon 16 ≠ 20');
    expect(ecartAuRole('surface', { imbrique: false, trait: 'solid', alpha: 0.12, rayon: 20 })).toBeNull();
    expect(ecartAuRole('tuile', { imbrique: true, trait: 'solid', alpha: 0.12, rayon: 12 })).toBeNull();
    expect(ecartAuRole('tuile', { imbrique: true, trait: 'solid', alpha: 0.12, rayon: 10 })).toBe('tuile · rayon 10 ≠ 12');
    expect(ecartAuRole('vide', { imbrique: false, trait: 'dashed', alpha: 0.2, rayon: 16 })).toBe('vide · rayon 16 ≠ 20');
  });
  it('écart · un signal garde sa couleur mais prend le rayon de son niveau', () => {
    expect(ecartAuRole('signal', { imbrique: false, trait: 'solid', alpha: 0.4, rayon: 20 })).toBeNull();
    expect(ecartAuRole('signal', { imbrique: true, trait: 'solid', alpha: 0.4, rayon: 12 })).toBeNull();
    expect(ecartAuRole('signal', { imbrique: false, trait: 'solid', alpha: 0.4, rayon: 14 })).toBe('signal · rayon 14 ≠ 20');
  });
  it('écart · contrôle, pilule, forme et média ne sont pas jugés (rayons inchangés)', () => {
    for (const c of ['controle', 'pilule', 'forme', 'media'] as const) expect(ecartAuRole(c, { imbrique: false, trait: 'solid', alpha: 0.2, rayon: 9 })).toBeNull();
  });
  it('chaque rôle dit ce qu’il couvre', () => {
    for (const [r, d] of Object.entries(ROLES_CADRE)) expect(d.quoi.length, r).toBeGreaterThan(10);
  });
});
