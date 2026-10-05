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
 * Ce garde vérifie le RÉSULTAT · « Accueil » MÈNE le rail en entrée autonome
 * (sans en-tête de section, façon Flora · Kevin 30/09), puis les sections
 * libellées forment exactement « Observer · Créer · Tester », dans cet ordre.
 * Il tombe si Accueil ne mène plus, si l'ordre repart en arrière, ou si un
 * libellé redevient un nom de musée.
 *
 * Lot 19A · mandat du 5/10 (il remplace la décision du 30/09 qui fermait le
 * rail par « Piloter ») · le Pilotage est REGROUPÉ sous l'Accueil · plus de
 * section « Piloter » ; « Analytics » est une sous-entrée de l'Accueil.
 */

const LAYOUT = readFileSync(join(process.cwd(), 'app/(app)/layout.tsx'), 'utf8');

// Un compte complet voit toutes les sections du rail (aucune n'est masquée par
// le rôle ou le plan).
const complet: Access = { role: 'admin', plan: 'business' };

describe('le rail mène par l’Accueil, puis par la boucle', () => {
  it('« Accueil » MÈNE le rail, en entrée AUTONOME (aucun en-tête de section)', () => {
    const groupes = railNav(complet);
    expect(groupes[0]!.group, 'Accueil doit ouvrir le rail').toBe('Accueil');
    // Autonome · pas de libellé de section au-dessus (chaîne vide).
    expect(RAIL_GROUP_LABEL['Accueil'], 'Accueil ne doit porter aucun en-tête de section').toBe('');
    // Et c'est bien l'entrée « Accueil » (ex-Dashboard) qu'elle contient.
    expect(groupes[0]!.items.map((i) => i.label)).toContain('Accueil');
  });

  it('les sections LIBELLÉES (hors Accueil autonome) forment la boucle dans l’ordre', () => {
    const sections = railNav(complet)
      .map((g) => RAIL_GROUP_LABEL[g.group] ?? g.group)
      .filter((l) => l !== ''); // l'entrée autonome Accueil n'a pas d'en-tête
    expect(sections).toEqual(['Observer', 'Créer', 'Tester']);
  });

  it('le Pilotage est regroupé sous l’Accueil · « Analytics » en sous-entrée, aucune section « Piloter »', () => {
    const groupes = railNav(complet);
    expect(groupes.map((g) => RAIL_GROUP_LABEL[g.group] ?? g.group), 'une section « Piloter » subsiste').not.toContain('Piloter');
    expect(groupes.map((g) => g.group as string), 'un groupe Pilotage subsiste').not.toContain('Pilotage');
    const accueil = groupes[0]!.items.map((i) => ({ label: i.label, href: i.href, isSub: i.isSub }));
    expect(accueil, 'Analytics n’est pas la sous-entrée de l’Accueil').toEqual([
      { label: 'Accueil', href: '/dashboard', isSub: false },
      { label: 'Analytics', href: '/dashboard?vue=analytics', isSub: true },
    ]);
    // Une seule entrée Analytics dans tout le rail · déplacée, jamais doublée.
    const tous = groupes.flatMap((g) => g.items).filter((i) => i.label === 'Analytics');
    expect(tous).toHaveLength(1);
  });

  it('chaque section LIBELLÉE du rail porte un verbe, jamais un nom de musée', () => {
    for (const g of railNav(complet)) {
      const label = RAIL_GROUP_LABEL[g.group];
      if (label === '') continue; // l'Accueil autonome n'a pas de libellé
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
