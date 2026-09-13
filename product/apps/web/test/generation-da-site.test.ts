import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La DA visuelle du site (stockée dans brandKit, remplie par l'agent
 * d'extraction) doit être tournée en contrainte et atteindre les prompts d'image
 * de la génération de marque · scène composée ET pub entière. Sans ça, la DA
 * extraite resterait une donnée morte, comme les couleurs avant #482.
 *
 * Fichier `'use server'` · non exécutable en test. Adoption par la source.
 */
const src = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');

describe('Génération · la DA du site atteint les prompts d’image', () => {
  it('le brandKit est lu et tourné en contrainte de DA', () => {
    expect(src, 'brandKit n’est pas sélectionné').toContain('brandKit: schema.brands.brandKit');
    expect(src, 'la DA du site n’est pas tournée en contrainte')
      .toMatch(/const daVisuelle = contrainteDaPourPrompt\(\(da\?\.brandKit \?\? null\)/);
  });

  it('la contrainte est passée aux options de génération de marque', () => {
    // Une seule fois · le chemin marque, pas le clone.
    expect(src, 'la DA n’est pas passée aux options du lot').toMatch(/logoUrl: da\?\.logoUrl,\n    daVisuelle,/);
  });

  it('la scène composée reçoit la contrainte de DA', () => {
    // La signature peut porter d'autres paramètres après daVisuelle (ex : ancrage).
    const passes = src.split(/o\.cadragePolyvalent, palette, daVisuelle[,)]/).length - 1;
    expect(passes, 'les deux branches composées ne passent pas la DA').toBe(2);
  });

  it('la pub entière reçoit la contrainte de DA', () => {
    expect(src, 'la DA n’est pas passée à promptPubEntiere').toContain('daVisuelle: o.daVisuelle,');
  });
});
