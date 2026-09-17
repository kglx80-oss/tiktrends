import { describe, expect, it } from 'vitest';
import { etatCatalogue, dejaDisponible, etatConnecteur, PHASE_CONNECTEUR_LABEL, resumeImportDrive } from '../src/connecteurs-catalogue';

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

describe('resumeImportDrive · un dossier connecté explique son import (N09)', () => {
  it('un dossier VIDE se dit vide, pas par le silence', () => {
    expect(resumeImportDrive({ found: 0, added: 0, skipped: 0 })).toMatch(/dossier connecté vide/i);
  });
  it('détaille trouvés / importés / ignorés', () => {
    const m = resumeImportDrive({ found: 5, added: 3, skipped: 2 });
    expect(m).toContain('5 trouvés');
    expect(m).toContain('3 importés');
    expect(m).toContain('2 déjà présents');
    expect(m, 'aucune erreur à signaler ici').not.toMatch(/erreur/);
  });
  it('déduit les erreurs · trouvé mais ni importé ni déjà présent = échec', () => {
    const m = resumeImportDrive({ found: 5, added: 3, skipped: 1 });
    expect(m).toContain('1 en erreur');
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
