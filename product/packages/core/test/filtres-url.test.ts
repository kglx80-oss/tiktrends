import { describe, expect, it } from 'vitest';
import { lireCriteresGalerie, ecrireCriteresGalerie, lireFiltreAssets, ecrireFiltreAssets, lireCriteresSauvegardes, ecrireCriteresSauvegardes, BOARD_TOUS, BOARD_SANS } from '../src/filtres-url';
import { CRITERES_DEFAUT } from '../src/galerie-filtres';

describe('filtres dans l’URL · ils survivent au Retour', () => {
  it('galerie · aller-retour fidèle, défauts absents de l’URL, autres paramètres gardés', () => {
    const c = { ...CRITERES_DEFAUT, recherche: 'sérum nuit', qualite: 'prete' as const, performance: 'gagnante' as const, tri: 'titre' as const, format: 'carre' };
    const u = ecrireCriteresGalerie('?ref=abc', c);
    expect(u.startsWith('?ref=abc&')).toBe(true);
    expect(lireCriteresGalerie(u)).toEqual(c);
    expect(ecrireCriteresGalerie('', CRITERES_DEFAUT), 'une galerie non filtrée garde une URL nue').toBe('');
    expect(ecrireCriteresGalerie('?ref=abc&q=x', CRITERES_DEFAUT)).toBe('?ref=abc');
  });
  it('galerie · une valeur inconnue retombe sur le défaut', () => {
    expect(lireCriteresGalerie('?qualite=pirate&tri=zz&perf=?')).toEqual(CRITERES_DEFAUT);
  });
  it('assets · type et recherche', () => {
    const u = ecrireFiltreAssets('?ok=drive', { type: 'video', recherche: 'rush' });
    expect(u).toBe('?ok=drive&type=video&q=rush');
    expect(lireFiltreAssets(u)).toEqual({ type: 'video', recherche: 'rush' });
    expect(lireFiltreAssets('?type=inconnu')).toEqual({ type: 'all', recherche: '' });
    expect(ecrireFiltreAssets('', { type: 'all', recherche: '  ' })).toBe('');
  });
});

describe('Sauvegardes · board et recherche dans l’URL (recette #106, point 6)', () => {
  it('lit, écrit, garde les autres paramètres, omet les défauts', () => {
    expect(lireCriteresSauvegardes('')).toEqual({ board: BOARD_TOUS, recherche: '' });
    expect(lireCriteresSauvegardes('?onglet=creations&board=Offres&q=livraison')).toEqual({ board: 'Offres', recherche: 'livraison' });
    expect(lireCriteresSauvegardes('?board=sans')).toEqual({ board: BOARD_SANS, recherche: '' });
    expect(ecrireCriteresSauvegardes('?onglet=creations', { board: 'Hooks UGC · T4', recherche: 'soir' })).toBe('?onglet=creations&board=Hooks+UGC+%C2%B7+T4&q=soir');
    expect(ecrireCriteresSauvegardes('?onglet=creations&board=x&q=y', { board: BOARD_TOUS, recherche: '  ' })).toBe('?onglet=creations');
    expect(ecrireCriteresSauvegardes('', { board: BOARD_SANS, recherche: '' })).toBe('?board=sans');
    const aller = ecrireCriteresSauvegardes('', { board: 'Hooks UGC · T4', recherche: 'soir' });
    expect(lireCriteresSauvegardes(aller), 'l’aller-retour perd un critère').toEqual({ board: 'Hooks UGC · T4', recherche: 'soir' });
  });
});
