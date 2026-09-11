import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Jarvis n'affiche plus d'emoji d'interface · rollout icônes (retour proprio #2).
 *
 * On scanne TOUT le dossier pour des pictogrammes colorés, pas une liste figée :
 * ainsi un emoji réintroduit demain dans n'importe quel panneau tombe aussi.
 *
 * Ce qu'on bannit : le plan emoji (🧠 🎓 🔒 …), les symboles divers, et les
 * étoiles décoratives ✦ ✨. Ce qu'on GARDE volontairement : les glyphes
 * typographiques monochromes ✓ (U+2713) et → (U+2192) · ce ne sont pas des
 * pictogrammes colorés, c'est de la ponctuation, et le proprio ne les vise pas.
 */
const DIR = join(process.cwd(), 'app/(app)/jarvis');
const FICHIERS = readdirSync(DIR)
  .filter((n) => n.endsWith('.tsx'))
  .map((n) => ({ rel: `jarvis/${n}`, src: readFileSync(join(DIR, n), 'utf8') }));

// Pictogrammes : plan emoji + symboles divers + étoiles décoratives. Pas ✓ ni →.
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2728}\u{2726}\u{FE0F}]/gu;

describe('Jarvis · plus aucun emoji d’interface', () => {
  it('a au moins scanné les panneaux attendus', () => {
    // garde-fou : si le glob casse, le test ne doit pas passer à vide.
    expect(FICHIERS.length).toBeGreaterThanOrEqual(6);
  });

  it('aucun fichier ne porte de pictogramme', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = [...new Set(src.match(PICTO) ?? [])];
      expect(trouves, `pictogramme(s) encore dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });

  it('les conversions rendent des icônes du jeu', () => {
    const tout = FICHIERS.map((f) => f.src).join('\n');
    expect(tout).toMatch(/<Icon name="brain"/);
    expect(tout).toMatch(/<Icon name="cap"/);
    expect(tout).toMatch(/<Icon name="lock"/);
    expect(tout).toMatch(/<Icon name="sparkles"/);
  });
});
