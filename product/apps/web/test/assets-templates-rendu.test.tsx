import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les coulisses · l'agence (admin+) marque un asset comme template, le client le
 * VOIT (badge) mais ne peut jamais le poser NI le retirer. Le statut passe par un
 * booléen dérivé côté serveur · le marqueur technique ne traverse pas le réseau.
 *
 * On rend la bibliothèque (RÉSULTAT) pour le badge et le bouton d'écriture, et on
 * garde par la source les invariants d'accès que le relecteur a exigés · le
 * tagging IA ne doit ni retirer ni poser le marqueur (chemins non gardés).
 */
// Vague 2 · l'écran V5 `/assets` est retiré · le RENDU (badge visible de tous,
// écriture réservée à l'administrateur) est gardé sur l'écran Spatial
// (`spatial-bibliotheque-gestes.test.tsx`, « templates · … »). Ici, les gardes serveur.

const src = readFileSync(join(process.cwd(), 'app/actions/assets.ts'), 'utf8');
const fn = (name: string) => {
  const i = src.indexOf(`export async function ${name}`);
  const j = src.indexOf('\nexport ', i + 10);
  return i < 0 ? '' : src.slice(i, j > i ? j : i + 1600);
};

describe('Templates dans la bibliothèque · coulisses vues du client', () => {
  it('le statut template est dérivé côté serveur · le marqueur ne sort pas', () => {
    // `toItem` vit dans `lib/asset-item.ts` (partagé par `listAssets` et les pages de la Bibliothèque) · `assets.ts` l'importe.
    expect(src).toContain("import { toItem } from '../../lib/asset-item';");
    const item = readFileSync(join(process.cwd(), 'lib/asset-item.ts'), 'utf8');
    const toItem = item.slice(item.indexOf('function toItem'), item.indexOf('function toItem') + 1600);
    expect(toItem, 'le marqueur n’est pas retiré des tags renvoyés').toContain('tags: tagsVisibles(r.tags)');
    expect(toItem, 'le statut n’est pas dérivé en booléen').toContain('isTemplate: estTemplateAsset(r.tags)');
  });

  it('l’écriture du statut est réservée à l’agence (garde de rôle AVANT l’écriture)', () => {
    const f = fn('basculerTemplateAction');
    const iGuard = f.indexOf("roleAtLeast(s.role, 'admin')");
    const iWrite = f.indexOf('db.update(');
    expect(iGuard, 'la garde admin manque').toBeGreaterThan(-1);
    expect(iWrite, 'aucune écriture').toBeGreaterThan(-1);
    expect(iGuard, 'la garde admin ne précède pas l’écriture').toBeLessThan(iWrite);
  });

  it('le tagging IA ne retire ni ne pose le marqueur (chemin non gardé)', () => {
    const f = fn('tagAssetAction');
    // Assainit la sortie du modèle (jamais poser) ET préserve le statut existant
    // (jamais retirer) · sinon un non-admin bascule un template via le tagging.
    // Lot 12 · l'écriture passe par `ecrireTagsAnalyse` · la colonne relue VERROUILLÉE au moment d'écrire, puis
    // `fusionTagsAnalyse` (noyau · garde le marqueur et les tags posés à la main, prouvé par `lot12-bibliotheque.test.ts`).
    expect(f, 'le tagging IA n’assainit pas la sortie du modèle').toContain('const propres = tagsVisibles(tags);');
    expect(f, 'le tagging IA n’écrit pas par la fusion qui préserve le marqueur').toContain('await ecrireTagsAnalyse(a.id, propres);');
    const i = src.indexOf('async function ecrireTagsAnalyse');
    const e = src.slice(i, i + 900);
    expect(e, 'le statut template n’est pas relu verrouillé à l’écriture').toContain("select({ tags: A.tags }).from(A).where(eq(A.id, id)).for('update')");
    expect(e, 'la colonne n’est pas écrite par la fusion du noyau').toContain('fusionTagsAnalyse(l?.tags ?? null, ia)');
  });

  it('le tagging IA en lot assainit aussi la sortie du modèle', () => {
    const f = fn('tagUntaggedImagesAction');
    expect(f, 'le tagging en lot n’assainit pas le marqueur').toContain('tagsVisibles(tags)');
  });
});
