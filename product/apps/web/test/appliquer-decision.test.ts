import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ce qui a été mesuré est appliqué, et annoncé.
 *
 * ── L'invariant ──────────────────────────────────────────────────────────────
 *
 * C'est le dernier maillon de la boucle, et le plus facile à perdre sans que
 * rien ne le signale : la rotation continue de tourner, les lots sortent, tout
 * a l'air normal. Seule la mesure, six mois plus tard, montrera que rien n'a
 * jamais été appliqué.
 *
 * Trois choses doivent tenir, et aucune n'est visible à l'œil :
 *
 * 1. la décision passe par la règle · pas par un `layoutsToDrop` direct, qui
 *    lit des taux NON APPARIÉS et ignorerait les essais ;
 * 2. la rotation reçoit le favori · sinon on calcule une préférence et on ne
 *    s'en sert pas ;
 * 3. l'écran l'annonce · appliquer en silence revient à mesurer en cachette, et
 *    le lot suivant se lit comme un hasard bizarre.
 */

const SRC = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');

/**
 * Les arguments d'un appel, exactement.
 *
 * Une expression régulière ne sait pas compter les parenthèses · `[^)]*`
 * s'arrête à la première fermante rencontrée, qui appartient souvent à un appel
 * imbriqué. On les compte.
 */
function argumentsDe(src: string, appel: string): string {
  const debut = src.indexOf(appel);
  expect(debut, `${appel} introuvable`).toBeGreaterThan(-1);
  let profondeur = 0;
  for (let i = debut + appel.length - 1; i < src.length; i++) {
    const c = src[i];
    if (c === '(') profondeur++;
    else if (c === ')') {
      profondeur--;
      if (profondeur === 0) return src.slice(debut + appel.length, i);
    }
  }
  throw new Error(`${appel} n’est jamais refermé`);
}
const UI = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('la boucle se referme', () => {
  it('la décision passe par la règle, pas par les taux seuls', () => {
    expect(SRC, 'la décision de coquilles ne consulte plus les essais').toMatch(/appliquerEssais\(/);
    expect(SRC, 'les taux sont relus directement · les essais seraient ignorés').not.toMatch(/=\s*layoutsToDrop\(/);
  });

  it('les essais sont vraiment lus', () => {
    expect(SRC).toMatch(/cumulCoquillesPourMarque\(\)/);
    // Au mieux · un studio ne doit pas s'arrêter parce qu'une statistique est
    // illisible.
    expect(SRC, 'une lecture qui échoue ferait échouer la génération').toMatch(/cumulCoquillesPourMarque\(\)\.catch/);
  });

  it('la rotation reçoit le favori', () => {
    // Sinon on calcule une préférence et on ne s'en sert pas · c'est
    // exactement le défaut qu'on corrige, reproduit un cran plus loin.
    expect(argumentsDe(SRC, 'layoutsForBatchFavori(')).toMatch(/decision\.favori/);
  });

  it('le lot annonce ce qu’il a appliqué', () => {
    expect(SRC, 'le résultat ne porte plus la décision').toMatch(/appliquee:\s*decision\.resume/);
    expect(UI, 'l’écran n’affiche plus ce qui a été appliqué').toMatch(/res\.appliquee/);
  });
});
