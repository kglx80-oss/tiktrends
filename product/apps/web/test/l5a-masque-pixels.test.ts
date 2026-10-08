import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  masqueDepuisPolygone, traceEcranVersSource, documentVersEcran, zoneAutorisee, composerParMasque, type Vue, type MasqueBrut,
} from '@tiktrends/core';
import { appliquerMasqueAuxPixels, statistiquesEncodage } from '../lib/studios/rendu/masque-pixels';
import { analyserDetourage } from '../lib/studios/rendu/detourage';
import { png, decoder, capture } from './l5a-outils';

// Tests de pixels lourds (décodages 1080 × 1920) · délais larges, la suite complète tourne en parallèle.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/**
 * IMG-06 côté serveur · original et génération ENCODÉS (PNG), décodés par
 * `sharp`, composés, contrôlés, puis encodés ; le fichier produit est redécodé
 * et ses pixels comptés hors zone + fondu.
 */

const L = 400; const H = 300;
// Calque posé en 800 × 600 à (40, 20) : l'écran ne parle pas en pixels source.
const CALQUE = { x: 40, y: 20, width: 800, height: 600, rotationDeg: 0, sourceWidth: L, sourceHeight: H };
// Zone gauche voulue, en pixels du document · source x 20 → 140, y 60 → 240.
const ZONE = [{ x: 80, y: 140 }, { x: 320, y: 140 }, { x: 320, y: 500 }, { x: 80, y: 500 }];
const VUES: Vue[] = [{ zoom: 0.3, panX: 12, panY: 4 }, { zoom: 1, panX: 0, panY: 0 }, { zoom: 2.5, panX: -640.25, panY: -77 }, { zoom: 6, panX: -2000, panY: -900 }];

let original: Buffer;
let generation: Buffer;
const FONDU = 8;

function masqueSous(v: Vue): MasqueBrut {
  const ecran = ZONE.map((p) => documentVersEcran(p, v));
  return masqueDepuisPolygone(L, H, traceEcranVersSource(ecran, v, CALQUE));
}

beforeAll(async () => {
  original = await png(L, H, (x, y) => [(x * 7 + y * 3) & 255, (x * 13) & 255, (y * 11) & 255, 255]);
  // Le modèle repeint tout (décalage partout) et ajoute une étoile jaune dans la zone gauche.
  generation = await png(L, H, (x, y) => {
    const dx = x - 80; const dy = y - 150;
    if (Math.abs(dx) + Math.abs(dy) < 30) return [255, 220, 0, 255];
    return [((x * 7 + y * 3) + 40) & 255, ((x * 13) + 9) & 255, ((y * 11) + 77) & 255, 255];
  });
});

async function compterHorsZone(sortie: Uint8Array, m: MasqueBrut): Promise<{ horsZone: number; dansZone: number }> {
  const o = await decoder(original);
  const r = await decoder(sortie);
  const z = zoneAutorisee(m, FONDU);
  let horsZone = 0; let dansZone = 0;
  for (let p = 0; p < L * H; p++) {
    const change = [0, 1, 2, 3].some((k) => o.donnees[p * 4 + k] !== r.donnees[p * 4 + k]);
    if (change && !z[p]) horsZone++;
    if (change && z[p]) dansZone++;
  }
  return { horsZone, dansZone };
}

