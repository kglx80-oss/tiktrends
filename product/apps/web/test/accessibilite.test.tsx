import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le clavier compte · on le vérifie, on ne l'espère pas.
 *
 * Le focus clavier ne doit pas être rendu invisible par des `outline: none`
 * inline sur les pages publiques (connexion, inscription, tarifs, mentions),
 * qui gardent la feuille `globals.css`. La modale, le piège à focus et la
 * palette de l'ancienne coquille V5 sont retirés avec elle · l'interface
 * Spatial garde les siens (`spatial-coquille`, `spatial-coquille-mobile`).
 */
describe('le focus clavier est visible partout', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

  it('un :focus-visible en !important reprend la main sur les outline:none inline', () => {
    // `!important` est le SEUL moyen pour une feuille de style de battre un style
    // inline · sans lui, les dizaines d'`outline:none` inline gagnent au clavier.
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:[^;]*!important/);
  });

  it('les animations se coupent quand l’utilisateur les a réduites', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
