import { describe, it, expect } from 'vitest';
import { capaciteDetourage, controlerDetourage, MOTEURS_DETOURAGE_DEPLOYES } from '../src/studios/rendu/detourage';

/** Disque de rayon r centré, bord anti-crénelé sur ~1 px si `doux`. */
function disque(l: number, h: number, r: number, doux: boolean, cx = l / 2, cy = h / 2): Uint8Array {
  const a = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    a[y * l + x] = doux ? Math.round(255 * Math.max(0, Math.min(1, r - d + 0.5))) : d <= r ? 255 : 0;
  }
  return a;
}

describe('IMG-09 · détourage : capacité déclarée honnêtement, résultat contrôlé, repli sans blocage', () => {
  it('aucun moteur déployé : indisponible, avec la raison et des replis non bloquants', () => {
    expect(MOTEURS_DETOURAGE_DEPLOYES).toEqual([]);
    const c = capaciteDetourage();
    expect(c.disponible).toBe(false);
    if (!c.disponible) expect(c.raison).toMatch(/aucun modèle de détourage licencié/);
    expect(c.replis.map((r) => [r.id, r.bloquant])).toEqual([['import_png_transparent', false], ['masque_manuel', false]]);
  });

  it('un moteur ne devient disponible que s’il est déclaré avec sa licence', () => {
    const c = capaciteDetourage([{ id: 'moteur-x', licence: 'Apache-2.0' }]);
    expect(c).toMatchObject({ disponible: true, moteur: { id: 'moteur-x' } });
  });

  it('import détouré à bords doux : exploitable ; bords francs ou sujet coupé : à vérifier ; opaque partout : refusé', () => {
    expect(controlerDetourage(disque(64, 64, 20, true), 64, 64)).toMatchObject({ verdict: 'exploitable', toucheLeBord: false });
    expect(controlerDetourage(disque(64, 64, 20, true), 64, 64).bordAdouci).toBeGreaterThan(0);
    const franc = controlerDetourage(disque(64, 64, 20, false), 64, 64);
    expect(franc.verdict).toBe('a_verifier');
    expect(franc.constats.join()).toMatch(/bords francs/);
    expect(controlerDetourage(disque(64, 64, 20, true, 10, 32), 64, 64).constats.join()).toMatch(/touche le bord/);
    expect(controlerDetourage(new Uint8Array(16).fill(255), 4, 4)).toMatchObject({ verdict: 'refuse' });
  });

  it('une ombre douce détachée du sujet est conservée et signalée', () => {
    const a = disque(64, 64, 12, true);
    for (let x = 10; x < 54; x++) a[60 * 64 + x] = 60;
    const c = controlerDetourage(a, 64, 64);
    expect(c.ombreOuVoile).toBeGreaterThan(0);
    expect(c.constats.join()).toMatch(/ombre ou voile/);
  });
});
