// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

/**
 * Lot 18B · Veille · ce qu'on VOIT (mesures au navigateur · MATRICE-lot18B) ·
 * le lien vers les annonces du même annonceur, le retour à SA recherche depuis
 * la Veille et le Studio, les filtres de « Ce qui scale » dans l'URL.
 */
// La fiche V5 (et son composant `RetourVeille`) est retirée · le retour vit dans la fiche Spatiale,
// par la règle `retourVeilleProjet` (rendu gardé par `spatial-projet-libre` et `l4b-pages-rendu`).
const { retourVeilleProjet } = await import('@tiktrends/core');

// Vague 4 · la carte V5 (`AdCard`) est retirée · le lien « Toutes les pubs de l’annonceur » et l’ancre de
// la carte Spatial sont gardés par `spatial-veille-gestes` / `spatial-veille`.

describe('Retour à la recherche (lot 18B)', () => {
  it('dit le terme et vise la carte d’origine', () => {
    expect(retourVeilleProjet([{ statut: 'active', retourVeille: 'q=routine&page=2#ad-meta-mock-044' }])).toEqual({ href: '/veille?q=routine&page=2#ad-meta-mock-044', terme: 'routine' });
  });
  it('une valeur forgée ne sort jamais de la Veille · sans contexte, rien', () => {
    expect(retourVeilleProjet([{ statut: 'active', retourVeille: '//evil.example/x' }])?.href).toBe('/veille');
    expect(retourVeilleProjet([{ statut: 'active', retourVeille: null }])).toBeNull();
  });
});

// Vague 4 · « Retour sur la carte d’origine » est porté sur Pubs du moment (`DefileAncre`, Spatial) ·
// gardé dans `spatial-veille-gestes`.
