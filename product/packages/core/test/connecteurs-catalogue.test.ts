import { describe, expect, it } from 'vitest';
import { etatCatalogue, dejaDisponible, etatConnecteur, PHASE_CONNECTEUR_LABEL } from '../src/connecteurs-catalogue';

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

describe('etatConnecteur · « connecté » ne dit pas tout (N09)', () => {
  it('non relié → à brancher', () => {
    expect(etatConnecteur({ connecte: false, donnees: false })).toBe('a_brancher');
  });
  it('relié sans compte choisi → compte à choisir, jamais opérationnel', () => {
    expect(etatConnecteur({ connecte: true, compteRequisManquant: true, donnees: false })).toBe('compte_a_choisir');
    // Même avec des données résiduelles, un compte manquant prime.
    expect(etatConnecteur({ connecte: true, compteRequisManquant: true, donnees: true })).toBe('compte_a_choisir');
  });
  it('relié mais sans données remontées → connecté à synchroniser', () => {
    expect(etatConnecteur({ connecte: true, donnees: false })).toBe('connecte_sans_donnees');
  });
  it('relié avec données → opérationnel', () => {
    expect(etatConnecteur({ connecte: true, donnees: true })).toBe('operationnel');
  });
  it('chaque phase a un libellé', () => {
    for (const p of ['a_brancher', 'compte_a_choisir', 'connecte_sans_donnees', 'operationnel'] as const) {
      expect(PHASE_CONNECTEUR_LABEL[p].length).toBeGreaterThan(3);
    }
  });
});
