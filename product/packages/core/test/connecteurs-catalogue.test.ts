import { describe, expect, it } from 'vitest';
import { etatCatalogue, dejaDisponible, etatConnecteur, PHASE_CONNECTEUR_LABEL, resumeImportDrive, etatSyncDrive, LIBELLE_SYNC_DRIVE } from '../src/connecteurs-catalogue';

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

/**
 * CDC v8 · N09 · l'état persistant du Drive distingue les quatre cas · un
 * « jamais synchronisé » est un INCONNU, jamais assimilé à « synchronisé, vide ».
 */
describe('etatSyncDrive · un inconnu ne devient pas un zéro (N09)', () => {
  it('sans dossier choisi → sans_dossier', () => {
    expect(etatSyncDrive({ folderId: null, syncedAt: null })).toBe('sans_dossier');
    expect(etatSyncDrive({ folderId: null, syncedAt: '2026-09-01T00:00:00Z' })).toBe('sans_dossier');
  });

  it('dossier choisi mais JAMAIS synchronisé → jamais_synchronise, pas « vide »', () => {
    // C'est le point · un dossier qu'on n'a pas encore lu n'est pas un dossier vide.
    expect(etatSyncDrive({ folderId: 'f1', syncedAt: null })).toBe('jamais_synchronise');
    expect(etatSyncDrive({ folderId: 'f1', syncedAt: '' })).toBe('jamais_synchronise');
  });

  it('dossier synchronisé → synchronise', () => {
    expect(etatSyncDrive({ folderId: 'f1', syncedAt: '2026-09-03T08:00:01Z' })).toBe('synchronise');
  });

  it('chaque état a un libellé, et « jamais synchronisé » se nomme comme tel', () => {
    expect(LIBELLE_SYNC_DRIVE.jamais_synchronise).toMatch(/jamais synchronisé/i);
    expect(LIBELLE_SYNC_DRIVE.synchronise).toMatch(/synchronis/i);
    expect(LIBELLE_SYNC_DRIVE.sans_dossier).toMatch(/dossier/i);
  });
});
