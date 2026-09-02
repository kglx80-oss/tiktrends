import { describe, it, expect } from 'vitest';
import { AD_TEMPLATES } from '@tiktrends/ai';
import { renderAdPng, type AdRecipe } from '../lib/ad-render';
import { AD_LAYOUTS, layoutsFor } from '@tiktrends/core';
import { decodePng, inkProfile, composition, bandLuminance } from './png';

/**
 * Ce que le rendu produit VRAIMENT.
 *
 * ── La panne qu'on n'a pas vue ───────────────────────────────────────────────
 *
 * On a réduit le canevas des vignettes sans redimensionner la maquette, écrite
 * en pixels durs calés sur 1080. Une accroche de 74 px sur une image large de
 * 432 · un titre qui mange la moitié de la pub. Compilation, lint et huit cents
 * tests sont passés au vert : rien ne regardait le résultat.
 *
 * Un rendu ne se vérifie pas en lisant le code qui l'a produit.
 *
 * ── Ce qu'on mesure ──────────────────────────────────────────────────────────
 *
 * Pas l'égalité de deux images · une différence d'un pixel ferait échouer pour
 * rien. Et pas non plus le profil bande à bande : un texte ne se recompose pas
 * proportionnellement, une accroche peut tenir sur deux lignes là où elle en
 * prenait trois, et tout le bloc remonte d'une bande. C'est correct.
 *
 * On mesure donc **la quantité d'encre** et **son centre de gravité**. Une
 * maquette qui se recompose les garde ; une maquette qui ne se redimensionne
 * pas voit son texte exploser · elle couvre bien plus de surface et son centre
 * remonte vers le titre devenu géant. C'est exactement la régression livrée.
 */

// Un PNG 1×1 transparent · la scène ne doit pas partir sur le réseau depuis un test.
const SCENE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const recette = (o: Partial<AdRecipe> = {}): AdRecipe => ({
  template: 'problem_solution', sceneUrl: SCENE,
  kicker: 'HELLO', headline: 'Ton garage est encore plein le dimanche soir',
  subhead: 'Trois minutes, et tu retrouves ta place.', cta: 'J’en profite',
  badge: '-20%', quote: 'Incroyable', author: 'Sophie', rating: 5,
  benefits: ['Rapide', 'Solide', 'Malin'], stat: '24h', statLabel: 'Le temps d’une nuit',
  accent: '#2563EB', brandName: 'Klorea', logoUrl: null, variant: 0,
  ...o,
});

const rendre = async (o: Partial<AdRecipe>) =>
  decodePng(Buffer.from(await renderAdPng(recette(o))));

/** Deux compositions se ressemblent · encre et centre de gravité voisins. */
function memeComposition(a: ReturnType<typeof composition>, b: ReturnType<typeof composition>) {
  return {
    encre: Math.abs(a.ink - b.ink),
    centre: Math.abs(a.center - b.center),
  };
}

describe('la maquette suit la taille du canevas', () => {
  it('le rendu a exactement les dimensions demandées', async () => {
    const img = await rendre({ width: 432, height: 540 });
    expect(img.width).toBe(432);
    expect(img.height).toBe(540);
  }, 60000);

  /**
   * Le test qui aurait attrapé la régression · à 40 %, la maquette non
   * redimensionnée poussait le titre sur toute la hauteur et faisait disparaître
   * le bas. Le profil d'encre s'en trouvait bouleversé.
   */
  it('à 40 %, la composition est la même', async () => {
    const plein = composition(await rendre({ width: 1080, height: 1350 }));
    const petit = composition(await rendre({ width: 432, height: 540 }));
    const d = memeComposition(plein, petit);
    expect(d.encre, `encre ${plein.ink.toFixed(3)} vs ${petit.ink.toFixed(3)}`).toBeLessThan(0.03);
    expect(d.centre, `centre ${plein.center.toFixed(3)} vs ${petit.center.toFixed(3)}`).toBeLessThan(0.06);
  }, 120000);

  it('à 50 % aussi · ce n’est pas un réglage qui marche par hasard', async () => {
    const plein = composition(await rendre({ width: 1080, height: 1350 }));
    const demi = composition(await rendre({ width: 540, height: 675 }));
    const d = memeComposition(plein, demi);
    expect(d.encre).toBeLessThan(0.03);
    expect(d.centre).toBeLessThan(0.06);
  }, 120000);

  it('chaque gabarit tient la réduction · pas seulement celui qu’on regarde', async () => {
    for (const template of AD_TEMPLATES) {
      const plein = composition(await rendre({ template, width: 1080, height: 1350 }));
      const petit = composition(await rendre({ template, width: 432, height: 540 }));
      const d = memeComposition(plein, petit);
      expect(d.encre, `${template} · encre ${plein.ink.toFixed(3)} vs ${petit.ink.toFixed(3)}`).toBeLessThan(0.04);
      expect(d.centre, `${template} · centre ${plein.center.toFixed(3)} vs ${petit.center.toFixed(3)}`).toBeLessThan(0.08);
    }
  }, 300000);
});

