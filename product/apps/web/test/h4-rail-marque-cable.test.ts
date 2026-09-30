import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * H4 · le câblage du groupe « Marque » dans la coquille.
 *
 * La RÈGLE (entrées, état actif ancre-conscient) est éprouvée au RÉSULTAT dans le
 * noyau (`packages/core` · rail-marque.test). Ici on cloue le CÂBLAGE · le layout
 * (serveur, non rendable · tire auth/db) et la coquille (gros composant client,
 * dépend du routeur) se lisent en source, même raison que rail-actif / H2.
 */
const LAYOUT = readFileSync(join(process.cwd(), 'app/(app)/layout.tsx'), 'utf8');
const SHELL = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');
const FICHE = readFileSync(join(process.cwd(), 'app/(app)/brands/[id]/page.tsx'), 'utf8');

describe('H4 · le groupe « Marque » tire ses entrées du noyau', () => {
  it('le layout monte le groupe « Marque » à partir de entreesMarque(bid)', () => {
    expect(LAYOUT, 'le groupe marque n’est plus nommé « Marque »').toContain("group: 'Marque'");
    expect(LAYOUT, 'les entrées « Marque » ne viennent plus du module pur entreesMarque').toContain('items: entreesMarque(bid)');
  });
});

describe('H4 · l’état actif du rail est ancre-conscient', () => {
  it('la coquille décide l’état actif via railEntreeActive (route + onglet + ancre)', () => {
    expect(SHELL, 'l’état actif n’est plus délégué à railEntreeActive').toContain('railEntreeActive(href, {');
    expect(SHELL, 'railEntreeActive ne reçoit pas l’ancre courante').toMatch(/hash: currentHash/);
    expect(SHELL, 'railEntreeActive ne reçoit pas les ancres déclarées du rail').toMatch(/ancres: ancresRail/);
  });

  it('la coquille SUIT l’ancre courante (hashchange) pour départager les entrées de même route', () => {
    expect(SHELL, 'l’ancre courante n’est plus suivie en état').toContain('setCurrentHash');
    expect(SHELL, 'le suivi d’ancre n’écoute plus hashchange').toContain("addEventListener('hashchange'");
  });

  it('l’ancre est prise au LIEN CLIQUÉ (Next pushState n’émet pas hashchange) et au retour navigateur', () => {
    // Recette H4 · au tiroir, clic « Charte » · URL #charte, « Aperçu » restait
    // allumé · `hashchange` n'était jamais émis par la navigation Next.
    expect(SHELL, 'l’ancre n’est plus prise au clic (capture) · Couleurs/Charte ne s’allumeraient pas au clic du rail').toContain("document.addEventListener('click', surClic, true)");
    expect(SHELL, 'précédent/suivant ne resynchronisent plus l’ancre').toContain("addEventListener('popstate'");
  });

  it('une entrée du rail cliquée REFERME le tiroir mobile, même sur un saut d’ancre de la même page', () => {
    // Recette H4 · 390 · clic « Charte » · la section défilait DERRIÈRE le tiroir,
    // resté ouvert · il ne se fermait qu'au changement de route.
    expect(SHELL, 'un saut d’ancre depuis le rail laisse le tiroir ouvert par-dessus la section').toContain("if (a.closest('#nav-rail')) setDrawer(false)");
  });
});

describe('H4 · la fiche ne pose le lien Assets qu’à portée explicite', () => {
  it('la fiche décide l’accès aux assets via accesAssets (marque consultée vs active)', () => {
    expect(FICHE, 'la fiche ne décide plus l’accès aux assets par accesAssets').toContain('accesAssets(b.id, await getActiveBrand(s.workspaceId))');
    expect(FICHE, 'le lien Assets n’est plus conditionné à la marque consultée = active').toContain("assets.kind === 'lien'");
  });
});
