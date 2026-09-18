import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_PER_ADVERTISER } from '@tiktrends/core';

/**
 * CDC v7 · N10 · l'aide du Radar doit décrire le comportement LIVRÉ. Le radar ne
 * bloque plus un annonceur « au-delà de trois créas décrites » (exclusion à vie) ·
 * il en prend au plus trois PAR NUIT et fait passer un concurrent connu APRÈS un
 * inconnu. L'aide qui promettait l'ancienne règle mentait sur le produit.
 */
describe('N10 · l’aide du Radar colle au comportement livré', () => {
  const page = readFileSync(join(process.cwd(), 'app/(app)/adsmap/radar/page.tsx'), 'utf8');

  it('la formulation d’exclusion à vie a disparu', () => {
    expect(page, 'l’ancienne règle « cède la place » subsiste')
      .not.toContain('au-delà de trois créas décrites cède la place');
  });

  it('l’aide décrit le plafond PAR NUIT et la priorité aux inconnus', () => {
    expect(page).toMatch(/au plus <b>trois<\/b> créas décrites/);
    expect(page).toMatch(/passe <b>après<\/b> un\s+inconnu/);
    expect(page).toMatch(/reste candidate les nuits d’après/);
  });

  it('le nombre annoncé (« trois ») correspond bien au plafond réel', () => {
    // Si le plafond change, « trois » devient faux · ce test le rappelle.
    expect(MAX_PER_ADVERTISER).toBe(3);
  });
});
