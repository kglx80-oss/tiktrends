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
});
