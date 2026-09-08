import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { railNav, RAIL_GROUP_LABEL, type Access } from '../lib/rbac';

/**
 * Le rail se lit comme la boucle de travail.
 *
 * ── Ce que ce garde protège ──────────────────────────────────────────────────
 *
 * Le produit fait une seule chose · trouver une créative gagnante, la refaire,
 * l'affiner. Le geste est observer → créer → tester. Le rail ouvrait sur le
 * « Pilotage » (le tableau de bord · un regard en arrière) et nommait ses
 * sections comme un musée (Observatoire, Atelier, Laboratoire). On mène par la
 * boucle, et chaque section porte le VERBE de son étape.
 *
 * Ce garde vérifie le RÉSULTAT · la suite de sections qu'un compte complet voit,
 * une fois libellée, est exactement « Observer · Créer · Tester · Piloter »,
 * dans cet ordre. Il tombe si l'ordre repart en arrière ou si un libellé
 * redevient un nom de musée.
 */

const LAYOUT = readFileSync(join(process.cwd(), 'app/(app)/layout.tsx'), 'utf8');

// Un compte complet voit les quatre sections du rail (aucune n'est masquée par
// le rôle ou le plan).
const complet: Access = { role: 'admin', plan: 'business' };

describe('le rail mène par la boucle', () => {
  it('les sections, libellées, forment la boucle dans l’ordre', () => {
    const sections = railNav(complet).map((g) => RAIL_GROUP_LABEL[g.group] ?? g.group);
    expect(sections).toEqual(['Observer', 'Créer', 'Tester', 'Piloter']);
  });

  it('« Piloter » (le regard en arrière) vient APRÈS le travail réel', () => {
    const sections = railNav(complet).map((g) => RAIL_GROUP_LABEL[g.group] ?? g.group);
    expect(sections.indexOf('Piloter')).toBeGreaterThan(sections.indexOf('Créer'));
  });

  it('chaque section du rail porte un verbe, jamais un nom de musée', () => {
    for (const g of railNav(complet)) {
      const label = RAIL_GROUP_LABEL[g.group];
      expect(label, `la section ${g.group} n’a pas de verbe`).toBeTruthy();
      expect(['Observatoire', 'Atelier', 'Laboratoire', 'Pilotage']).not.toContain(label);
    }
  });

  it('le libellé de boucle est bien câblé dans le rail (layout)', () => {
    // Le label vit dans le rail par le layout · sans ce câblage, le rail
    // afficherait encore les clés internes.
    expect(LAYOUT).toMatch(/RAIL_GROUP_LABEL\[g\.group\]/);
  });
});
