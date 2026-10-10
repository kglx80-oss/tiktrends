import { describe, it, expect } from 'vitest';
import { verifierProduitFidele, masqueDecorProtegeantProduit } from '../src/studios/rendu/produit-fidele';
import { zoneAutorisee } from '../src/studios/rendu/masque';
import { pub11 } from './l5a-fixtures';

describe('IMG-02 · Produit fidèle · règles du document', () => {
  it('le document de recette respecte le mode : décor dessous, textes signalés s’ils recouvrent', () => {
    const p = verifierProduitFidele(pub11(), 'produit');
    expect(p.violations).toEqual([]);
    expect(p.decors).toEqual(['fond']);
  });

  it('refuse une image au-dessus du produit, un produit étiré, masqué ou transparent', () => {
    const d = pub11();
    d.layers.fond!.z = 50;
    const p = d.layers.produit as Extract<(typeof d.layers)[string], { kind: 'image' }>;
    p.height = 700; // 420 × 700 pour une source 800 × 1200 : étiré
    p.opacity = 0.9;
    p.mask = { format: 'grayscale8', width: 800, height: 1200, assetId: 'a_masque', featherPx: 4 };
    const raisons = verifierProduitFidele(d, 'produit').violations.map((v) => v.raison).join(' | ');
    expect(raisons).toMatch(/recouvre le produit/);
    expect(raisons).toMatch(/étiré de 70\.0 px/);
    expect(raisons).toMatch(/opaque/);
    expect(raisons).toMatch(/masque de retouche/);
  });

  it('masque de décor : la zone autorisée (support + fondu) ne touche AUCUN pixel du produit', () => {
    const L = 60; const H = 40;
    const alpha = new Uint8Array(L * H);
    for (let y = 10; y < 30; y++) for (let x = 20; x < 35; x++) alpha[y * L + x] = 255;
    const m = masqueDecorProtegeantProduit(L, H, alpha, 2, 5);
    const z = zoneAutorisee(m, 5);
    let touches = 0;
    for (let i = 0; i < alpha.length; i++) if (alpha[i] && z[i]) touches++;
    expect(touches).toBe(0);
    expect(m.donnees[0]).toBe(255);
  });
});
