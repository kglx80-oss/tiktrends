// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 20B · Sauvegardes · les commandes s'alignent d'une carte à l'autre.
 *
 * Mesuré au navigateur avant correction (70200777, fixtures synthétiques aux
 * noms d'annonceur et de board longs, `recette-b20.mjs`) · écart vertical
 * (max − min) du HAUT de « Ranger dans un board », du choix « Format » et du
 * pont Adsmap entre les cartes d'une même rangée :
 *
 *   largeur · colonnes · rangée 1 · rangée 2
 *   1440    · 4        · 64,6 px  · 24,8 px
 *   1280    · 4        · 53,4 px  · 29,9 px
 *   390     · 1        · 0 (une carte par rangée, rien à aligner)
 *
 * Cause · chaque cellule était une colonne flex (carte puis commandes) · la carte
 * commune `AdCard` (partagée avec Veille, Formats, Nouveautés, découverte,
 * accueil public · non modifiée ici) change de hauteur avec un nom sur deux
 * lignes, un texte présent ou absent, un badge « Piste forte » · les commandes
 * suivaient. Correction · la cellule devient une SOUS-GRILLE (`subgrid`) qui
 * occupe une piste de la grille par élément (carte, ranger, format, pont) · les
 * pistes sont partagées par toute la rangée, donc chaque commande commence à la
 * même hauteur sur chaque carte.
 *
 * Deux défauts vus en mesurant la première version, gardés ici · le choix
 * « Format » (une grille) étiré à sa piste répartissait l'excédent entre ses
 * lignes (4 px de décalage du champ à 1440 et 1280) · et la colonne `auto` de
 * la cellule s'élargissait au contenu sans retour à la ligne (la carte au nom
 * long chevauchait sa voisine, vu sur la capture). Après correction, mesuré au
 * navigateur (même recette) · ranger, format, pont et bas de carte · 0 px aux
 * trois largeurs · aucun descendant ne dépasse sa cellule (0 px) · aucun
 * chevauchement (0 px).
 *
 * Cette garde rend le composant et lit la STRUCTURE qui produit l'alignement ·
 * la mise en page elle-même ne se mesure qu'au navigateur.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }), useToastSiPresent: () => null }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackSavedAdAction: async () => ({}) }));
vi.mock('../app/actions/inspo', () => ({ setSavedAdFolder: async () => ({ ok: true }), classerFormatSauvegarde: async () => ({ ok: true }) }));
vi.mock('../components/AdCard', () => ({ AdCard: ({ ad }: { ad: { id: string } }) => <div data-adcard={ad.id} /> }));

import { SavedBoards, type SavedItem } from '../components/SavedBoards';
import type { InspoAd } from '@tiktrends/integrations';

const ad = (id: string, nom: string, body?: string) => ({ id, platform: 'meta', status: 'active', daysRunning: 3, mediaType: 'image', advertiserName: nom, body }) as InspoAd;
const items: SavedItem[] = [
  { id: 's1', externalId: 'e1', platform: 'meta', folder: 'Routines du soir · peaux sensibles et réactives · printemps 2027', ad: ad('e1', 'Laboratoires Dermatologiques Avancés de la Côte d’Azur et Associés', 'Trois gestes le soir.') },
  { id: 's2', externalId: 'e2', platform: 'meta', folder: null, ad: ad('e2', 'Nox') },
  { id: 's3', externalId: 'e3', platform: 'meta', folder: 'Hooks', ad: ad('e3', 'Maison Héritage Parfumerie Artisanale Française Indépendante', 'Un parfum de peau.') },
];

function lire(props: { adsmap?: boolean; refusAdsmap?: string | null }) {
  const h = document.createElement('div');
  h.innerHTML = renderToStaticMarkup(<SavedBoards items={items} followKeys={[]} {...props} />);
  const grille = [...h.querySelectorAll('div')].find((d) => /grid-template-columns:\s*repeat\(auto-fill/.test(d.getAttribute('style') ?? ''));
  expect(grille, 'la grille des cartes n’est pas rendue').toBeTruthy();
  const cellules = [...grille!.children] as HTMLElement[];
  expect(cellules).toHaveLength(items.length);
  // Le rôle de chaque enfant direct, dans l'ordre · une piste par rôle.
  const roles = (c: HTMLElement) => [...c.children].map((e) =>
    e.querySelector('[data-adcard]') || e.matches('[data-adcard]') ? 'carte'
      : e.querySelector('button[aria-expanded]') ? 'ranger'
        : e.querySelector('select[data-format-choix]') ? 'format'
          : e.matches('[data-pont-refus]') || e.querySelector('[data-pont-refus]') || /Suivre dans Adsmap/.test(e.textContent ?? '') ? 'pont' : '?');
  return { grille: grille!, cellules, roles };
}
const style = (e: Element) => e.getAttribute('style') ?? '';

describe('Sauvegardes · les commandes partagent les pistes de leur rangée', () => {
  for (const [cas, props, attendus] of [
    ['pont ouvert', { adsmap: true }, ['carte', 'ranger', 'format', 'pont']],
    ['pont fermé, raison dite', { adsmap: false, refusAdsmap: 'Suivre dans Adsmap · inclus dans l’offre Plus.' }, ['carte', 'ranger', 'format', 'pont']],
    ['sans pont (composant seul, défaut)', {}, ['carte', 'ranger', 'format']],
  ] as const) {
    it(`${cas} · chaque cellule est une sous-grille qui couvre une piste par élément, dans le même ordre`, () => {
      const { grille, cellules, roles } = lire(props);
      expect(style(grille), 'la liste des cartes n’est plus une grille').toMatch(/display:\s*grid/);
      for (const c of cellules) {
        expect(roles(c), 'les commandes ne sont pas des enfants directs dans le même ordre').toEqual(attendus);
        expect(style(c), 'la cellule ne partage pas les pistes de sa rangée (pas de subgrid) · une carte plus haute décale ses commandes').toMatch(/grid-template-rows:\s*subgrid/);
        expect(style(c), 'la colonne de la cellule n’est pas bornée · un nom long l’élargit au-delà de la grille et la carte chevauche sa voisine').toMatch(/grid-template-columns:\s*minmax\(0(px)?,\s*1fr\)/);
        const span = Number(/grid-row:\s*span (\d+)/.exec(style(c))?.[1] ?? NaN);
        expect(span, 'la cellule ne couvre pas une piste par élément · les commandes se décalent').toBe(c.children.length);
        // Une commande étirée à la hauteur de sa piste ne doit pas répartir
        // l'excédent entre ses propres lignes (grille ou flex) · son champ
        // descendrait d'une carte à l'autre (mesuré · 4 px sur « Format »).
        for (const e of [...c.children].slice(1)) {
          expect(style(e), `la commande « ${roles(c)[[...c.children].indexOf(e)]} » s'étire avec sa piste · son contenu se décale`).not.toMatch(/display:\s*(grid|flex)/);
        }
      }
    });
  }
});
