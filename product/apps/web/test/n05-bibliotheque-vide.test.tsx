import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { BibliothequeVide } from '../components/BibliothequeVide';

/**
 * CDC v7 · N05 · Sauvegardes · bibliothèque prioritaire.
 *
 * Trois états vides répétaient « Ouvrir la veille » · à froid, la page proposait
 * trois fois le même geste. Quand TOUT est vide, on montre UNE activation. Et
 * ouvrir la bibliothèque ne déclenche AUCUN scan payant.
 */

describe('N05 · une seule activation quand tout est vide', () => {
  it('la bibliothèque vide n’offre qu’UN « Ouvrir la veille », qui navigue (pas de scan)', () => {
    const h = renderToStaticMarkup(<BibliothequeVide />);
    const occurrences = h.split('Ouvrir la veille').length - 1;
    expect(occurrences, 'l’activation est répétée · une seule attendue').toBe(1);
    // L'activation NAVIGUE vers la Veille · elle ne lance pas d'analyse.
    expect(h, 'l’activation ne mène pas à la Veille').toContain('href="/veille"');
    expect(h, 'une bibliothèque vide ne doit pas parler de scan').not.toMatch(/scan/i);
  });
});

describe('N05 · la page ne dépense rien à l’ouverture', () => {
  const page = readFileSync(join(process.cwd(), 'app/(app)/saved/page.tsx'), 'utf8');

  it('rend une activation UNIQUE quand rien n’est sauvegardé, suivi, ni repéré', () => {
    // La page calcule « tout vide » et bascule sur une activation unique · les
    // onglets (et leurs empties par espace) ne reviennent qu'avec des données.
    expect(page).toMatch(/const toutVide = items\.length === 0 && brands\.length === 0 && trackerEvents\.length === 0/);
    expect(page).toMatch(/toutVide \? \(\s*<BibliothequeVide/);
  });

  it('n’appelle aucun scan payant au chargement · ouvrir la bibliothèque est gratuit', () => {
    // Le scan reste un geste explicite dans l'onglet Nouveautés · la page ne
    // l'importe ni ne l'invoque au rendu serveur.
    expect(page, 'la page importe une action de scan').not.toMatch(/scanTrackerAction/);
  });
});
