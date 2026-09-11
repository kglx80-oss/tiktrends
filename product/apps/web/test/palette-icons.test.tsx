import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CommandGlyph } from '../components/CommandPalette';
import { ICON_PATHS } from '../components/Icon';

/**
 * La palette ⌘K (et le rail) affichaient chaque commande avec un emoji
 * (🏠 ✨ 🧬 🖼️ 🎬 🧠 🔎 🗺️ …) · kitch et variable selon l'OS. On passe au jeu
 * d'icônes au trait.
 *
 * La palette renvoie `null` tant qu'elle n'est pas ouverte · impossible de la
 * rendre en test statique. On a donc sorti le glyphe de ligne en composant pur
 * (`CommandGlyph`) · c'est LE code que la palette rend, on le rend seul ici et on
 * prouve le `<svg>`. La dérive est bloquée par un scan du câblage dans AppShell.
 */
describe('le glyphe d’une commande rend une icône au trait', () => {
  it('montre un <svg>, jamais l’emoji brut', () => {
    const html = renderToStaticMarkup(<CommandGlyph icon="sparkles" />);
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/✨|🖼️|🎬|🧠|🔎|🗺️|🏠|🧬/u);
  });
  it('sans nom d’icône, un chevron sobre · pas de crash', () => {
    const html = renderToStaticMarkup(<CommandGlyph />);
    expect(html).toContain('›');
  });
});

describe('le câblage des commandes n’emploie plus d’emoji', () => {
  const shell = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');
  const palette = readFileSync(join(process.cwd(), 'components/CommandPalette.tsx'), 'utf8');

  it('AppShell ne construit plus aucune commande avec un champ emoji', () => {
    expect(shell).not.toContain('emojiFor');
    expect(shell, 'une commande premium se déclare avec `icon:`, jamais `emoji:`').not.toMatch(/\bemoji:/);
  });

  it('chaque `icon:` littéral de commande est un nom connu du jeu, jamais un emoji', () => {
    // On ne regarde que les valeurs LITTÉRALES · `icon: it.icon` vient des items
    // du rail, déjà des noms du jeu (le rail les rend en Icon).
    const noms = [...shell.matchAll(/icon: '([^']*)'/g)].map((m) => m[1]!);
    const fautifs = noms.filter((n) => !(n in ICON_PATHS) || /[^\x00-\x7F]/.test(n));
    expect(fautifs, `Icône(s) de commande invalide(s) : ${fautifs.join(', ')}`).toEqual([]);
    expect(noms.length, 'des commandes à icône littérale sont attendues').toBeGreaterThan(10);
  });

  it('la palette rend le glyphe partagé, jamais c.emoji', () => {
    expect(palette).toContain('<CommandGlyph');
    expect(palette).not.toMatch(/c\.emoji/);
  });
});
