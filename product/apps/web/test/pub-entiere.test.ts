import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { renderAdPng, type AdRecipe } from '../lib/ad-render';
import { colorShare, colorShareInColumns, decodePng } from './png';

/** Un PNG d'une seule couleur · une scène dont on reconnaît chaque pixel, pour
 *  distinguer sans ambiguïté l'image de la marge d'un cadre. */
function solidPng(w: number, h: number, [r, g, b]: [number, number, number]): string {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) { c ^= buf[i]!; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
    return (~c) >>> 0;
  };
  const chunk = (t: string, d: Buffer) => {
    const ty = Buffer.from(t, 'ascii'); const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(Buffer.concat([ty, d])));
    return Buffer.concat([len, ty, d, cr]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 4)] = 0; for (let x = 0; x < w; x++) { const p = y * (1 + w * 4) + 1 + x * 4; raw[p] = r; raw[p + 1] = g; raw[p + 2] = b; raw[p + 3] = 255; } }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return 'data:image/png;base64,' + png.toString('base64');
}

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

  it('à son propre ratio, l’entière remplit le cadre', async () => {
    // Le cas heureux · un cadre au ratio de l'image la remplit sans marge.
    // Scène 1:1, cadre 1:1 · la couleur occupe (presque) toute la surface.
    const carre = solidPng(8, 8, [255, 0, 255]);
    const img = await rendre({ mode: 'entiere', sceneUrl: carre, width: 400, height: 400 });
    expect(colorShare(img, [255, 0, 255], 60), 'l’image ne remplit pas son cadre au bon ratio').toBeGreaterThan(0.9);
  }, 240000);

  it('sur un cadre d’un AUTRE ratio, l’entière est contenue · jamais rognée', async () => {
    // Le défaut reproduit · une entière (accroche, CTA, produit cuits dans
    // l'image) consultée ou exportée dans un cadre plus haut — un aperçu 9:16 —
    // était calée en `cover` et se voyait couper le haut et le bas. On la CONTIENT
    // désormais · l'image reste entière au centre, des marges sombres comblent
    // l'écart. Scène 1:1 dans un cadre 1:2 · la couleur ne doit occuper que la
    // bande centrale, jamais les bords haut et bas (ce serait une découpe).
    const carre = solidPng(8, 8, [255, 0, 255]);
    const img = await rendre({ mode: 'entiere', sceneUrl: carre, width: 400, height: 800 });
    const magenta: [number, number, number] = [255, 0, 255];
    expect(colorShareInColumns(img, 0, 1, magenta, [0, 0.15], 60), 'le haut est rempli · l’image est rognée, pas contenue').toBeLessThan(0.05);
    expect(colorShareInColumns(img, 0, 1, magenta, [0.85, 1], 60), 'le bas est rempli · l’image est rognée, pas contenue').toBeLessThan(0.05);
    expect(colorShareInColumns(img, 0, 1, magenta, [0.4, 0.6], 60), 'la bande centrale ne porte pas l’image').toBeGreaterThan(0.9);
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

  it('le mode est consigné sur la recette, par item', () => {
    // C'est lui qui décide de la couche ET du contrôle des ratés · perdu, la
    // publicité se recompose au prochain rendu, textes par-dessus textes. Il est
    // consigné PAR ITEM · une pub repliée en composée porte son mode à elle, et
    // retombe sur celui du lot puis sur « composee » quand rien ne l'a changé.
    expect(SRC).toMatch(/mode: modeParItem\.get\(i\) \?\? o\.mode \?\? 'composee'/);
  });

  it('le contrôle des ratés sait quel mode il regarde', () => {
    // « Du texte est cuit dans l'image » est un défaut d'un côté et
    // exactement ce qu'on a demandé de l'autre.
    expect(SRC).toMatch(/texteDansImage: texteAttenduDansImage\(r\.mode\)/);
  });
});
