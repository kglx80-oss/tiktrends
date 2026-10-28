import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v7 · N05 · Sauvegardes · bibliothèque prioritaire.
 *
 * Trois états vides répétaient « Ouvrir la veille » · à froid, la page proposait
 * trois fois le même geste. Quand TOUT est vide, on montre UNE activation. Et
 * ouvrir la bibliothèque ne déclenche AUCUN scan payant.
 */

describe('N05 · la page ne dépense rien à l’ouverture', () => {
  // Vague 4 · la page V5 est retirée · Sauvegardes (Spatial) rend un état vide unique qui mène à la Veille.
  const page = readFileSync(join(process.cwd(), 'app/(spatial)/sp/saved/page.tsx'), 'utf8')
    + readFileSync(join(process.cwd(), 'spatial/vues/veille/Sauvegardes.tsx'), 'utf8');

  it('rend une activation UNIQUE quand rien n’est sauvegardé', () => {
    expect(page).toMatch(/: <EtatVide icone="bookmark" titre="Aucune créa sauvegardée pour l’instant"[^>]*action=\{\{ href: '\/veille'/);
  });

  it('n’appelle aucun scan payant au chargement · ouvrir la bibliothèque est gratuit', () => {
    // Le scan reste un geste explicite dans l'onglet Nouveautés · la page ne
    // l'importe ni ne l'invoque au rendu serveur.
    expect(page, 'la page importe une action de scan').not.toMatch(/scanTrackerAction/);
  });
});
