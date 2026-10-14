import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'état « je suis ici » du rail était un pavé accent PLEIN · le proprio l'a
 * trouvé lourd. Il devient un liséré accent + une teinte légère : on voit où
 * l'on est sans que l'item écrase le reste de la liste. La coquille est un gros
 * composant client, illisible en rendu · on lit la source.
 */
const SRC = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');

// Lot V5 · B · le liséré V5 est une barre de 3 px collée au BORD du rail (plus
// un liseré intérieur), sur le fond de sélection V5 (--accent-soft, une teinte
// sombre, jamais l'accent plein) · mesurés sur la référence. Le rendu (barre
// présente sur l'entrée courante seulement) est gardé dans uxv5-coquille-rendu.
describe('l’item actif du rail est un liséré, pas un pavé plein', () => {
  it('porte une barre accent de 3 px, sur un fond seulement teinté', () => {
    expect(SRC, 'la barre accent a disparu de l’item actif').toMatch(/\{active && <span aria-hidden data-barre-active style=\{\{[^}]*width: R\.barre\.largeur[^}]*background: 'var\(--accent-strong\)'/);
    // Le fond de la RANGÉE (posé juste après `position: 'relative'`), pas la
    // pastille de 5 px des sous-entrées.
    expect(SRC, 'le fond de l’item actif n’est plus une teinte légère').toMatch(/position: 'relative',\s*background: active \? 'var\(--accent-soft\)'/);
  });
});
