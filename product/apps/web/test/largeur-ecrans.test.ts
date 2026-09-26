import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LARGEURS } from '../components/ui';

/**
 * « Exploiter tout l'espace » · les écrans à données tiennent la largeur standard.
 *
 * Les largeurs avaient dérivé (940, 1000, 1040… au hasard) et certains écrans
 * paraissaient tassés à côté de leurs voisins à 1180. On fixe le palier `data`
 * et on cloue au RÉSULTAT que les écrans précédemment étroits l'ont adopté · un
 * retour en arrière (un écran qui reglisse sous la largeur standard) fait
 * échouer ce garde, en nommant le fichier.
 */

const lire = (rel: string) => readFileSync(join(process.cwd(), 'app', '(app)', rel), 'utf8');

describe('largeurs de contenu · le standard', () => {
  it('les quatre paliers sont fixes et ordonnés', () => {
    expect(LARGEURS).toEqual({ table: 1320, data: 1180, detail: 1040, prose: 760 });
    expect(LARGEURS.data).toBe(1180);
  });
});

describe('largeurs de contenu · les écrans data élargis', () => {
  // Chaque écran précédemment étroit doit porter la largeur standard sur son
  // conteneur principal, et ne plus porter son ancienne largeur bridée.
  // Jarvis a QUITTÉ ce palier · c'est un écran CONVERSATIONNEL, pas un tableau
  // de données · il tient une colonne calme de 760 px (charte validée, Codex ·
  // 26/09/2026). Les vraies pages de données gardent la largeur standard.
  const cas: Array<{ fichier: string; large: string; ancienne: string }> = [
    { fichier: 'brands/[id]/page.tsx', large: 'maxWidth: LARGEURS.data', ancienne: 'maxWidth: 940' },
    { fichier: 'studio/image/page.tsx', large: 'maxWidth: 1180', ancienne: 'maxWidth: 1000' },
    { fichier: 'studio/video/page.tsx', large: 'maxWidth: 1180', ancienne: 'maxWidth: 1000' },
  ];

  for (const c of cas) {
    it(`${c.fichier} · tient la largeur standard (1180), plus l'ancienne`, () => {
      const src = lire(c.fichier);
      expect(src.includes(c.large), `${c.fichier} doit porter ${c.large}`).toBe(true);
      expect(src.includes(c.ancienne), `${c.fichier} garde encore ${c.ancienne}`).toBe(false);
    });
  }

  it('jarvis/page.tsx · écran conversationnel · colonne 760, pas la largeur data', () => {
    const src = lire('jarvis/page.tsx');
    expect(src.includes('maxWidth: 760'), 'Jarvis doit tenir la colonne conversationnelle 760').toBe(true);
    expect(src.includes('maxWidth: 1180'), 'Jarvis ne doit plus porter la largeur data 1180').toBe(false);
  });
});
