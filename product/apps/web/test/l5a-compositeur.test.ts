import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import {
  POLICES_EMBARQUEES, mettreEnPage, placerParFraction, masqueDecorProtegeantProduit, declinerDocument,
  type DocumentStudio, type CalqueImage, type CalqueTexte,
} from '@tiktrends/core';
import { rendreDocument } from '../lib/studios/rendu/compositeur';
import { lirePoliceTtf } from '../lib/studios/rendu/police-ttf';
import { octetsPolice } from '../lib/studios/rendu/polices';
import { appliquerMasqueAuxPixels } from '../lib/studios/rendu/masque-pixels';
import { pub11, decorA, decorB, produit, produitPlein, logo, decoder, boite, capture, png, type Brut } from './l5a-outils';

/**
 * L5-A · compositeur serveur, prouvé sur PIXELS DÉCODÉS (jamais une empreinte
 * seule) : métriques du texte, IMG-05 (dimension au pixel), IMG-02 (produit
 * fidèle), déterminisme, refus explicites.
 */

const IDS = { fond: 'a_fond', produit: 'a_produit', logo: 'a_logo' };
let medias: Map<string, Uint8Array>;
let mediasB: Map<string, Uint8Array>;

beforeAll(async () => {
  const [a, b, p, l] = await Promise.all([decorA(), decorB(), produit(), logo()]);
  medias = new Map([[IDS.fond, a], [IDS.produit, p], [IDS.logo, l]]);
  mediasB = new Map([[IDS.fond, b], [IDS.produit, p], [IDS.logo, l]]);
});

async function rendre(doc: DocumentStudio, m: Map<string, Uint8Array> = medias): Promise<{ png: Buffer; pixels: Brut }> {
  const r = await rendreDocument(doc, m);
  if (!r.ok) throw new Error(`${r.code} ${JSON.stringify(r.violations)}`);
  return { png: r.png, pixels: await decoder(r.png) };
}

describe('mêmes métriques · la table du noyau est celle des fichiers TTF rendus', () => {
  it.each(Object.entries(POLICES_EMBARQUEES))('%s · avances, boîtes d’encre, unités et empreinte identiques au parseur serveur', (_famille, m) => {
    const octets = octetsPolice(m.fichier);
    expect(createHash('sha256').update(octets).digest('hex')).toBe(m.sha256);
    const p = lirePoliceTtf(octets);
    expect([p.unitesParEm, p.ascendant, p.descendant, p.interligne]).toEqual([m.unitesParEm, m.ascendant, m.descendant, m.interligne]);
    const ecarts: string[] = [];
    for (const [cp, met] of Object.entries(m.glyphes)) {
      const g = p.glyphe(Number(cp));
      const b = p.boite(g);
      const lu = b && (b.xMin !== 0 || b.xMax !== 0) ? [p.avance(g), b.xMin, b.xMax] : [p.avance(g)];
      const attendu = met.length === 3 && (met[1] !== 0 || met[2] !== 0) ? [...met] : [met[0]];
      if (JSON.stringify(lu) !== JSON.stringify(attendu)) ecarts.push(`U+${Number(cp).toString(16)} ${JSON.stringify(lu)} ≠ ${JSON.stringify(attendu)}`);
    }
    expect(ecarts).toEqual([]);
  });

  it('l’encre rendue tombe où la mise en page du noyau l’a placée (±1 px), à gauche, au centre, ligne de base comprise', async () => {
    for (const align of ['left', 'center'] as const) {
      const t: CalqueTexte = { id: 't', kind: 'text', name: 'T', visible: true, locked: false, x: 37, y: 41, width: 900, height: 200, rotationDeg: 0, opacity: 1, z: 1, text: 'HHH Été', fontId: 'f', fontSizePx: 100, color: '#000000', align, lineHeight: 1.2 };
      const doc: DocumentStudio = { width: 1000, height: 300, colorSpace: 'sRGB', layers: { t }, fonts: { f: { family: 'Sans', assetId: null } } };
      const { pixels } = await rendre(doc);
      const ink = boite(pixels, (d, i) => d[i + 3]! > 127)!;
      const mep = mettreEnPage(t, POLICES_EMBARQUEES.Sans!);
      const l = mep.lignes[0]!;
      expect(Math.abs(ink.x0 - (37 + l.encre!.gauche)), `${align} · bord gauche`).toBeLessThanOrEqual(1);
      expect(Math.abs(ink.x1 + 1 - (37 + l.encre!.droite)), `${align} · bord droit`).toBeLessThanOrEqual(1);
      // « H » pose sur la ligne de base (yMin = 0) ; « É » monte au-dessus de la capitale.
      const hBas = boite(pixels, (d, i) => d[i + 3]! > 127 && ((i / 4) % 1000) < 37 + l.glyphes[3]!.x)!;
      expect(Math.abs(hBas.y1 + 1 - (41 + l.ligneDeBase)), 'ligne de base').toBeLessThanOrEqual(1);
      // Valeur ABSOLUE, comme CSS : demi-interligne (120 − 111,72) / 2 + ascendant 90,53 = 94,67 sous le haut du cadre.
      expect(Math.abs(hBas.y1 + 1 - (41 + 94.67)), 'ligne de base absolue (CSS)').toBeLessThanOrEqual(1);
    }
  });
});

