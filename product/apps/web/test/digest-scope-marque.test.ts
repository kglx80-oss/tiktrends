import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La lettre hebdomadaire se calcule marque PAR marque · ses chiffres doivent
 * donc être scopés à la marque, pas à l'espace.
 *
 * `schema.ads` ne porte pas de brandId · la marque s'atteint par la chaîne
 * concept→angle→désir→persona. Trois agrégats (verdicts, stock, suites)
 * filtraient `ads.workspaceId` seul · dans un espace multi-marques (une agence),
 * la lettre de la marque A comptait les verdicts, gagnants et le stock de B ·
 * gagnants attribués à la mauvaise marque, chiffres gonflés, et une lettre
 * envoyée à une marque sans activité.
 *
 * Faute de base de test dans le dépôt, on vérifie la propriété sur la SOURCE ·
 * aucune requête `ads` scopée à l'espace seul, chaque agrégat ads filtré par
 * `personas.brandId`. Le test tombe si l'une régresse vers le scope espace.
 */
const SRC = readFileSync(join(process.cwd(), 'lib/digest.ts'), 'utf8');

describe('digest hebdo · chaque fait est scopé à la marque', () => {
  it('plus aucune requête ads ne se scope à l’espace seul', () => {
    expect(SRC, 'une requête ads scopée `schema.ads.workspaceId` compte toutes les marques de l’espace').not.toMatch(/schema\.ads\.workspaceId/);
  });

  it('les trois agrégats ads filtrent par marque (chaîne persona)', () => {
    const parMarque = (SRC.match(/eq\(schema\.personas\.brandId, brandId\)/g) ?? []).length;
    expect(parMarque, 'verdicts, stock et suites doivent chacun filtrer par personas.brandId').toBeGreaterThanOrEqual(3);
  });
});
