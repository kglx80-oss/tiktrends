import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Marque blanche · l'hôte réel ne doit pas fuiter vers un tiers.
 *
 * Les avatars de marques et de concurrents chargent la favicon des sites depuis
 * Google · sans politique de référent, le navigateur y joint `Referer:
 * app.tiktrends.co/…`, ce qui révèle le backend derrière la marque blanche. La
 * politique document `same-origin` coupe le référent vers tout tiers cross-origin
 * tout en gardant les référents internes.
 *
 * Le layout racine tire `./globals.css` · non importable en test unitaire. On
 * garde donc la valeur par la source · c'est une politique de document, pas un
 * rendu de composant.
 */
const src = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');

describe('la politique de référent protège l’hôte en marque blanche', () => {
  it('le document déclare une politique qui ne fuite pas vers un tiers', () => {
    // `same-origin` ou `no-referrer` coupent le référent cross-origin · une
    // politique qui laisse passer l'origine (`strict-origin*`, `origin`) ne
    // protégerait pas l'hôte, et ne doit donc pas être ce qu'on retient ici.
    expect(src, 'aucune politique de référent posée').toMatch(/referrer:\s*'(same-origin|no-referrer)'/);
  });
});
