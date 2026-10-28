import { describe, expect, it } from 'vitest';

/**
 * Lot 12 · le menu de compte suit la garde réelle des pages. La palette ⌘K de
 * l'ancienne coquille V5 (rendue ici avant son retrait) n'existe plus · la
 * règle `sectionsCompteOuvertes` (lib/rbac) reste lue par la coquille Spatial.
 */
import { sectionsCompteOuvertes, accountSections as sections } from '../lib/rbac';
describe('Menu de compte · la section Espace suit la garde réelle des pages (lot 12)', () => {
  const hrefs = (g: ReturnType<typeof sections>) => g.flatMap((x) => x.items.map((i) => i.href));
  it('équipe plateforme « manager » avec un rôle d’espace membre · plus de Marques/Membres/Utilisation qui renvoient à l’accueil', () => {
    const a = { role: 'member' as const, plan: 'business' as const, equipe: { role: 'manager' as const, matrice: {} } };
    expect(hrefs(sections(a)), 'cas non reproduit · la matrice ne montre plus ces entrées').toContain('/brands');
    const h = hrefs(sectionsCompteOuvertes(a));
    for (const p of ['/brands', '/team', '/usage']) expect(h, p).not.toContain(p);
    expect(h).toContain('/support');
  });
  it('admin d’espace · section Espace intacte', () => {
    const a = { role: 'admin' as const, plan: 'business' as const };
    expect(hrefs(sectionsCompteOuvertes(a))).toEqual(hrefs(sections(a)));
  });
});
