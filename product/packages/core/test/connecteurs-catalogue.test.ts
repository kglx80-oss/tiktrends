import { describe, expect, it } from 'vitest';
import { etatCatalogue, dejaDisponible } from '../src/connecteurs-catalogue';

/**
 * CDC v7 · N09 · « disponible » et « en préparation » ne comptent jamais la
 * même chose · un connecteur déjà branché ne figure pas dans la feuille de route.
 */
describe('etatCatalogue', () => {
  it('compte séparément disponibles et feuille de route', () => {
    const e = etatCatalogue(['Shopify', 'Meta Ads'], ['TikTok Ads', 'Google Ads', 'Stripe']);
    expect(e.disponibles).toBe(2);
    expect(e.enPreparation).toBe(3);
    expect(e.conflits).toEqual([]);
  });

  it('un connecteur disponible listé aussi « à venir » est un CONFLIT · exclu de la préparation', () => {
    // Le cas Google Drive · branché dans Assets ET dans la feuille de route.
    const e = etatCatalogue(['Shopify', 'Google Drive'], ['TikTok Ads', 'Google Drive', 'Stripe']);
    expect(e.conflits).toEqual(['Google Drive']);
    expect(e.enPreparation, 'Drive ne compte pas comme « en préparation »').toBe(2);
    expect(e.disponibles).toBe(2);
  });

  it('la casse et les espaces ne créent pas de faux conflit ni de faux compte', () => {
    const e = etatCatalogue(['google drive'], ['  Google  Drive ', 'Notion']);
    expect(e.conflits.length).toBe(1);
    expect(e.enPreparation).toBe(1);
  });
});

describe('dejaDisponible', () => {
  it('reconnaît un connecteur déjà branchable, insensible à la casse/espace', () => {
    expect(dejaDisponible('Google Drive', ['google drive'])).toBe(true);
    expect(dejaDisponible('Notion', ['Google Drive'])).toBe(false);
  });
});