describe('IMG-06 · ajout dans la zone gauche, plusieurs zooms et déplacements, pixels décodés', { timeout: 60_000 }, () => {
  it.each(VUES.map((v) => [v.zoom, v] as const))('zoom %s : 0 pixel modifié hors zone + fondu dans le PNG stocké, l’étoile est posée', async (_z, v) => {
    const m = masqueSous(v);
    const r = await appliquerMasqueAuxPixels({ original, generation, masque: m, featherPx: FONDU, format: 'png' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.controle.pixelsHorsZone).toBe(0);
    expect(r.controleApresEncodage?.pixelsHorsZone).toBe(0);
    const c = await compterHorsZone(r.octets, m);
    expect(c.horsZone).toBe(0);
    expect(c.dansZone).toBeGreaterThan(100 * 150);
    const res = await decoder(r.octets);
    expect([...res.donnees.subarray((150 * L + 80) * 4, (150 * L + 80) * 4 + 4)]).toEqual([255, 220, 0, 255]);
    if (v.zoom === 1) {
      capture('img06-original.png', original);
      capture('img06-generation.png', generation);
      capture('img06-resultat.png', r.octets);
      capture('img06-masque.png', await png(L, H, (x, y) => { const a = m.donnees[y * L + x]!; return [a, a, a, 255]; }));
    }
  });

  it('JPEG (avec perte) : encodé SEULEMENT après un contrôle conforme', async () => {
    const avant = statistiquesEncodage.encodages;
    const r = await appliquerMasqueAuxPixels({ original, generation, masque: masqueSous(VUES[1]!), featherPx: FONDU, format: 'jpeg' });
    expect(r.ok && r.mime).toBe('image/jpeg');
    expect(r.ok && r.controle.pixelsHorsZone).toBe(0);
    expect(statistiquesEncodage.encodages).toBe(avant + 1);
  });

  it('composition fautive (masque ignoré) : le contrôle la voit, RIEN n’est encodé', async () => {
    const avant = statistiquesEncodage.encodages;
    const fautive: typeof composerParMasque = (o, g) => ({ ...o, donnees: new Uint8Array(g.donnees) });
    const r = await appliquerMasqueAuxPixels({ original, generation, masque: masqueSous(VUES[0]!), featherPx: FONDU, format: 'webp', composer: fautive });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.raison).toMatch(/hors de la zone autorisée · rien n’est encodé/);
      expect(r.controle!.pixelsHorsZone).toBeGreaterThan(90_000);
    }
    expect(statistiquesEncodage.encodages).toBe(avant);
  });

  it('masque aux dimensions de l’écran (pas de la source) refusé ; génération d’une autre taille refusée sauf redimension explicite', async () => {
    const ecran = masqueDepuisPolygone(800, 600, ZONE);
    const r1 = await appliquerMasqueAuxPixels({ original, generation, masque: ecran, featherPx: FONDU, format: 'png' });
    expect(r1).toMatchObject({ ok: false });
    if (!r1.ok) expect(r1.raison).toMatch(/dimensions de la source/);
    const grande = await png(800, 600, () => [10, 10, 10, 255]);
    expect(await appliquerMasqueAuxPixels({ original, generation: grande, masque: masqueSous(VUES[1]!), featherPx: FONDU, format: 'png' })).toMatchObject({ ok: false });
    const r3 = await appliquerMasqueAuxPixels({ original, generation: grande, masque: masqueSous(VUES[1]!), featherPx: FONDU, format: 'png', redimensionnerGeneration: true });
    expect(r3.ok && r3.controle.pixelsHorsZone).toBe(0);
  });
});

describe('IMG-09 · contrôle d’un import détouré, côté serveur (aucun WebGPU, aucun moteur)', { timeout: 60_000 }, () => {
  it('PNG transparent à bords doux : exploitable ; capacité automatique déclarée indisponible avec replis', async () => {
    const disque = await png(120, 120, (x, y) => {
      const d = Math.hypot(x + 0.5 - 60, y + 0.5 - 60);
      return [200, 30, 30, Math.round(255 * Math.max(0, Math.min(1, 40 - d + 0.5)))];
    });
    const a = await analyserDetourage(disque);
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.controle.verdict).toBe('exploitable');
    expect(a.capacite).toMatchObject({ disponible: false });
    expect(a.capacite.replis.every((r) => r.bloquant === false)).toBe(true);
  });

  it('image sans transparence (JPEG) : refusée comme détourage, avec la raison', async () => {
    const sharp = (await import('sharp')).default;
    const jpeg = await sharp(await png(50, 50, () => [1, 2, 3, 255])).jpeg().toBuffer();
    const a = await analyserDetourage(jpeg);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.raison).toMatch(/aucun canal de transparence/);
  });
});
