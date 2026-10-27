import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Adsmap n'affiche plus d'emoji d'interface · rollout icônes (retour proprio #2).
 * L'ancienne Adsmap est retirée · la garde porte sur les vues Spatial de
 * Résultats et leurs pages · « budget qui brûle » et « Studio » restent des
 * icônes du jeu (sprite de la maquette), jamais un pictogramme.
 */
const DOSSIERS = ['spatial/vues/resultats', 'app/(spatial)/sp/adsmap'];
const lister = (d: string): string[] => readdirSync(join(process.cwd(), d), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? lister(join(d, e.name)) : e.name.endsWith('.tsx') ? [join(d, e.name)] : []));
const FICHIERS = DOSSIERS.flatMap(lister).map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2728}\u{2726}\u{FE0F}]/gu;

describe('Adsmap · plus aucun emoji d’interface', () => {
  it('le périmètre est bien parcouru', () => {
    expect(FICHIERS.length).toBeGreaterThan(20);
  });
  it('aucun fichier ne porte de pictogramme', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = [...new Set(src.match(PICTO) ?? [])];
      expect(trouves, `pictogramme(s) encore dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('« budget qui brûle » et « Studio » rendent des icônes du jeu', () => {
    const table = FICHIERS.find((f) => f.rel.endsWith('Tests.tsx'))!.src;
    expect(table).toMatch(/<Ic n="warn" \/>À couper/);
    expect(table).toMatch(/<Ic n="spark" \/>/);
  });
});
