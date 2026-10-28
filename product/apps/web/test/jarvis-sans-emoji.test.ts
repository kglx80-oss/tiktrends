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

// La liste des couches vit HORS du dossier · les icônes de section y étaient
// définies en emoji (`icon: '🎯'`), invisibles au scan du dossier · c'est
// exactement le trou qui a laissé passer la page Jarvis. On l'ajoute ici.
FICHIERS.push({ rel: 'lib/jarvis-state.ts', src: readFileSync(join(process.cwd(), 'lib/jarvis-state.ts'), 'utf8') });
// Vague 3 · Jarvis est exclusif à Spatial · ses écrans (conversation, Sources,
// depuis la Veille) et la page Sources sont scannés à la même règle.
for (const rel of ['spatial/vues/jarvis/Jarvis.tsx', 'spatial/vues/jarvis/Sources.tsx', 'spatial/vues/jarvis/sources-client.tsx', 'spatial/vues/jarvis/JarvisVeille.tsx', 'app/(spatial)/sp/jarvis/sources/page.tsx']) {
  FICHIERS.push({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') });
}
// Les sections relocalisées (montées sur Adsmap, Analytics, Veille) vivent dans
// `jarvis/sections` · même règle · un emoji réintroduit là-bas doit tomber ici.
// (Les essais ont rejoint Résultats dans Spatial · gardés par `adsmap-sans-emoji`.)
// Vague 4 · `SectionMarche` est retirée avec la Veille V5 · la mémoire marché Spatial (`marche-client`) est scannée.
FICHIERS.push({ rel: 'spatial/vues/veille/marche-client.tsx', src: readFileSync(join(process.cwd(), 'spatial/vues/veille/marche-client.tsx'), 'utf8') });
// Vague 2 Spatial v4 · `SectionAttribution` est retirée avec l'ancien Accueil (bilan porté dans Spatial).

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
    // Les panneaux V5 restants (contexte) et les vues Spatial (icônes du sprite).
    expect(tout).toMatch(/<Icon name="brain"/);
    expect(tout).toMatch(/<Ic n="spark"/);
    expect(tout).toMatch(/<Ic n="folder"/);
  });

  it('les couches d’état portent un NOM d’icône du jeu, rendu dynamiquement', () => {
    const state = FICHIERS.find((f) => f.rel === 'lib/jarvis-state.ts')!.src;
    const page = FICHIERS.find((f) => f.rel === 'app/(spatial)/sp/jarvis/sources/page.tsx')!.src;
    // les descripteurs ne portent plus d'emoji mais des noms du jeu…
    expect(state, 'les sections doivent porter un nom d’icône, pas un emoji').toMatch(/icon: 'target'/);
    expect(state).toMatch(/icon: 'radar'/);
    // …et l'écran Spatial n'affiche jamais ce nom en texte brut (l'état se dit par une pastille).
    expect(page, 'l’écran ne doit pas afficher le nom d’icône').not.toMatch(/l\.icon/);
    expect(page).toContain('libelleEtat: STATE_LABEL[l.state]');
  });
});