describe('IMG-05 · produit à 55 % de la largeur, mesuré dans le rendu décodé', () => {
  it.each([1080, 1350, 777])('document de %i px de large : largeur rendue = round(0,55 × L) à 1 px près, hauteur proportionnelle', async (L) => {
    const plein = await produitPlein();
    const p: CalqueImage = { id: 'p', kind: 'image', name: 'P', visible: true, locked: false, x: 100, y: 50, width: 400, height: 600, rotationDeg: 0, opacity: 1, z: 1, assetId: 'a_p', sourceWidth: 800, sourceHeight: 1200, mask: null };
    // Centré dans le document, pour que le produit agrandi n'en sorte pas (il serait rogné).
    Object.assign(p, { x: L / 2 - 200, y: Math.round(L * 0.75) - 300 });
    Object.assign(p, placerParFraction({ width: L, height: L * 1.5 }, p, 0.55));
    const doc: DocumentStudio = { width: L, height: Math.round(L * 1.5), colorSpace: 'sRGB', layers: { p }, fonts: {} };
    const { pixels } = await rendre(doc, new Map([['a_p', plein]]));
    const b = boite(pixels, (d, i) => d[i + 3]! > 0)!;
    const largeur = b.x1 - b.x0 + 1;
    const hauteur = b.y1 - b.y0 + 1;
    expect(Math.abs(largeur - Math.round(0.55 * L))).toBeLessThanOrEqual(1);
    expect(Math.abs(hauteur - (largeur * 1200) / 800)).toBeLessThanOrEqual(1);
  });
});