describe('le rendu reste lisible', () => {
  it('une pub n’est jamais vide ni uniforme', async () => {
    const img = await rendre({ width: 432, height: 540 });
    const profil = inkProfile(img);
    // Du texte clair existe quelque part, et tout n'est pas clair · une image
    // entièrement noire ou entièrement blanche est un rendu raté qui « passe ».
    expect(Math.max(...profil)).toBeGreaterThan(0.02);
    expect(Math.min(...profil)).toBeLessThan(0.9);
  }, 60000);
});

describe('la construction de l’arbre reste synchrone', () => {
  /**
   * L'échelle est posée dans une variable de module, juste avant de construire
   * l'arbre. C'est sûr **parce que la construction ne contient aucun `await`** :
   * elle est atomique pour la boucle d'événements.
   *
   * Le jour où quelqu'un rend ce chemin asynchrone, deux pubs rendues en même
   * temps prendraient l'échelle l'une de l'autre · et personne ne comprendrait
   * pourquoi une vignette sort parfois en taille d'impression.
   */
  it('deux rendus de tailles différentes lancés ensemble ne se mélangent pas', async () => {
    const [grand, petit] = await Promise.all([
      rendre({ width: 1080, height: 1350 }),
      rendre({ width: 432, height: 540 }),
    ]);
    expect(grand.width).toBe(1080);
    expect(petit.width).toBe(432);
    expect(memeComposition(composition(grand), composition(petit)).encre).toBeLessThan(0.03);
  }, 120000);
});

describe('les mises en page produisent des images différentes', () => {
  /**
   * ── Le constat qui a déclenché ce travail ──────────────────────────────────
   *
   * « On fait et on obtient toujours le même résultat. » C'était exact : sept
   * gabarits rendaient la même composition, photo plein cadre + bandeau noir +
   * texte blanc, et ne changeaient que les champs affichés.
   *
   * Des noms de mises en page différents ne prouvent rien · seul le pixel le
   * prouve. Ce test mesure ce qui sort, pas ce qu'on a déclaré.
   */
  it('quatre coquilles donnent quatre compositions distinctes', async () => {
    const rendus = await Promise.all(
      AD_LAYOUTS.map((layout) => rendre({ layout, width: 432, height: 540 })),
    );
    const comps = rendus.map(composition);

    for (let a = 0; a < comps.length; a++) {
      for (let b = a + 1; b < comps.length; b++) {
        const d = memeComposition(comps[a]!, comps[b]!);
        // Au moins l'une des deux mesures bouge nettement · deux coquilles qui
        // se ressemblent sur les deux sont deux fois la même image.
        expect(
          Math.max(d.encre, d.centre),
          `« ${AD_LAYOUTS[a]} » et « ${AD_LAYOUTS[b]} » rendent la même chose`,
        ).toBeGreaterThan(0.02);
      }
    }
  }, 180000);

  it('l’affiche est claire là où l’immersif est sombre', async () => {
    // Tout le catalogue était sombre · c'est à soi seul une raison pour laquelle
    // toutes les créas se ressemblaient.
    const [affiche, immersif] = await Promise.all([
      rendre({ layout: 'affiche', width: 432, height: 540 }),
      rendre({ layout: 'immersif', width: 432, height: 540 }),
    ]);
    expect(composition(affiche).ink).toBeGreaterThan(composition(immersif).ink);
  }, 120000);

  it('chaque gabarit tient dans chacune de ses coquilles', async () => {
    // Une coquille qui casse un gabarit sortirait une image vide ou uniforme ·
    // elle passerait la compilation et se verrait seulement en production.
    for (const template of AD_TEMPLATES) {
      for (const layout of layoutsFor(template)) {
        const img = await rendre({ template, layout, width: 324, height: 405 });
        const profil = inkProfile(img);
        expect(Math.max(...profil), `${template} / ${layout}`).toBeGreaterThan(0.02);
        expect(Math.min(...profil), `${template} / ${layout}`).toBeLessThan(0.95);
      }
    }
  }, 600000);
});

