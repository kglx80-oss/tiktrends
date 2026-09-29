import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lot UI Tri · audit /adsmap/tri. Les actions principales passaient déjà par le
 * helper `btn` (cible 44). Restaient deux défauts de présentation :
 *  - « réinitialiser », le lien du message « Aucun résultat pour … », rendait
 *    20 px (bouton texte nu inline) ;
 *  - le support flottait (il recouvrait le bouton « Valider » au défilement à 390)
 *    au lieu d'être ancré en pied comme sur les autres écrans Adsmap.
 *
 * On cloue la STRUCTURE à la source. Aucun moteur / connecteur / métier touché.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const src = read('app/(app)/adsmap/tri/Curation.tsx');
const shell = read('components/AppShell.tsx');

describe('Tri · cibles tactiles 44 (source)', () => {
  it('« réinitialiser » (lien du message sans-résultat) porte la cible tactile', () => {
    const i = src.indexOf('>réinitialiser</button>');
    expect(i, 'lien « réinitialiser » introuvable').toBeGreaterThan(-1);
    const style = src.slice(Math.max(0, i - 320), i);
    expect(style, 'le lien « réinitialiser » sous la cible tactile').toContain('minHeight: CIBLE_TACTILE_MIN');
  });

  it('le helper btn garde la cible tactile · toutes les actions principales restent ≥44 (non-régression)', () => {
    const i = src.indexOf("const btn = (ton:");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 320)).toContain('minHeight: CIBLE_TACTILE_MIN');
  });
});

describe('Tri · le support est ANCRÉ (il ne recouvre plus le contenu)', () => {
  it('/adsmap/tri entre dans la liste des écrans à support ancré', () => {
    expect(shell, 'le support de /adsmap/tri flotte encore et recouvre le contenu au défilement')
      .toContain("pathname === '/adsmap/tri'");
  });
});
