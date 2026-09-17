import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v7 · N09 · l'écran Connexions ne compte plus la feuille de route comme
 * « disponible », et un connecteur déjà branché (Google Drive dans Assets) ne
 * reparaît pas « à venir ».
 */
const page = readFileSync(join(process.cwd(), 'app/(app)/connections/page.tsx'), 'utf8');

describe('N09 · le catalogue dit une seule vérité', () => {
  it('les comptes passent par le registre commun (etatCatalogue), pas par TOTAL mal étiqueté', () => {
    expect(page).toMatch(/etatCatalogue\(DISPONIBLES,/);
    expect(page, 'l’ancien « {TOTAL} intégrations disponibles » subsiste').not.toContain('intégrations disponibles.');
    expect(page).toMatch(/branchable.*aujourd'hui/);
  });

  it('la feuille de route exclut ce qui est déjà disponible (Drive dans Assets)', () => {
    expect(page).toMatch(/ROADMAP_CATS = CATS/);
    expect(page).toMatch(/!dejaDisponible\(it\.name, DISPONIBLES\)/);
    // Le rendu de la feuille de route itère la liste filtrée, pas CATS brut.
    expect(page).toMatch(/\{ROADMAP_CATS\.map/);
    expect(page, 'la préparation compte encore TOTAL au lieu de EN_PREPARATION').not.toMatch(/\{TOTAL\} intégrations en préparation/);
  });

  it('Google Drive est déclaré disponible · plus « à venir »', () => {
    expect(page).toMatch(/DISPONIBLES = \[[^\]]*'Google Drive'/);
  });
});
