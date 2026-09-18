import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v7 · N09 · un dossier Drive connecté explique son import (trouvés /
 * importés / ignorés / erreurs) via le résumé commun · les deux chemins de
 * synchro (dossier, fichiers) passent par la même décision.
 */
describe('N09 · Drive · les deux synchros passent par resumeImportDrive', () => {
  const dc = readFileSync(join(process.cwd(), 'app/(app)/assets/DriveConnect.tsx'), 'utf8');
  it('la synchro de dossier utilise le résumé commun · plus de message ad hoc', () => {
    expect(dc).toMatch(/resumeImportDrive\(\{ found: r\.found \?\? 0/);
    expect(dc, 'l’ancien message « 0 fichier média trouvé » brut subsiste').not.toContain('0 fichier média trouvé dans ce dossier.');
  });
  it('la synchro de fichiers choisis utilise aussi le résumé commun', () => {
    expect(dc).toMatch(/resumeImportDrive\(\{ found: files\.length/);
  });

  // CDC v8 · N09 · « jamais synchronisé » est un inconnu · le tiroir le dit au
  // lieu de le confondre avec « synchronisé, rien trouvé » par l'absence de date.
  it('le tiroir Drive distingue « jamais synchronisé » de « synchronisé »', () => {
    expect(dc, 'le tiroir n’adopte pas l’état de synchro du noyau').toContain('etatSyncDrive(');
    expect(dc, '« jamais synchronisé » n’est pas dit explicitement').toContain('Jamais synchronisé');
  });
});

/**
 * CDC v8 · N09 · le compteur d'assets dit sa PORTÉE · médias de la bibliothèque
 * (importés/téléversés), les créations générées comptées à part.
 */
describe('N09 · le compteur d’assets explique sa portée', () => {
  const page = readFileSync(join(process.cwd(), 'app/(app)/assets/page.tsx'), 'utf8');
  it('le total nomme la bibliothèque et sépare les créations générées', () => {
    expect(page).toContain('asset(s) en bibliothèque');
    expect(page, 'la portée (créations générées comptées à part) n’est pas dite').toMatch(/comptées à part/);
  });
});

/**
 * CDC v8 · N09 · le bilan de synchro est CONSERVÉ (survit au rechargement) et
 * la dernière tentative se distingue du dernier succès · un échec récent n'est
 * pas masqué par un ancien succès.
 */
describe('N09 · le bilan de synchro Drive est conservé et distingue succès / tentative', () => {
  const drive = readFileSync(join(process.cwd(), 'app/actions/drive.ts'), 'utf8');
  const dc = readFileSync(join(process.cwd(), 'app/(app)/assets/DriveConnect.tsx'), 'utf8');

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

  it('le tiroir distingue dernier succès et dernière tentative échouée, et conserve le bilan', () => {
    expect(dc).toContain('derniereTentativeDriveEnEchec(');
    expect(dc, 'un échec récent n’est pas signalé').toMatch(/· échec/);
    expect(dc, 'le dernier succès n’est plus nommé comme tel').toContain('Dernier succès');
    expect(dc, 'le bilan conservé n’est pas réaffiché').toContain('Dernier import');
  });
});
