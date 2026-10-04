import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Après avoir créé une itération (Suites) ou posé un concept (Radar), l'ad
 * « attend son brief ». Le message le disait sans aiguiller · il fallait deviner
 * d'aller sur /adsmap, retrouver la ligne, la produire. On exige un lien de
 * production sur le message de succès (et seulement sur le succès).
 * Recette #106 · le lien ouvre la FICHE de l'ad créée (`?ad=`), plus la carte
 * nue où il fallait la retrouver.
 *
 * Clients à chargement par action serveur · non rendables seuls. Adoption par
 * la source, bornée au message de succès.
 */
const lire = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Adsmap · une création aiguille vers la production', () => {
  it('Suites · le succès (tenu au niveau de la page) mène à la fiche de la suite créée', () => {
    const src = lire('app/(app)/adsmap/suites/Suites.tsx');
    const i = src.indexOf('{creee && (');
    expect(i, 'aucun message de succès tenu par la page').toBeGreaterThan(-1);
    expect(src.slice(i, i + 900), 'le succès ne mène pas à la fiche créée').toContain('href={lienFicheAdsmap(creee.adId)}');
  });

  it('Radar · le succès « Concept posé » mène à la fiche du concept posé', () => {
    const src = lire('app/(app)/adsmap/radar/Radar.tsx');
    const i = src.indexOf("note?.startsWith('Concept posé')");
    expect(i, 'aucun lien conditionné au succès « Concept posé »').toBeGreaterThan(-1);
    expect(src.slice(i, i + 300), 'le succès ne mène pas à la fiche').toContain('lienFicheAdsmap(posee)');
  });
});
