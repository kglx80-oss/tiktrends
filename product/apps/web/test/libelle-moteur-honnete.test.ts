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
function lire(rel: string) {
  return { rel, src: readFileSync(join(process.cwd(), rel), 'utf8') };
}

// Aucun écran qui touche au moteur ne doit réintroduire la promesse non fondée ·
// l'assistant délègue désormais sa grille à SelecteurMoteur, on le surveille aussi.
const SURVEILLES = [
  'app/(app)/studio/ads/AssistantPub.tsx',
  'app/(app)/studio/ads/AdsStudio.tsx',
  'app/(app)/studio/ads/SelecteurMoteur.tsx',
].map(lire);

// Là où le libellé mesuré est RÉELLEMENT rendu · la grille de l'assistant
// (SelecteurMoteur) et le composeur classique (AdsStudio). L'assistant, lui, ne
// rend plus ce libellé en propre · il le délègue, donc on ne l'exige plus de lui.
const RENDENT_LE_LIBELLE = [
  'app/(app)/studio/ads/SelecteurMoteur.tsx',
  'app/(app)/studio/ads/AdsStudio.tsx',
].map(lire);

describe('le libellé du moteur reste honnête', () => {
  it('aucun écran ne promet « le meilleur ici » sur un signal de fidélité de copie', () => {
    for (const { rel, src } of SURVEILLES) {
      expect(src, `${rel} promet encore « le meilleur » sans base de performance`)
        .not.toMatch(/meilleur ici/);
    }
  });

  it('les points de libellé disent ce qui est réellement mesuré · « tient le mieux ta copie »', () => {
    for (const { rel, src } of RENDENT_LE_LIBELLE) {
      expect(src, `${rel} ne porte plus le libellé honnête`).toContain('tient le mieux ta copie');
    }
  });
});
