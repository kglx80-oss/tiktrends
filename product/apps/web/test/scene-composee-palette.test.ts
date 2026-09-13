import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * En mode composé aussi, la scène doit tirer vers la charte du site · la même
 * consigne douce qu'en entière (palettePourPrompt, éprouvée au noyau), réinjectée
 * dans scenePrompt. Sans ça, seul le mode entière tenait la DA, la scène composée
 * restait générique.
 *
 * Fichier `'use server'` · scenePrompt local non exporté · non exécutable en
 * test. Adoption par la source.
 */
const src = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');

describe('Scène composée · la charte du site tire la scène', () => {
  it('la palette est calculée depuis les couleurs de marque', () => {
    expect(src, 'la palette n’est pas dérivée des couleurs').toContain('const palette = palettePourPrompt(o.colors);');
  });

  it('scenePrompt reçoit la palette et l’injecte dans le prompt', () => {
    // La signature peut porter d'autres paramètres après `palette` (ex : daVisuelle).
    expect(src, 'scenePrompt n’accepte pas de palette').toMatch(/function scenePrompt\([^)]*palette\?: string/s);
    const iFn = src.indexOf('function scenePrompt(');
    const corps = src.slice(iFn, iFn + 2000);
    expect(corps, 'la palette n’est pas injectée dans le prompt de scène').toContain('${pal}');
  });

  it('les deux branches composées passent la palette à scenePrompt', () => {
    const passes = src.split(/o\.cadragePolyvalent, palette[,)]/).length - 1;
    expect(passes, 'une branche composée ne passe pas la palette').toBe(2);
  });
});
