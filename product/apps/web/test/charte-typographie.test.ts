import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La typographie des titres suit la charte (design.md) · pas la mienne.
 *
 * ── Ce qui était faux ────────────────────────────────────────────────────────
 *
 * Les jetons partagés portaient un titre de PAGE à 26px/800 et un titre de
 * SECTION à 17px/800. La charte validée veut : titre de page 32px desktop /
 * 28px mobile, titre de section 18–20px, et des graisses SOBRES (elle privilégie
 * les graisses légères · jamais 800). Et les en-têtes doivent être sobres · pas
 * de bandeau rose, y compris sur les écrans créatifs.
 *
 * On vérifie le RÉSULTAT dans la source des jetons et des en-têtes de référence.
 * Remettre 800, rapetisser le titre, ou recoller un bandeau dégradé fait tomber.
 */
const lit = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('charte · jetons de titre partagés', () => {
  const ui = lit('components/ui.tsx');
  // On isole les déclarations des jetons h1/h2 pour ne pas juger le reste.
  const decl = (nom: string) => {
    const i = ui.indexOf(`export const ${nom}: CSSProperties`);
    return i < 0 ? '' : ui.slice(i, ui.indexOf('\n', i));
  };
  const h1 = decl('h1');
  const h2 = decl('h2');

  it('le titre de PAGE fait 32 desktop / 28 mobile', () => {
    // clamp(28px, …, 32px) · borne basse 28 (mobile), borne haute 32 (desktop).
    expect(h1).toMatch(/clamp\(28px,[^)]*32px\)/);
  });

  it('le titre de SECTION est dans 18–20px', () => {
    expect(h2).toMatch(/fontSize: ?(18|19|20)\b/);
  });

  it('aucun titre partagé n’est en graisse 800 · la charte veut sobre', () => {
    expect(h1, 'le titre de page est trop gras (800)').not.toMatch(/fontWeight: ?800/);
    expect(h2, 'le titre de section est trop gras (800)').not.toMatch(/fontWeight: ?800/);
    // Et la graisse choisie reste légère (≤ 600).
    expect(h1).toMatch(/fontWeight: ?(400|500|600)\b/);
    expect(h2).toMatch(/fontWeight: ?(400|500|600)\b/);
  });
});

describe('charte · en-têtes sobres · pas de bandeau dégradé', () => {
  // Les en-têtes de page portaient un bandeau `linear-gradient(135deg, rgba(230,0,126…`
  // (Jarvis, Sources) et l'accueil un `rgba(230,0,126,.22)`. Sobres désormais.
  const REFS = [
    'app/(app)/jarvis/page.tsx',
    'app/(app)/jarvis/sources/page.tsx',
    'components/AssistantHome.tsx',
  ];
  for (const rel of REFS) {
    it(`${rel} n’a plus de bandeau rose en en-tête`, () => {
      const src = lit(rel);
      expect(src, `${rel} · bandeau dégradé 135deg encore présent`).not.toMatch(/linear-gradient\(135deg, rgba\(230,0,126/);
      expect(src, `${rel} · bandeau d'accueil rose encore présent`).not.toContain('rgba(230,0,126,.22)');
    });
  }
});
