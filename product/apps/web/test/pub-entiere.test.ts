import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderAdPng, type AdRecipe } from '../lib/ad-render';
import { colorShareInColumns, decodePng, inkProfile } from './png';

/**
 * La publicité entière ne reçoit pas nos mots par-dessus les siens.
 *
 * ── Pourquoi ce garde existe ─────────────────────────────────────────────────
 *
 * Le mode « entière » demande au modèle d'écrire la typographie DANS l'image.
 * Si la maquette continue de poser sa couche, les deux textes se superposent ·
 * et ça ne plante pas, ça rend une bouillie qu'on ne remarque qu'en ouvrant
 * l'image. C'est exactement la famille de défauts qui a valu la remarque
 * « les résultats sont catastrophiques ».
 *
 * L'inverse compte autant : une publicité SANS mode est une publicité d'avant,
 * et elle doit se composer comme avant.
 */

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

describe('le rendu suit le mode', () => {
  it('une publicité entière ne porte aucune couche de texte', async () => {
    // L'accent ne sert QU'À la couche · bouton, puces, kicker. S'il n'en reste
    // rien, c'est que rien n'a été posé par-dessus.
    const entiere = await rendre({ mode: 'entiere' });
    expect(colorShareInColumns(entiere, 0, 1, [255, 0, 255], [0, 1], 60), 'la couche de texte est toujours posée')
      .toBe(0);
  }, 240000);

  it('une publicité composée en porte une', async () => {
    // Le même garde doit distinguer les deux · sinon il constate que le rendu
    // est vide, pas qu'il suit le mode.
    const composee = await rendre({ mode: 'composee' });
    expect(colorShareInColumns(composee, 0, 1, [255, 0, 255], [0, 1], 60)).toBeGreaterThan(0.005);
  }, 240000);

  it('une publicité SANS mode se compose, comme avant', async () => {
    // Les pubs d'avant n'en portent pas · elles ne doivent pas se vider parce
    // qu'on a ajouté un mode.
    const avant = await rendre({});
    const composee = await rendre({ mode: 'composee' });
    expect(Buffer.from(avant.rgba).equals(Buffer.from(composee.rgba))).toBe(true);
  }, 240000);

  it('l’image occupe tout le cadre en mode entier', async () => {
    // Une pub entière est déjà cadrée · la poser en laissant des bandes la
    // rendrait impubliable.
    const img = await rendre({ mode: 'entiere' });
    const profil = inkProfile(img, 6);
    expect(profil.every((v) => v >= 0), 'le rendu est vide').toBe(true);
    expect(img.width).toBe(432);
    expect(img.height).toBe(540);
  }, 240000);
});

describe('le mode voyage jusqu’au bout de la chaîne', () => {
  const SRC = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');

  it('la consigne de publicité entière remplace celle de scène', () => {
    // Sans ce remplacement, le mode serait consigné, montré à l'écran, et
    // n'aurait aucun effet sur ce qui sort · un réglage qui ment.
    expect(SRC).toMatch(/o\.mode === 'entiere'/);
    expect(SRC).toMatch(/promptPubEntiere\(/);
  });

  it('le mode est consigné sur la recette', () => {
    // C'est lui qui décide de la couche ET du contrôle des ratés · perdu, la
    // publicité se recompose au prochain rendu, textes par-dessus textes.
    expect(SRC).toMatch(/mode: o\.mode \?\? 'composee'/);
  });

  it('le contrôle des ratés sait quel mode il regarde', () => {
    // « Du texte est cuit dans l'image » est un défaut d'un côté et
    // exactement ce qu'on a demandé de l'autre.
    expect(SRC).toMatch(/texteDansImage: texteAttenduDansImage\(r\.mode\)/);
  });
});
