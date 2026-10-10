import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { railNav, RAIL_GROUP_LABEL, sectionsRail, type Access } from '../lib/rbac';

/**
 * Le rail se lit comme la boucle de travail · UX V2 (maquettes du 10/10).
 *
 * ── Ce que ce garde protège ──────────────────────────────────────────────────
 *
 * Le produit fait une seule chose · trouver une créative gagnante, la refaire,
 * l'affiner. Le rail UX V2 est une liste PLATE de six modules, dans l'ordre du
 * geste · Accueil, Veille, Studios, Bibliothèque, Résultats, Jarvis. Aucune
 * rubrique au-dessus, aucune sous-entrée dans le rail (elles deviennent les
 * onglets de leur page).
 *
 * Ce garde lit le RÉSULTAT de `railNav` (la liste exacte que le rail affiche)
 * passée par `sectionsRail` (ce que le rail rend · une entrée par section). Il
 * tombe si l'ordre change, si une rubrique réapparaît, si Analytics redevient
 * une entrée du rail ou si un ancien libellé (Adsmap, Assets) revient.
 */

const LAYOUT = readFileSync(join(process.cwd(), 'app/(app)/layout.tsx'), 'utf8');

// Un compte complet voit toutes les entrées (aucune n'est masquée par le rôle ou le plan).
const complet: Access = { role: 'admin', plan: 'business' };
const tetes = (a: Access) => sectionsRail(railNav(a)).map((s) => s.tete.label);

describe('le rail mène par l’Accueil, puis par la boucle', () => {
  it('six modules, dans l’ordre du travail, « Accueil » en tête', () => {
    expect(tetes(complet)).toEqual(['Accueil', 'Veille', 'Studios', 'Bibliothèque', 'Résultats', 'Jarvis']);
  });

  it('aucune rubrique au-dessus des modules · un seul groupe, sans en-tête', () => {
    const groupes = railNav(complet);
    expect(groupes.map((g) => g.group)).toEqual(['Principal']);
    expect(RAIL_GROUP_LABEL['Principal'], 'une rubrique réapparaît au-dessus des modules').toBe('');
    for (const ancien of ['Observer', 'Créer', 'Tester', 'Observatoire', 'Atelier', 'Laboratoire', 'Pilotage', 'Piloter']) {
      expect(Object.values(RAIL_GROUP_LABEL), `rubrique « ${ancien} » revenue`).not.toContain(ancien);
    }
  });

  it('Analytics est l’onglet de l’Accueil, jamais une entrée du rail (une seule fois)', () => {
    const sections = sectionsRail(railNav(complet));
    const accueil = sections[0]!;
    expect(accueil.tete).toMatchObject({ label: 'Accueil', href: '/dashboard' });
    expect(accueil.onglets.map((o) => ({ label: o.label, href: o.href }))).toEqual([{ label: 'Analytics', href: '/dashboard?vue=analytics' }]);
    expect(sections.map((s) => s.tete.label)).not.toContain('Analytics');
    expect(railNav(complet).flatMap((g) => g.items).filter((i) => i.label === 'Analytics')).toHaveLength(1);
  });

  it('les anciens noms d’écran ne reviennent pas (Adsmap → Résultats, Assets → Bibliothèque)', () => {
    const libelles = railNav(complet).flatMap((g) => g.items).map((i) => i.label);
    expect(libelles).not.toContain('Adsmap');
    expect(libelles).not.toContain('Assets');
  });

  it('le libellé de groupe est bien câblé dans le rail (layout)', () => {
    // Le label vit dans le rail par le layout · sans ce câblage, le rail
    // afficherait la clé interne « Principal ».
    expect(LAYOUT).toMatch(/RAIL_GROUP_LABEL\[g\.group\]/);
  });
});
