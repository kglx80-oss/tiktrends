import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La note regarde la publicité.
 *
 * ── Ce qu'elle faisait ───────────────────────────────────────────────────────
 *
 * « Score Jarvis » notait la force de l'accroche, la clarté du message et la
 * capacité à stopper le scroll · en ne recevant QUE les textes. L'image n'était
 * jamais envoyée.
 *
 * Une note de copywriting vendue comme une note de créa. Et surtout : le seul
 * endroit du produit qui aurait pu voir une fausse accroche cuite dans l'image
 * regardait ailleurs.
 *
 * ── Pourquoi un test de structure ────────────────────────────────────────────
 *
 * Le retour au comportement d'avant est silencieux · retirer `image` du dernier
 * argument ne casse rien, ne lève rien, et rend une note qui a l'air normale.
 * Personne ne s'en apercevrait avant d'avoir publié une créa ratée.
 */

const SRC = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');
const CORPS = (() => {
  const i = SRC.indexOf('export async function scoreCreativeAction');
  expect(i, 'scoreCreativeAction a disparu').toBeGreaterThan(-1);
  return SRC.slice(i);
})();

/**
 * Les arguments d'un appel, exactement.
 *
 * La première version de ce test cherchait « image » quelque part après
 * `scoreCreative(` avec une expression régulière paresseuse · elle s'étendait
 * bien au-delà de l'appel et trouvait un `image` cent lignes plus loin. Retirer
 * l'image de l'appel la laissait VERTE, ce qu'une mutation a montré.
 *
 * Les parenthèses se comptent, elles ne se devinent pas.
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

describe('le Score Jarvis voit ce qu’il note', () => {
  it('compose la publicité et l’envoie', () => {
    expect(CORPS, 'la publicité n’est plus composée pour la note').toMatch(/renderAdPng\(/);
    expect(argumentsDe(CORPS, 'scoreCreative('), 'l’image n’est plus transmise · la note redevient une note de copie')
      .toMatch(/\bimage\b/);
  });

  it('un échec de composition ne fait pas échouer la note', () => {
    // Une note dégradée vaut mieux qu'une note absente · l'utilisateur a payé.
    const bloc = CORPS.slice(CORPS.indexOf('renderAdPng('), CORPS.indexOf('scoreCreative('));
    expect(bloc, 'la composition n’est pas protégée').toMatch(/catch/);
  });

  it('demande un rendu réduit', () => {
    // Chaque pixel envoyé est facturé, et la vision n'a pas besoin de 1080 px.
    const m = /renderAdPng\(\{[^}]*width:\s*(\d+)/.exec(CORPS);
    expect(m, 'le rendu de la note ne fixe plus sa largeur').not.toBeNull();
    expect(Number(m![1]), 'le rendu envoyé à la vision est trop grand').toBeLessThanOrEqual(640);
  });

  it('filtre ce que le modèle a rendu et plafonne la note', () => {
    // Un modèle rend parfois un raté hors vocabulaire, et une note flatteuse
    // au-dessus d'un constat accablant. Ni l'un ni l'autre ne doit passer.
    const bloc = CORPS.slice(CORPS.indexOf('scoreCreative('));
    expect(bloc, 'les ratés rendus ne sont plus filtrés').toMatch(/verdictDefauts\(score\.defauts\)/);
    expect(bloc, 'la note n’est plus plafonnée par les ratés graves').toMatch(/plafonner\(score\.score/);
  });

  it('enregistre la note plafonnée, pas la note brute', () => {
    // Le plafond appliqué à l'affichage mais pas à la base rendrait la pastille
    // de la grille plus flatteuse que le panneau qui l'explique.
    const bloc = CORPS.slice(CORPS.indexOf('jarvisScore'));
    expect(bloc).toMatch(/jarvisScore:\s*note/);
  });
});
