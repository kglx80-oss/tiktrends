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

describe("un « todo » peut poser le geste SUR PLACE · le children est une sortie aussi", () => {
  // Un formulaire d'ajout ou un bouton d'upload est un geste au même titre qu'un
  // lien · le type accepte alors `todo` sans `action`, mais JAMAIS sans geste du
  // tout (voir la mutation dans le commentaire d'en-tête · elle ne compile pas).
  const html = renderToStaticMarkup(
    <Empty tone="todo" icon="📦" title="Aucun produit pour l'instant." why="Ajoute-en un ci-dessous.">
      <button type="submit">+ Ajouter le produit</button>
    </Empty>,
  );
  it('affiche le fait et le déclencheur en children', () => {
    expect(html).toContain('Aucun produit pour l&#x27;instant.');
    expect(html).toContain('+ Ajouter le produit');
    expect(html).toContain('<button');
  });
});

describe('les états vides migrés adoptent le composant partagé', () => {
  const lit = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
  const CAS: Array<{ fichier: string; attendus: string[] }> = [
    { fichier: 'components/SavedBoards.tsx', attendus: ['<Empty', 'tone="todo"', "href: '/veille'"] },
    { fichier: 'app/(app)/saved/page.tsx', attendus: ['<Empty', 'tone="todo"', "href: '/veille'"] },
    { fichier: 'app/(app)/veille/scale/page.tsx', attendus: ['<Empty', 'tone="wait"'] },
    // Produits d'une marque : l'ancienne phrase grise devient un `todo` dont le
    // geste est le formulaire d'ajout (children) · et le rappel comptes pub
    // adopte la même grammaire avec une sortie vers les Connexions.
    { fichier: 'app/(app)/brands/[id]/page.tsx', attendus: ['<Empty', 'tone="todo"', '<AddProductForm', "href: '/connections'"] },
    // Bibliothèque d'assets : `todo` avec le bouton d'upload en children.
    { fichier: 'app/(app)/assets/AssetsLibrary.tsx', attendus: ['<Empty', 'tone="todo"', 'title="Aucun asset pour l\'instant."'] },
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
