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
  // Jarvis a QUITTÉ ce palier · c'est un écran CONVERSATIONNEL · depuis B
  // (Kevin, 29/09) son CADRE s'aligne sur les bords de la Veille (1200) et la
  // largeur de LECTURE est bornée à la colonne prose (760) À L'INTÉRIEUR · voir
  // l'assertion dédiée plus bas. Les vraies pages de données gardent 1180.
  const cas: Array<{ fichier: string; large: string; ancienne: string }> = [
    // Depuis B2 (#118), le cadre extérieur vient de `cadrePage` (1200, charte) ·
    // voir b2-cadre-routes. On garde ici l'interdit des anciennes largeurs bridées.
    { fichier: 'brands/[id]/page.tsx', large: 'cadrePage', ancienne: 'maxWidth: 940' },
    { fichier: 'studio/image/page.tsx', large: 'cadrePage', ancienne: 'maxWidth: 1000' },
    { fichier: 'studio/video/page.tsx', large: 'cadrePage', ancienne: 'maxWidth: 1000' },
  ];

  for (const c of cas) {
    it(`${c.fichier} · tient le cadre commun (cadrePage), plus l'ancienne`, () => {
      const src = lire(c.fichier);
      expect(src.includes(c.large), `${c.fichier} doit porter ${c.large}`).toBe(true);
      expect(src.includes(c.ancienne), `${c.fichier} garde encore ${c.ancienne}`).toBe(false);
    });
  }

  // Kevin, 29/09 · B · Jarvis n'est PLUS bridé à 760 · son CADRE et son composeur
  // s'alignent sur les bords de la Veille (1200). La largeur de LECTURE reste
  // calée à la colonne prose (760) À L'INTÉRIEUR · voir jarvis-cadre-veille.
  it('jarvis/page.tsx · cadre conversationnel aux bords Veille (1200), plus le plafond 760', () => {
    const src = lire('jarvis/page.tsx');
    const iMain = src.lastIndexOf('<main style=');
    const cadre = src.slice(iMain, iMain + 170);
    expect(cadre.startsWith('<main style={cadrePage}>'), 'le cadre conversationnel doit s’aligner à 1200 (Veille)').toBe(true);
    expect(cadre.includes('maxWidth: 760'), 'le plafond 760 ne doit plus brider le cadre').toBe(false);
  });
});
