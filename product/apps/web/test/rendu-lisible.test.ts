import { describe, expect, it } from 'vitest';
import { renderAdPng, type AdRecipe } from '../lib/ad-render';
import { bandLuminance, colorShare, colorShareInColumns, decodePng } from './png';

/**
 * Ce que la capture d'écran a montré, et que rien ne mesurait.
 *
 * ── Trois défauts, vus à l'œil sur des rendus réels ──────────────────────────
 *
 * 1. **L'accroche était bridée par son gabarit.** `benefits` imposait une base
 *    de 62 pour laisser la place à ses puces · une accroche de 42 px sur un
 *    cadre de 1080, quatre pour cent de la largeur. Trois publicités sur quatre
 *    de la grille étaient des `benefits`.
 * 2. **Un bouton muet.** Le modèle rend parfois un `cta` vide ; on dessinait la
 *    pastille avec sa seule flèche.
 * 3. **Le « champ de couleur » sans couleur.** Son dégradé partait de l'accent
 *    et finissait en noir · la couleur n'existait QUE derrière la photo, qui la
 *    cache. Le texte tombait sur du noir.
 *
 * Aucun des trois ne casse quoi que ce soit : tout se rend, tous les tests
 * passaient. Ils se voient en OUVRANT l'image, et se retiennent en la mesurant.
 */

/** Un accent qu'on ne trouve nulle part ailleurs dans la maquette. */
const ACCENT: [number, number, number] = [255, 0, 255];

const SCENE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAlklEQVR4nO3QsQ0AIAzAsI4V//8LZ3ggg/cos3vuz0YHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gPRfEkQBsCh6+AAAAAElFTkSuQmCC';

const recette = (o: Partial<AdRecipe>): AdRecipe => ({
  template: 'benefits', sceneUrl: SCENE,
  kicker: 'TROIS ACTIONS', headline: 'L’eau nickel, sans y penser',
  cta: 'Je teste', benefits: ['Anti-algues', 'Anti-UV', 'Visible en 24h'],
  accent: '#ff00ff', brandName: 'KLOREA', logoUrl: null, variant: 0,
  layout: 'immersif', width: 432, height: 540,
  ...o,
});

const rendre = async (o: Partial<AdRecipe>) => decodePng(Buffer.from(await renderAdPng(recette(o))));

describe('un bouton sans texte ne se dessine pas', () => {
  /**
   * On regarde la BANDE DU BOUTON, pas l'image entière.
   *
   * Un seuil global laissait passer la mutation : les puces portent aussi
   * l'accent, et une pastille réduite à sa flèche pèse trop peu pour faire
   * bouger un total. Mesuré là où le bouton se pose, l'écart est net · 19 % de
   * la bande contre zéro.
   */
  const bandeDuBouton = async (cta: string) =>
    colorShareInColumns(await rendre({ cta }), 0.10, 0.55, ACCENT, [0.88, 1.0], 60);

  it('la pastille disparaît quand le CTA est vide', async () => {
    expect(await bandeDuBouton('Je teste'), 'le bouton normal ne se dessine plus').toBeGreaterThan(0.05);
    expect(await bandeDuBouton(''), 'un bouton muet est toujours dessiné').toBe(0);
  }, 240000);

  it('un CTA fait d’espaces ne compte pas comme du texte', async () => {
    expect(await bandeDuBouton('   ')).toBe(0);
  }, 240000);
});

describe('le champ de couleur porte sa couleur', () => {
  it('la bande basse est colorée, pas noire', async () => {
    // Elle finissait en `#0b0b0f` · la mise en page nommée « champ de couleur »
    // n'en montrait aucune, et son texte tombait sur du noir.
    const img = await rendre({ layout: 'champ' });
    expect(colorShare(img, ACCENT, 130), 'la bande basse n’est pas de la couleur d’accent')
      .toBeGreaterThan(0.15);
    expect(bandLuminance(img, 0.7, 0.95), 'la bande basse est un fond sombre, pas un champ')
      .toBeGreaterThan(0.12);
  }, 240000);

  it('son texte reste lisible sur l’aplat', async () => {
    // Le texte est blanc · l'aplat doit rester assez sombre pour le porter.
    const img = await rendre({ layout: 'champ' });
    expect(bandLuminance(img, 0.7, 0.95)).toBeLessThan(0.45);
  }, 240000);
});

describe('l’accroche domine sa propre liste', () => {
  /**
   * ── Pourquoi ce test lit la source ───────────────────────────────────────
   *
   * Mesurer « la hauteur de casse de la première ligne » dans un PNG demande de
   * segmenter des lignes de texte, et un tel test se casse au premier
   * changement d'interligne, pour de mauvaises raisons.
   *
   * Ce qui a régressé est exact et nommable : un gabarit passait une base plus
   * petite que la base commune. C'est ça qu'on retient.
   */
  it('aucun gabarit ne bride l’accroche sous 80', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'lib/ad-render.tsx'), 'utf8');
    const bases = [...src.matchAll(/<Titre[^/]*base=\{([^}]*)\}/g)]
      .flatMap((m) => [...m[1]!.matchAll(/\b(\d{2,3})\b/g)].map((n) => Number(n[1])));
    expect(bases.length, 'plus aucun gabarit ne passe de base · la règle a changé de forme').toBeGreaterThan(0);
    for (const b of bases) {
      expect(b, `un gabarit bride l’accroche à ${b} · c’est le défaut qu’on vient de corriger`).toBeGreaterThanOrEqual(80);
    }
  });
});
