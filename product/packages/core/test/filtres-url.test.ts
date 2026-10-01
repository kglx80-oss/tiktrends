import { describe, expect, it } from 'vitest';
import { lireCriteresGalerie, ecrireCriteresGalerie, lireFiltreAssets, ecrireFiltreAssets } from '../src/filtres-url';
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
