import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Empty } from '../components/Empty';

/**
 * Un état vide n'est pas une impasse · c'est le premier écran d'une fonction, et
 * il doit dire quoi faire. Des listes vides étaient des phrases grises sans
 * issue. On les passe au composant `Empty` · sur le ton `todo`, le type IMPOSE
 * une action (erreur de compilation sinon), donc plus de cul-de-sac.
 *
 * (On ne peut pas rendre les écrans migrés ici · ils importent des actions
 * serveur `server-only`. On prouve donc le CONTRAT d'Empty par le rendu, et
 * l'adoption par la source.)
 */

describe("un état « todo » rend une sortie · c'est le contrat", () => {
  const html = renderToStaticMarkup(
    <Empty tone="todo" icon="🔖" title="Aucune créa sauvegardée." action={{ label: 'Ouvrir la veille', href: '/veille' }} />,
  );
  it('affiche le fait et une action cliquable', () => {
    expect(html).toContain('Aucune créa sauvegardée.');
    expect(html).toContain('Ouvrir la veille');
    expect(html).toContain('href="/veille"');
  });
});

describe('les états vides migrés adoptent le composant partagé', () => {
  const lit = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
  const CAS: Array<{ fichier: string; attendus: string[] }> = [
    { fichier: 'components/SavedBoards.tsx', attendus: ['<Empty', 'tone="todo"', "href: '/veille'"] },
    { fichier: 'app/(app)/saved/page.tsx', attendus: ['<Empty', 'tone="todo"', "href: '/veille'"] },
    { fichier: 'app/(app)/veille/scale/page.tsx', attendus: ['<Empty', 'tone="wait"'] },
  ];
  for (const { fichier, attendus } of CAS) {
    it(`${fichier} adopte Empty`, () => {
      const src = lit(fichier);
      for (const a of attendus) expect(src.includes(a), `${fichier} · manque « ${a} »`).toBe(true);
    });
  }

  it('les trois onglets Jarvis mènent à Pubs IA · plus de phrase sans issue', () => {
    const src = lit('app/(app)/jarvis/page.tsx');
    const n = src.split("href: '/studio/ads'").length - 1;
    expect(n, 'attendu au moins 3 sorties « Ouvrir Pubs IA »').toBeGreaterThanOrEqual(3);
  });
});
