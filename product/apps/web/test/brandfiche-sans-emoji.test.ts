import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La fiche marche (page + DA + Shopify + concurrent) n'affiche plus d'emoji
 * d'interface · rollout icônes (retour proprio #2). ✦ → <Icon sparkles>, 🎨 →
 * <Icon palette>, ✎ → <Icon pen>, 🔗 → <Icon link>. La flèche ↻ (synchro),
 * monochrome, est gardée.
 */
const FICHIERS = [
  'app/(app)/brands/[id]/page.tsx',
  'app/(app)/brands/[id]/BrandDA.tsx',
  'app/(app)/brands/[id]/ShopifyConnect.tsx',
  'app/(app)/brands/[id]/competitors/[name]/page.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

describe('Fiche marque · plus aucun emoji d’interface', () => {
  it('aucun fichier ne porte de pictogramme', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = [...new Set(src.match(PICTO) ?? [])];
      expect(trouves, `pictogramme(s) encore dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('les conversions rendent des icônes du jeu', () => {
    const tout = FICHIERS.map((f) => f.src).join('\n');
    expect(tout).toMatch(/<Icon name="sparkles"/);
    // La palette des sections d'identité vient de la source partagée
    // (`SECTIONS_IDENTITE`, H4) · BrandDA la rend par <Icon name={…icone}>.
    const identite = readFileSync(join(process.cwd(), '../../packages/core/src/identite-marque.ts'), 'utf8');
    expect(identite, 'la section Styles ne porte plus l’icône palette').toMatch(/id: 'couleurs'[^\n]*icone: 'palette'/);
    expect(tout, 'BrandDA ne rend plus l’icône de section du jeu partagé').toMatch(/<Icon name=\{sectionDe\('couleurs'\)\.icone\}/);
    expect(tout).toMatch(/<Icon name="pen"/);
    expect(tout).toMatch(/<Icon name="link"/);
  });
});
