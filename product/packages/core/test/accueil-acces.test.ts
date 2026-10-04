import { describe, expect, it } from 'vitest';
import { cheminOuvert, bandeauAccueil, liensOuverts, noteAccesAccueil, BANDEAU_LECTURE } from '../src/accueil-acces';

/** Lot 11 · l'accueil ne propose que ce que le rôle ouvre. */
const regles = [
  { href: '/studio', ouvert: false }, { href: '/studio/ads', ouvert: false },
  { href: '/brands', ouvert: true }, { href: '/adsmap', ouvert: true }, { href: '/veille', ouvert: false },
  { href: '/analytics', ouvert: true },
];
const ouvert = (h: string) => cheminOuvert(h, regles);

describe('accueil · accès par rôle', () => {
  it('la rubrique la plus précise tranche, un chemin non couvert reste ouvert', () => {
    expect(cheminOuvert('/brands/new', regles)).toBe(true);
    expect(cheminOuvert('/studio/ads', [{ href: '/studio', ouvert: true }, { href: '/studio/ads', ouvert: false }])).toBe(false);
    expect(cheminOuvert('/studio/image', [{ href: '/studio', ouvert: false }])).toBe(false);
    expect(cheminOuvert('/support', regles)).toBe(true);
    expect(cheminOuvert('/brandsx', [{ href: '/brands', ouvert: false }]), 'préfixe sans séparateur').toBe(true);
  });
  it('bandeau · le geste fermé disparaît, jamais un lien mort', () => {
    expect(bandeauAccueil({ aMarque: true, nbMarques: 1, ouvert })).toEqual({
      titre: 'Prépare ton prochain test', sous: expect.any(String), ctaLabel: 'Voir mes tests', href: '/adsmap',
    });
    const tout = bandeauAccueil({ aMarque: true, nbMarques: 1, ouvert: () => true })!;
    expect(tout.hrefSec).toBe('/studio/ads');
  });
  it('bandeau · primaire fermé, le secondaire ouvert prend sa place', () => {
    const b = bandeauAccueil({ aMarque: true, nbMarques: 1, ouvert: (h) => h !== '/adsmap' })!;
    expect([b.href, b.ctaLabel, b.hrefSec]).toEqual(['/studio/ads', 'Créer une pub', undefined]);
  });
  it('bandeau · client en lecture · Analytics, ni création ni test', () => {
    const lecture = (h: string) => h === '/analytics';
    expect(bandeauAccueil({ aMarque: true, nbMarques: 1, ouvert: lecture })).toEqual(BANDEAU_LECTURE);
    expect(bandeauAccueil({ aMarque: false, nbMarques: 0, ouvert: lecture })).toEqual(BANDEAU_LECTURE);
    expect(bandeauAccueil({ aMarque: false, nbMarques: 0, ouvert: () => false })).toBeNull();
  });
  it('liens · ordre conservé', () => {
    expect(liensOuverts([{ href: '/veille' }, { href: '/adsmap' }, { href: '/analytics' }], ouvert).map((l) => l.href)).toEqual(['/adsmap', '/analytics']);
  });
  it('note · dit ce que le rôle n’ouvre pas, rien si tout est ouvert', () => {
    expect(noteAccesAccueil(() => true)).toBeNull();
    expect(noteAccesAccueil((h) => !h.startsWith('/brands'))).toBe('Ton rôle dans cet espace ne comprend pas la gestion des marques · ces accès n’apparaissent donc pas ici.');
    expect(noteAccesAccueil((h) => h === '/analytics')).toBe('Ton rôle dans cet espace ne comprend pas la création (pubs, images, vidéos, textes), la gestion des marques ni l’analyse des tests et du marché · ces accès n’apparaissent donc pas ici.');
  });
});

import { commandesOuvertes, regleDuChemin } from '../src/accueil-acces';
describe('palette · commandes ouvertes (lot 12)', () => {
  const r = [{ href: '/studio', ouvert: true, verrou: true }, { href: '/brands', ouvert: false }];
  it('requête ignorée, rubrique fermée retirée, verrou de formule = cadenas, action locale gardée', () => {
    expect(regleDuChemin('/studio/ads?mode=clone', r)?.href).toBe('/studio');
    expect(commandesOuvertes([{ href: '/studio/ads?mode=clone' }, { href: '/brands/new' }, { href: undefined }, { href: '/support' }], r))
      .toEqual([{ href: '/studio/ads?mode=clone', locked: true }, { href: undefined }, { href: '/support' }]);
  });
});
