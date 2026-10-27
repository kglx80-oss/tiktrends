import { describe, expect, it } from 'vitest';
import { ligneMarque, messagesListeMarques, ordreMarques, MESSAGES_SUPPRESSION_MARQUE } from '../src';

describe('Spatial · liste des marques · règles', () => {
  it('les retours des actions qui y redirigent, mêmes textes que l’écran V5 (refus de suppression compris)', () => {
    const m = messagesListeMarques();
    expect(m['ok:deleted']).toBe('Marque supprimée.');
    expect(m['e:forbidden']).toBe('Action réservée aux administrateurs.');
    expect(m['e:studio_historique']).toBe(MESSAGES_SUPPRESSION_MARQUE.studio_historique);
    expect(m['ok:inconnu']).toBeUndefined();
  });
  it('la ligne d’une marque · catégorie puis domaine, ou « Profil à compléter »', () => {
    expect(ligneMarque({ category: 'Beauté', url: 'https://www.neva.fr/produits' })).toEqual({ texte: 'Beauté · neva.fr', domaine: 'neva.fr' });
    expect(ligneMarque({ category: null, industry: 'Sport', url: null })).toEqual({ texte: 'Sport', domaine: null });
    expect(ligneMarque({})).toEqual({ texte: 'Profil à compléter', domaine: null });
  });
  it('la marque active d’abord, puis l’ordre alphabétique', () => {
    const l = [{ id: 'a', nom: 'Zèbre' }, { id: 'b', nom: 'abeille' }, { id: 'c', nom: 'Marée' }];
    expect(ordreMarques(l, 'a').map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(ordreMarques(l, null).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});