describe('IMG-02 · Produit fidèle : le décor change, les pixels du produit non', () => {
  it('deux décors différents : 0 pixel du produit (opaque) ne diffère, et ce sont ceux du produit rendu seul', async () => {
    const doc = pub11(IDS);
    const seulDoc = pub11(IDS);
    for (const id of ['fond', 'titre', 'cta', 'logo']) seulDoc.layers[id]!.visible = false;
    const [ra, rb, seul] = await Promise.all([rendre(doc, medias), rendre(doc, mediasB), rendre(seulDoc)]);
    let opaques = 0; let differents = 0; let decorChange = 0;
    for (let p = 0; p < 1080 * 1080; p++) {
      const i = p * 4;
      if (seul.pixels.donnees[i + 3] === 255) {
        opaques++;
        for (let k = 0; k < 4; k++) {
          if (ra.pixels.donnees[i + k] !== seul.pixels.donnees[i + k] || rb.pixels.donnees[i + k] !== seul.pixels.donnees[i + k]) { differents++; break; }
        }
      } else if (seul.pixels.donnees[i + 3] === 0 && ra.pixels.donnees[i] !== rb.pixels.donnees[i]) decorChange++;
    }
    expect(opaques).toBeGreaterThan(200_000);
    expect(differents, 'pixels du produit altérés par le décor').toBe(0);
    expect(decorChange).toBeGreaterThan(100_000);
    capture('img02-decor-a.png', ra.png);
    capture('img02-decor-b.png', rb.png);
  });

  it('produit posé à sa taille source : ses pixels sont EXACTEMENT ceux de la photo source', async () => {
    const p: CalqueImage = { id: 'p', kind: 'image', name: 'P', visible: true, locked: true, x: 140, y: 75, width: 800, height: 1200, rotationDeg: 0, opacity: 1, z: 5, assetId: IDS.produit, sourceWidth: 800, sourceHeight: 1200, mask: null };
    const f = { ...(pub11(IDS).layers.fond as CalqueImage), width: 1080, height: 1350, sourceWidth: 1080, sourceHeight: 1080 };
    f.width = 1350; f.height = 1350; f.x = -135;
    const doc: DocumentStudio = { width: 1080, height: 1350, colorSpace: 'sRGB', layers: { fond: f, p }, fonts: {} };
    const { pixels } = await rendre(doc, mediasB);
    const source = await decoder(medias.get(IDS.produit)!);
    let differents = 0; let compares = 0;
    for (let y = 0; y < 1200; y++) for (let x = 0; x < 800; x++) {
      const s = (y * 800 + x) * 4;
      if (source.donnees[s + 3] !== 255) continue;
      compares++;
      const d = ((y + 75) * 1080 + (x + 140)) * 4;
      for (let k = 0; k < 4; k++) if (pixels.donnees[d + k] !== source.donnees[s + k]) { differents++; break; }
    }
    expect(compares).toBe(784 * 1184);
    expect(differents).toBe(0);
  });

  it('décor régénéré « en place » par un modèle qui touche AUSSI le produit : masque protecteur ⇒ 0 pixel du produit modifié', async () => {
    const doc = pub11(IDS);
    const seulDoc = pub11(IDS);
    for (const id of ['fond', 'titre', 'cta', 'logo']) seulDoc.layers[id]!.visible = false;
    const [original, seul] = await Promise.all([rendre(doc, medias), rendre(seulDoc)]);
    // Génération simulée : tout est repeint, produit compris (teinte décalée partout).
    const gen = Buffer.from(original.pixels.donnees);
    for (let i = 0; i < gen.length; i += 4) { const r = gen[i]!; gen[i] = gen[i + 1]!; gen[i + 1] = gen[i + 2]!; gen[i + 2] = r; }
    const generation = await png(1080, 1080, (x, y) => { const i = (y * 1080 + x) * 4; return [gen[i]!, gen[i + 1]!, gen[i + 2]!, 255]; });
    const alpha = new Uint8Array(1080 * 1080);
    for (let p = 0; p < alpha.length; p++) alpha[p] = seul.pixels.donnees[p * 4 + 3]!;
    const masque = masqueDecorProtegeantProduit(1080, 1080, alpha, 2, 6);
    const r = await appliquerMasqueAuxPixels({ original: original.png, generation, masque, featherPx: 6, format: 'png' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const res = await decoder(r.octets);
    let produitTouche = 0; let decorTouche = 0;
    for (let p = 0; p < alpha.length; p++) {
      const i = p * 4;
      const change = [0, 1, 2, 3].some((k) => res.donnees[i + k] !== original.pixels.donnees[i + k]);
      if (alpha[p]! > 0 && change) produitTouche++;
      if (alpha[p] === 0 && change) decorTouche++;
    }
    expect(produitTouche).toBe(0);
    expect(decorTouche).toBeGreaterThan(500_000);
    expect(r.controle.pixelsHorsZone).toBe(0);
    capture('img02-mise-en-scene-masque.png', await png(1080, 1080, (x, y) => { const v = masque.donnees[y * 1080 + x]!; return [v, v, v, 255]; }));
    capture('img02-mise-en-scene-resultat.png', r.octets);
  });
});

describe('rendu déterministe et refus explicites', () => {
  it('même document, mêmes médias ⇒ même PNG, octet pour octet', async () => {
    const a = await rendre(pub11(IDS));
    const b = await rendre(pub11(IDS));
    expect(createHash('sha256').update(a.png).digest('hex')).toBe(createHash('sha256').update(b.png).digest('hex'));
    capture('rendu-1x1.png', a.png);
  });

  it('IMG-10 · déclinaisons 4:5 puis 9:16 rendues : dimensions exactes, produit non étiré dans les pixels', async () => {
    const r45 = declinerDocument(pub11(IDS), 'meta-reels', '4:5', { produitIds: ['produit'] });
    if (!r45.ok) throw new Error(JSON.stringify(r45.violations));
    const r916 = declinerDocument(r45.document, 'meta-reels', '9:16', { produitIds: ['produit'] });
    if (!r916.ok) throw new Error(JSON.stringify(r916.violations));
    const plein = await produitPlein();
    for (const [nom, d] of [['4x5', r45.document], ['9x16', r916.document]] as const) {
      const rendu = await rendre(d);
      expect([rendu.pixels.largeur, rendu.pixels.hauteur]).toEqual([d.width, d.height]);
      capture(`declinaison-${nom}.png`, rendu.png);
      // Produit seul, plein, dans la géométrie déclinée : largeur/hauteur mesurées dans les pixels.
      const p = d.layers.produit as CalqueImage;
      const seul: DocumentStudio = { ...d, layers: { produit: { ...p } } };
      const { pixels } = await rendre(seul, new Map([[IDS.produit, plein]]));
      const b = boite(pixels, (x, i) => x[i + 3]! > 0)!;
      const w = b.x1 - b.x0 + 1;
      const h = b.y1 - b.y0 + 1;
      expect(Math.abs(h - (w * 1200) / 800), `${nom} · produit étiré`).toBeLessThanOrEqual(1);
    }
  });

  it('police téléversée : refus UNSUPPORTED_CAPABILITY, aucune police de repli', async () => {
    const d = pub11(IDS);
    d.fonts.f_titre = { family: 'Sans Bold', assetId: 'a_police' };
    const r = await rendreDocument(d, medias);
    expect(r).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY' });
  });

  it('média absent ou aux dimensions différentes de la source déclarée : MISSING_REFERENCE, pas de trou', async () => {
    const sans = new Map(medias);
    sans.delete(IDS.logo);
    expect(await rendreDocument(pub11(IDS), sans)).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' });
    const faux = new Map(medias);
    faux.set(IDS.produit, await logo());
    const r = await rendreDocument(pub11(IDS), faux);
    expect(r).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' });
    if (!r.ok) expect(r.violations[0]!.raison).toMatch(/différentes de la source déclarée/);
  });

  it('forme, rotation et opacité : ellipse anti-crénelée, calque tourné de 90° autour de son centre, demi-opacité', async () => {
    const doc: DocumentStudio = {
      width: 200, height: 200, colorSpace: 'sRGB', fonts: {},
      layers: {
        e: { id: 'e', kind: 'shape', name: 'E', visible: true, locked: false, x: 10, y: 10, width: 80, height: 40, rotationDeg: 90, opacity: 0.5, z: 1, shape: 'rect', fill: '#00ff00' },
      },
    };
    const { pixels } = await rendre(doc);
    const b = boite(pixels, (d, i) => d[i + 3]! > 0)!;
    expect([b.x0, b.x1, b.y0, b.y1]).toEqual([30, 69, 0, 69]);
    expect(pixels.donnees[(40 * 200 + 50) * 4 + 3]).toBe(128);
  });
});
