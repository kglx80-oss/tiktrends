import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le débrief de lot est TRANSITOIRE · le retour d'une génération qu'on vient de
 * faire, pas un bandeau permanent.
 *
 * Il fut un temps reconstruit au chargement (pour « survivre au rechargement ») ·
 * mais il réapparaissait alors à chaque visite du studio, des jours après le
 * lot, en se lisant comme une alerte fraîche (« Reprendre 1 pub cassée »). Le
 * propriétaire l'a signalé — « pourquoi ce message reste ? ». On revient à la
 * nature d'un débrief · il démarre vide et n'apparaît qu'après une génération.
 *
 * L'identifiant de LOT, lui, reste consigné et relu · il sert à repérer les pubs
 * cassées du dernier lot (regroupement par lot), indépendamment du bandeau.
 */
const ADS_ACTION = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('l’identifiant de lot est consigné et relu', () => {
  it('la génération pose un lot commun à toutes les créas de l’appel', () => {
    expect(ADS_ACTION).toMatch(/const lotId = crypto\.randomUUID\(\)/);
    expect(ADS_ACTION, 'le lot n’est pas consigné dans l’input persisté').toMatch(/lot: lotId/);
  });
  it('listBrandAds relit le lot sur chaque créa', () => {
    expect(ADS_ACTION).toMatch(/lot: rec\.lot/);
  });
});

describe('le débrief du lot est transitoire, pas un bandeau permanent', () => {
  it('il démarre vide · rien reconstruit au chargement', () => {
    expect(STUDIO, 'le débrief ne démarre pas à null')
      .toContain('const [debrief, setDebrief] = useState<DebriefLot | null>(null);');
    expect(STUDIO, 'le débrief est encore reconstruit au chargement depuis la grille')
      .not.toMatch(/useState<DebriefLot \| null>\(\(\) =>/);
    expect(STUDIO, 'la reconstruction du dernier lot au chargement traîne encore')
      .not.toContain('function debriefDuDernierLot');
  });
  it('il apparaît toujours APRÈS une génération · la fonctionnalité n’est pas morte', () => {
    expect(STUDIO, 'le débrief n’est plus posé après une génération')
      .toContain('setDebrief(debriefDepuisControles(');
  });
});
