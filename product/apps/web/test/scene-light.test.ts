import { describe, expect, it } from 'vitest';
import { voilesDe } from '@tiktrends/core';
import { renderAdPng, type AdRecipe } from '../lib/ad-render';
import { mesurerBuffer } from '../lib/scene-light';
import { bandLuminance, decodePng, type Image } from './png';
import { encodePng } from './tools/sheet';

/**
 * Le voile taillé sur la scène, de bout en bout.
 *
 * ── Ce que les tests de lisibilité existants ne pouvaient pas voir ───────────
 *
 * Ils rendent sans mesure, donc avec les voiles d'avant. Ils continuent de
 * valoir · c'est le repli. Mais aucun d'eux ne dit si mesurer sert à quelque
 * chose, ni si la promesse tient une fois la mesure appliquée.
 *
 * Celui-ci fabrique des scènes dont on CONNAÎT la clarté, les fait mesurer par
 * le vrai décodeur, puis compose et relit les pixels sortis. Rien n'est simulé :
 * si `sharp` lit de travers, si les bandes sont prises au mauvais endroit, ou si
 * la maquette ignore la mesure, il tombe.
 */

/** Une scène unie d'une clarté donnée (0 = noir, 1 = blanc). */
function uni(niveau: number, w = 64, h = 80): Image {
  const v = Math.round(Math.min(1, Math.max(0, niveau)) * 255);
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
  }
  return { width: w, height: h, rgba };
}

const enUri = (img: Image) => `data:image/png;base64,${encodePng(img).toString('base64')}`;

const recette = (o: Partial<AdRecipe>): AdRecipe => ({
  template: 'problem_solution', sceneUrl: '',
  kicker: 'HELLO', headline: 'Ton garage est encore plein le dimanche soir',
  subhead: 'Trois minutes, et tu retrouves ta place.', cta: 'J’en profite',
  accent: '#2563EB', brandName: 'Klorea', logoUrl: null, variant: 0,
  layout: 'immersif', width: 432, height: 540,
  ...o,
});

const rendre = async (o: Partial<AdRecipe>) => decodePng(Buffer.from(await renderAdPng(recette(o))));

describe('la mesure lit vraiment la scène', () => {
  it('retrouve la clarté d’une scène unie', async () => {
    for (const niveau of [0.1, 0.5, 0.9]) {
      const m = await mesurerBuffer(encodePng(uni(niveau)));
      expect(m, `scène ${niveau} : le décodage a échoué`).not.toBeNull();
      expect(m!.bas.pic).toBeCloseTo(niveau, 1);
      expect(m!.haut.pic).toBeCloseTo(niveau, 1);
    }
  });

  it('distingue le haut du bas', async () => {
    // Noir en haut, blanc en bas · une mesure qui prendrait la même bande deux
    // fois, ou les prendrait à l'envers, passerait inaperçue sur une scène unie.
    const img = uni(0);
    for (let y = Math.floor(img.height * 0.7); y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        img.rgba[i] = 255; img.rgba[i + 1] = 255; img.rgba[i + 2] = 255;
      }
    }
    const m = await mesurerBuffer(encodePng(img));
    expect(m).not.toBeNull();
    expect(m!.haut.pic).toBeLessThan(0.2);
    expect(m!.bas.pic).toBeGreaterThan(0.8);
  });

  it('rend `null` sur ce qui n’est pas une image', async () => {
    expect(await mesurerBuffer(Buffer.from('pas une image'))).toBeNull();
  });
});

describe('mesurer change le rendu', () => {
  /**
   * LE gain.
   *
   * La moitié basse de chaque publicité était un rectangle noir · le voile était
   * peint à `.97` quelle que soit l'image. Sur une scène qui n'en avait pas
   * besoin, on enterrait la photo qu'on venait de payer.
   */
  it('rend la photo sur une scène qui n’avait pas besoin d’être voilée', async () => {
    const scene = enUri(uni(0.5));
    const m = await mesurerBuffer(encodePng(uni(0.5)));
    expect(m).not.toBeNull();

    const avant = await rendre({ sceneUrl: scene });
    const apres = await rendre({ sceneUrl: scene, light: m });

    // Bande basse du panneau, sous le texte · c'est là que la photo était perdue.
    const lAvant = bandLuminance(avant, 0.88, 0.98);
    const lApres = bandLuminance(apres, 0.88, 0.98);
    expect(lApres, `la photo ne ressort pas davantage (${lAvant.toFixed(3)} -> ${lApres.toFixed(3)})`)
      .toBeGreaterThan(lAvant * 1.5);
  }, 240000);

  it('ne relâche rien sur une scène claire', async () => {
    const claire = uni(0.95);
    const m = await mesurerBuffer(encodePng(claire));
    expect(m).not.toBeNull();
    const v = voilesDe(m);
    expect(v.basFort).toBeGreaterThan(0.9);

    const img = await rendre({ sceneUrl: enUri(claire), light: m });
    // Texte blanc · le fond sous lui doit rester sombre, sur une scène qui est
    // pourtant presque blanche.
    expect(bandLuminance(img, 0.74, 0.94)).toBeLessThan(0.45);
  }, 240000);

  it('une scène non mesurée rend exactement comme avant', async () => {
    // Le repli doit être un repli, pas une autre maquette · sans ça, livrer la
    // mesure changerait l'allure de toutes les publicités déjà composées.
    const scene = enUri(uni(0.3));
    const a = await rendre({ sceneUrl: scene });
    const b = await rendre({ sceneUrl: scene, light: null });
    expect(Buffer.from(b.rgba).equals(Buffer.from(a.rgba))).toBe(true);
  }, 240000);
});

describe('la lisibilité tient sur toute la plage', () => {
  /**
   * Le garde qui compte.
   *
   * On rend la même publicité sur cinq scènes, de la plus sombre à la plus
   * claire, chacune MESURÉE. Le texte blanc doit tenir sur les cinq · c'est la
   * seule promesse que la maquette fait, et elle casserait en silence.
   */
  it('le texte blanc tient sur cinq scènes mesurées', async () => {
    for (const niveau of [0.05, 0.3, 0.55, 0.8, 1]) {
      const scene = uni(niveau);
      const m = await mesurerBuffer(encodePng(scene));
      const img = await rendre({ sceneUrl: enUri(scene), light: m });
      expect(bandLuminance(img, 0.74, 0.94), `scène ${niveau} : le texte blanc s’y noie`)
        .toBeLessThan(0.45);
    }
  }, 240000);
});
