import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Après avoir créé une itération (Suites) ou posé un concept (Radar), l'ad
 * « attend son brief ». Le message le disait sans aiguiller · il fallait deviner
 * d'aller sur /adsmap, retrouver la ligne, la produire. On exige un lien de
 * production sur le message de succès (et seulement sur le succès).
 *
 * Clients à chargement par action serveur · non rendables seuls. Adoption par
 * la source, bornée au message de succès.
 */
const lire = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Adsmap · une création aiguille vers la production', () => {
  it('Suites · le succès « Créée » mène à la carte', () => {
    const src = lire('app/(app)/adsmap/suites/Suites.tsx');
    const i = src.indexOf("msg?.startsWith('Créée')");
    expect(i, 'aucun lien conditionné au succès « Créée »').toBeGreaterThan(-1);
    expect(src.slice(i, i + 200), 'le succès ne mène pas à la carte').toContain('href="/adsmap"');
  });

  it('Radar · le succès « Concept posé » mène à la carte', () => {
    const src = lire('app/(app)/adsmap/radar/Radar.tsx');
    const i = src.indexOf("note?.startsWith('Concept posé')");
    expect(i, 'aucun lien conditionné au succès « Concept posé »').toBeGreaterThan(-1);
    expect(src.slice(i, i + 200), 'le succès ne mène pas à la carte').toContain('href="/adsmap"');
  });
});
