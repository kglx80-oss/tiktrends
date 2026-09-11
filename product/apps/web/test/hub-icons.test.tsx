import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hub } from '../components/Hub';
import { ICON_PATHS } from '../components/Icon';

/**
 * Le hub Studio · la page de garde qui oriente vers les quatre studios (dont
 * Pubs IA, le produit phare). Ses cartes portaient un emoji dans la pastille
 * (✨ 🖼️ 🎬 ✍️). On passe au jeu d'icônes au trait · RÉSULTAT prouvé par rendu
 * (Hub n'importe que Link/core/Icon, donc il se rend ici), dérive interdite par
 * un scan des noms d'icône de la page hub.
 */
describe('la carte du hub rend une icône au trait', () => {
  const html = renderToStaticMarkup(
    <Hub
      intro="x"
      cards={[{ href: '/studio/ads', icon: 'sparkles', title: 'Pubs IA', makes: 'des pubs', when: 'quand', state: { kind: 'ready' } }]}
    />,
  );
  it('montre un <svg>, jamais l’emoji brut', () => {
    expect(html).toContain('<svg');
    expect(html, 'une carte premium ne porte pas d’emoji').not.toMatch(/✨|🖼️|🎬|✍️/u);
  });
});

describe('chaque icône de carte du hub Studio existe dans le jeu · jamais un emoji', () => {
  const src = readFileSync(join(process.cwd(), 'app/(app)/studio/page.tsx'), 'utf8');
  const noms = [...src.matchAll(/icon: '([^']*)'/g)].map((m) => m[1]!);

  it('les cartes déclarent au moins les quatre studios', () => {
    expect(noms.length).toBeGreaterThanOrEqual(4);
  });

  it('chaque `icon:` est un nom connu du jeu, jamais un emoji', () => {
    const fautifs = noms.filter((n) => !(n in ICON_PATHS) || /[^\x00-\x7F]/.test(n));
    expect(fautifs, `Icône(s) de carte invalide(s) : ${fautifs.join(', ')}`).toEqual([]);
  });
});
