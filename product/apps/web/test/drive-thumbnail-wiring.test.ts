import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La vraie vignette Drive · CÂBLAGE de bout en bout.
 *
 * Le RÉSULTAT visible (la miniature montre la vignette, pas l'icône) est prouvé
 * par rendu dans `apercu-asset.test.tsx`, et la dégradation propre dans
 * `packages/integrations` (`drive-thumb.test.ts`). Ici on verrouille le chemin
 * serveur qui ne se rend pas · les DEUX synchros persistent la vignette, et la
 * liste la ressort. Un refactor qui laisse tomber l'un des maillons casse ici.
 *
 * Fichiers `'use server'` / accès base · lecture source (leur exécution exige
 * réseau + base + jeton Drive, à valider par le proprio après déploiement).
 */
const ROOT = process.cwd();
const DRIVE_ACTION = readFileSync(join(ROOT, 'app/actions/drive.ts'), 'utf8');
const ASSETS_ACTION = readFileSync(join(ROOT, 'app/actions/assets.ts'), 'utf8');
const SYNC = readFileSync(join(ROOT, '../../packages/integrations/src/drive-sync.ts'), 'utf8');

describe('la vignette Drive est captée à la synchro et ressortie par la liste', () => {
  it('la synchro par dossier persiste la vignette et la passe à l’insertion', () => {
    expect(SYNC).toContain('storeDriveThumb(');
    // La vignette entre bien dans l'asset inséré (pas calculée puis jetée).
    expect(SYNC).toMatch(/insertAsset\({[^}]*thumbUrl/s);
  });

  it('la synchro par sélection (Picker) persiste aussi la vignette', () => {
    expect(DRIVE_ACTION).toContain('storeDriveThumb(');
    expect(DRIVE_ACTION).toMatch(/\.values\({[^}]*thumbUrl/s);
  });

  it('la liste des assets sélectionne et expose thumbUrl', () => {
    expect(ASSETS_ACTION).toContain('thumbUrl: schema.assets.thumbUrl');
    expect(ASSETS_ACTION).toMatch(/thumbUrl: r\.thumbUrl/);
  });
});
