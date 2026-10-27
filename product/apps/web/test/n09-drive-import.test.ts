import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connexionDrive } from '@tiktrends/core';

/**
 * CDC v7 · N09 · un dossier Drive connecté explique son import (trouvés /
 * importés / ignorés / erreurs) via le résumé commun · les deux chemins de
 * synchro (dossier, fichiers) passent par la même décision.
 */
// Vague 2 · l'écran V5 `/assets` (et `DriveConnect`) est retiré · la Bibliothèque
// Spatiale porte la synchro de dossier, le sélecteur (dossier, fichiers) et la tuile Drive.
describe('N09 · Drive · les synchros passent par resumeImportDrive', () => {
  const vue = readFileSync(join(process.cwd(), 'spatial/vues/bibliotheque/Bibliotheque.tsx'), 'utf8');
  const sel = readFileSync(join(process.cwd(), 'spatial/vues/bibliotheque/selecteur-drive.tsx'), 'utf8');
  it('la synchro de dossier (bouton et sélecteur) utilise le résumé commun', () => {
    expect(vue).toMatch(/resumeImportDrive\(\{ found: r\.found \?\? 0/);
    expect(sel).toMatch(/resumeImportDrive\(\{ found: s\.found \?\? 0/);
  });
  it('la synchro de fichiers choisis utilise aussi le résumé commun', () => {
    expect(sel).toMatch(/resumeImportDrive\(\{ found: files\.length/);
  });
  it('la tuile Drive distingue « jamais synchronisé », « synchronisé » et un échec récent', () => {
    const base = { available: true, needBrand: false, connected: true, folderId: 'f', folderName: 'R' };
    expect(connexionDrive({ ...base, syncedAt: null }).resume).toContain('jamais synchronisé');
    expect(connexionDrive({ ...base, syncedAt: '2026-10-01T00:00:00.000Z' }).resume).toContain('synchronisé le');
    expect(connexionDrive({ ...base, syncedAt: '2026-10-01T00:00:00.000Z', dernier: { at: '2026-10-02T00:00:00.000Z', ok: false } }).resume).toContain('dernière synchro en échec');
  });
});

/**
 * CDC v8 · N09 · le compteur d'assets dit sa PORTÉE · médias de la bibliothèque
 * (importés/téléversés), sorties des projets Studios et, depuis le retrait des
 * anciens studios (10/10), leurs créations historiques · chacune nommée.
 */
// Vague 2 · la portée se lit sur les onglets de la Bibliothèque Spatiale
// (assets de la marque, créations Studios, anciens studios), comptés à part.

/**
 * CDC v8 · N09 · le bilan de synchro est CONSERVÉ (survit au rechargement) et
 * la dernière tentative se distingue du dernier succès · un échec récent n'est
 * pas masqué par un ancien succès.
 */
describe('N09 · le bilan de synchro Drive est conservé et distingue succès / tentative', () => {
  const drive = readFileSync(join(process.cwd(), 'app/actions/drive.ts'), 'utf8');

  it('l’action persiste le bilan sur SUCCÈS · trouvés/importés/ignorés/erreurs', () => {
    expect(drive, 'le bilan complet n’est pas conservé sur succès').toContain('ok: true, found: res.found, added: res.added, skipped: res.skipped, errors: res.errors');
    // Sur succès, le dernier succès ET la dernière tentative sont écrits ensemble.
    expect(drive, 'le succès n’écrit pas les deux faits').toContain('driveSyncedAt: at, driveLastSync: bilan');
  });

  it('l’action enregistre l’ÉCHEC sans toucher au dernier succès', () => {
    expect(drive, 'l’échec n’est pas enregistré comme tentative').toContain('const echec: DernierSyncDrive = { at: at.toISOString(), ok: false }');
    // Le SET du chemin d'échec ne porte QUE driveLastSync · pas driveSyncedAt.
    expect(drive, 'un échec réécrit le dernier succès').toContain('.set({ driveLastSync: echec })');
  });

  it('getDriveState relit le bilan conservé', () => {
    expect(drive).toContain('dernier: schema.brands.driveLastSync');
  });

});
