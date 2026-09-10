import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le studio Image gagne un choix explicite de références (Assets) · « assets
 * plus présents dans la logique ». À défaut, la bibliothèque de la marque est
 * prise automatiquement (comportement inchangé). Fichiers serveur/gros client
 * non rendables · on lit la source ; la miniature elle-même est rendue et
 * gardée par `picker-miniature`.
 */
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/image/ImageStudio.tsx'), 'utf8');
const ACTION = readFileSync(join(process.cwd(), 'app/actions/image.ts'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'app/(app)/studio/image/page.tsx'), 'utf8');

describe('le studio Image choisit ses références d’assets', () => {
  it('la page charge les assets image et les passe au studio', () => {
    expect(PAGE).toMatch(/listAssets\(\{ kind: 'image'/);
    expect(PAGE).toContain('assets={');
  });

  it('le studio rend le picker et transmet les assetIds', () => {
    expect(STUDIO).toContain('<MiniatureAsset');
    expect(STUDIO).toMatch(/assetIds: assetIds\.length \? assetIds : undefined/);
  });

  it('l’action honore les assetIds explicites, et garde l’auto à défaut', () => {
    expect(ACTION).toContain('resolveAssetImageUrls');
    expect(ACTION).toMatch(/input\.assetIds\?\.length \? await resolveAssetImageUrls[\s\S]{0,80}listBrandAssetImageUrls/);
  });
});