describe('une pub reste lisible, quelle que soit la photo', () => {
  /**
   * ── Ce que les autres tests ne voyaient pas ────────────────────────────────
   *
   * Ils vérifient qu'une pub n'est ni vide ni uniforme. Un titre blanc posé sur
   * une zone claire de la photo passe les deux et ne se lit pas.
   *
   * On rend donc sur trois scènes réelles — claire, sombre, et un damier noir et
   * blanc, le pire cas pour poser du texte — et on exige que le FOND de la zone
   * de texte reste opposé à son encre. C'est ce que les voiles et les aplats
   * sont censés garantir, sur n'importe quelle photo et pas seulement sur celles
   * qui les arrangent.
   *
   * ── Les deux versions qui ne servaient à rien ──────────────────────────────
   *
   * La première mesurait l'ÉCART de luminance dans la bande · vérifiée en
   * retirant le voile de l'immersive, elle restait verte : le bouton d'action
   * fournissait l'écart à lui seul.
   *
   * La seconde mesurait le fond, mais sur un PNG de 1×1 qui ne se rasterise pas
   * · une sonde l'a montré, la scène « blanche » rendait plus SOMBRE (0,036) que
   * la transparente (0,104). Aucune image n'était dessinée, on mesurait le fond
   * du cadre. Un test de lisibilité sur une photo qui n'existe pas passe pour la
   * mauvaise raison.
   *
   * D'où de vraies images de 64 px. Les autres tests du fichier gardent le 1×1 ·
   * ils mesurent la mise à l'échelle de la maquette, pas ce qui se passe
   * au-dessus d'une photo.
   */
  const SCENES: Array<[string, string]> = [
    ['claire', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAkklEQVR4nO3QQREAAAiAMPuX1hh7yBJwzD43OkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAO0ARtDDsqXe37wAAAAASUVORK5CYII='],
    ['sombre', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAlklEQVR4nO3QsQ0AIAzAsI4V//8LZ3ggg/cos3vuz0YHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gNUAHaA3QAVoDdIDWAB2gPRfEkQBsCh6+AAAAAElFTkSuQmCC'],
    ['damier', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAzklEQVR4nO3QwQnAIBQFQftvOukgOQSdH1jB48j61vVy1lqP9+/+9YXpH2iABmiABmiABvgwwPTAA54HaM8DtOcB2vMA7XmA9jxAex5g/fjAzb4BdID2DaADtG8AHaB9A0wPPOB5gPY8QHseoD0P0J4HaM8DtOcB1o8P3OwbQAdo3wA6QPsG0AHaN8D0wAOeB2jPA7TnAdrzAO15gPY8QHseYP34wM2+AXSA9g2gA7RvAB2gfQNMDzzgeYD2PEB7HqA9D9CeB2jPA7TnAdTfT6baSiuz9/AAAAAASUVORK5CYII='],
  ];

  /** Où le texte se pose, et sur quel fond il DOIT se poser. */
  const ZONES: Array<{ layout: string; de: number; a: number; fond: 'sombre' | 'clair' }> = [
    { layout: 'immersif', de: 0.74, a: 0.94, fond: 'sombre' },
    { layout: 'champ', de: 0.70, a: 0.92, fond: 'sombre' },
    { layout: 'split', de: 0.64, a: 0.92, fond: 'sombre' },
    // L'affiche est la seule à encre sombre · son fond doit rester clair.
    { layout: 'affiche', de: 0.14, a: 0.34, fond: 'clair' },
  ];

  for (const z of ZONES) {
    it(`« ${z.layout} » pose son texte sur un fond ${z.fond}, sur les trois scènes`, async () => {
      for (const [nom, scene] of SCENES) {
        const img = await rendre({ layout: z.layout as never, sceneUrl: scene, width: 432, height: 540 });
        const l = bandLuminance(img, z.de, z.a);
        if (z.fond === 'sombre') {
          expect(l, `« ${z.layout} » sur scène ${nom} : texte blanc sur fond clair, il s’y noie`)
            .toBeLessThan(0.45);
        } else {
          expect(l, `« ${z.layout} » sur scène ${nom} : texte sombre sur fond sombre, il s’y noie`)
            .toBeGreaterThan(0.6);
        }
      }
    }, 240000);
  }
});
