import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v6 · R01 · un seul qualificatif de verdict, partout. La règle (libellé,
 * ton, exclusion de la relative des gagnantes, taux honnête) est prouvée au
 * noyau (`verdict-libelle.test.ts`). Ici on vérifie que les trois écrans Adsmap
 * (table, canvas, tiroir) tirent de cette SOURCE UNIQUE et ne réintroduisent pas
 * la divergence · composants client volumineux, non rendables · adoption source.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), `app/(app)/adsmap/${rel}`), 'utf8');
const ECRANS = ['AdsMapTable.tsx', 'Canvas.tsx', 'AdDrawer.tsx'] as const;

describe('Adsmap · le verdict vient d’une source unique', () => {
  for (const f of ECRANS) {
    it(`${f} tire ses libellés de LIBELLE_VERDICT, sans carte codée en dur`, () => {
      const s = read(f);
      expect(s, 'ne consomme pas la source unique du noyau').toContain('LIBELLE_VERDICT');
      expect(s, 'garde une carte de libellés codée en dur').not.toContain("winner: 'Gagnante', baby_winner:");
      expect(s, 'affiche encore la relative comme une gagnante').not.toContain("relative_winner: 'Gagnante");
    });
  }

  it('table & canvas ne comptent plus la relative parmi les gagnantes', () => {
    for (const f of ['AdsMapTable.tsx', 'Canvas.tsx'] as const) {
      const s = read(f);
      expect(s, `${f} inclut encore la relative dans un ensemble de gagnantes`)
        .not.toContain("['winner', 'baby_winner', 'relative_winner']");
    }
    // La table calcule un taux honnête (Non calculable plutôt que 0 %).
    const t = read('AdsMapTable.tsx');
    expect(t, 'la table ne passe pas par le taux honnête du noyau').toContain('tauxReussite(');
    expect(t, 'la table n’affiche pas « Non calculable »').toContain('Non calculable');
  });

  it('les trois écrans appliquent le verdict EFFECTIF · un gagnant non comparable est prometteuse (N02)', () => {
    // La qualification consomme la comparabilité, partout · un « winner » importé
    // sans protocole ne se compte ni ne s'affiche comme une victoire prouvée.
    for (const f of ECRANS) {
      expect(read(f), `${f} n’applique pas verdictEffectif`).toContain('verdictEffectif(');
    }
    // Le décompte des gagnantes (canvas) et le gate « Cette créa gagne » (tiroir)
    // exigent la comparabilité · pas le simple ensemble absolu.
    expect(read('Canvas.tsx'), 'Canvas compte des gagnantes non comparables').toContain('estGagnanteValidee(');
    expect(read('AdDrawer.tsx'), 'le tiroir active « gagnante » sans exiger la comparabilité').toContain('estGagnanteValidee(');
  });
});
