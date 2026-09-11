import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le libellé du moteur ne promet que ce que la mesure dit.
 *
 * `conseilMoteur` désigne le moteur au plus faible taux de RÉÉCRITURE d'accroche
 * · c'est « tient le mieux ta copie », pas « le plus performant ». Le Studio
 * l'affichait « · mesuré le meilleur ici » · un client y lit « celui qui gagne le
 * marché », alors que gagner le marché se mesure ailleurs (le verdict ADSMAP).
 * Le noyau, lui, phrase déjà juste (`resume` : « tient le mieux ta copie »).
 *
 * On vérifie donc que l'écran ne réintroduit pas la promesse non fondée.
 */
const FICHIERS = [
  'app/(app)/studio/ads/AssistantPub.tsx',
  'app/(app)/studio/ads/AdsStudio.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

describe('le libellé du moteur reste honnête', () => {
  it('aucun écran ne promet « le meilleur ici » sur un signal de fidélité de copie', () => {
    for (const { rel, src } of FICHIERS) {
      expect(src, `${rel} promet encore « le meilleur » sans base de performance`)
        .not.toMatch(/meilleur ici/);
    }
  });

  it('les deux points de libellé disent ce qui est réellement mesuré · « tient le mieux ta copie »', () => {
    for (const { rel, src } of FICHIERS) {
      expect(src, `${rel} ne porte plus le libellé honnête`).toContain('tient le mieux ta copie');
    }
  });
});
