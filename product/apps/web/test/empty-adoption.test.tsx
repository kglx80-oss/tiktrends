import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Empty, EmptyLine } from '../components/Empty';

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
    <Empty tone="todo" icon="bookmark" title="Aucune créa sauvegardée." action={{ label: 'Ouvrir la veille', href: '/veille' }} />,
  );
  it('affiche le fait et une action cliquable', () => {
    expect(html).toContain('Aucune créa sauvegardée.');
    expect(html).toContain('Ouvrir la veille');
    expect(html).toContain('href="/veille"');
  });
  it('l’illustration est une icône AU TRAIT (SVG), plus jamais un emoji', () => {
    expect(html).toContain('<svg');
    expect(html, 'un état vide premium ne porte pas d’emoji').not.toMatch(/🔖|📦|🗂️|🔍|🔭|🗺️/u);
  });
});

describe("un « todo » peut poser le geste SUR PLACE · le children est une sortie aussi", () => {
  // Un formulaire d'ajout ou un bouton d'upload est un geste au même titre qu'un
  // lien · le type accepte alors `todo` sans `action`, mais JAMAIS sans geste du
  // tout (voir la mutation dans le commentaire d'en-tête · elle ne compile pas).
  const html = renderToStaticMarkup(
    <Empty tone="todo" icon="box" title="Aucun produit pour l'instant." why="Ajoute-en un ci-dessous.">
      <button type="submit">+ Ajouter le produit</button>
    </Empty>,
  );
  it('affiche le fait et le déclencheur en children', () => {
    expect(html).toContain('Aucun produit pour l&#x27;instant.');
    expect(html).toContain('+ Ajouter le produit');
    expect(html).toContain('<button');
  });
});

describe('EmptyLine · une bonne nouvelle se voit, un manque reste sobre', () => {
  it('le ton « good » rend en vert · pas dans le gris d’un manque', () => {
    const bon = renderToStaticMarkup(<EmptyLine tone="good">Tout roule.</EmptyLine>);
    expect(bon).toContain('Tout roule.');
    expect(bon, 'une réussite doit se lire en vert').toContain('#7ee8bf');
    const neutre = renderToStaticMarkup(<EmptyLine>Rien pour l’instant.</EmptyLine>);
    expect(neutre, 'un simple manque ne s’affiche pas en vert').not.toContain('#7ee8bf');
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
    // Connexions · l'étape d'activation. Sans marque active, c'était une impasse
    // grise sans bouton · devient un `todo` qui pousse à choisir une marque.
    { fichier: 'app/(app)/connections/DataConnections.tsx', attendus: ['<Empty', 'tone="todo"', "href: '/brands'"] },
    // Crédits · l'historique vide devient une invitation à générer, comme sa
    // page sœur Consommation, au lieu d'une phrase grise sur une page d'argent.
    { fichier: 'app/(app)/credits/page.tsx', attendus: ['<Empty', 'tone="todo"', "href: '/studio'"] },
    // Liens de partage (marque blanche) · le geste « créer » est déjà au-dessus,
    // donc une ligne `EmptyLine`, pas un bloc redondant.
    { fichier: 'app/(app)/adsmap/SharePanel.tsx', attendus: ['<EmptyLine>', 'marque blanche'] },
    // Support · une liste de tickets vide est une BONNE nouvelle · ton `good`.
    { fichier: 'app/(app)/support/page.tsx', attendus: ['<EmptyLine tone="good">', 'tout roule'] },
    { fichier: 'app/(app)/support/[id]/page.tsx', attendus: ['<EmptyLine>'] },
  ];
  for (const { fichier, attendus } of CAS) {
    it(`${fichier} adopte Empty`, () => {
      const src = lit(fichier);
      for (const a of attendus) expect(src.includes(a), `${fichier} · manque « ${a} »`).toBe(true);
    });
  }

  it('chaque icône passée à Empty existe dans le jeu premium · jamais le repli grid', async () => {
    const { ICON_PATHS } = await import('../components/Icon');
    const { readdirSync, statSync } = await import('node:fs');
    const base = process.cwd();
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') && !p.includes('/test/') ? [p] : [];
    });
    const introuvables: string[] = [];
    for (const racine of ['app', 'components']) {
      for (const f of walk(join(base, racine))) {
        const src = readFileSync(f, 'utf8');
        if (!src.includes('<Empty')) continue;
        // Les noms d'icône passés en clair à un Empty (chaîne littérale).
        for (const m of src.matchAll(/icon="([a-z]+)"/g)) {
          const name = m[1]!;
          if (!(name in ICON_PATHS)) introuvables.push(`${f.slice(base.length + 1)} · « ${name} »`);
        }
      }
    }
    expect(introuvables, `Icône(s) Empty absente(s) du jeu · repli muet sur grid : ${introuvables.join(', ')}`).toEqual([]);
  });

  it('les trois onglets Jarvis mènent à Pubs IA · plus de phrase sans issue', () => {
    const src = lit('app/(app)/jarvis/page.tsx');
    const n = src.split("href: '/studio/ads'").length - 1;
    expect(n, 'attendu au moins 3 sorties « Ouvrir Pubs IA »').toBeGreaterThanOrEqual(3);
  });
});
