import { describe, it, expect } from 'vitest';
import {
  declinerDocument, verifierDeclinaison, zoneSurePx, tailleLisibleMinPx, PROFILS_CANAL, type FormatDeclinaison,
} from '../src/studios/rendu/declinaisons';
import { etirementPx, intersection } from '../src/studios/rendu/geometrie';
import { mettreEnPage } from '../src/studios/rendu/texte';
import { POLICES_EMBARQUEES } from '../src/studios/rendu/polices';
import type { DocumentStudio, CalqueImage, CalqueTexte } from '../src/studios/document';
import { pub11, gele } from './l5a-fixtures';

const img = (d: DocumentStudio, id: string) => d.layers[id] as CalqueImage;
const txt = (d: DocumentStudio, id: string) => d.layers[id] as CalqueTexte;

function invariants(d: DocumentStudio, format: FormatDeclinaison) {
  const f = PROFILS_CANAL['meta-reels']!.formats[format];
  const S = zoneSurePx(f);
  const p = img(d, 'produit');
  const constats = {
    dimensions: [d.width, d.height],
    etirementProduit: etirementPx(p),
    etirementFond: etirementPx(img(d, 'fond')),
    textesDansZone: ['titre', 'cta'].every((id) => { const t = txt(d, id); return t.x >= S.x && t.y >= S.y && t.x + t.width <= S.x + S.width && t.y + t.height <= S.y + S.height; }),
    taillesLisibles: ['titre', 'cta'].every((id) => txt(d, id).fontSizePx >= tailleLisibleMinPx(f.largeur)),
    textesSurProduit: ['titre', 'cta'].filter((id) => intersection(txt(d, id), p)),
    debordements: ['titre', 'cta'].filter((id) => mettreEnPage(txt(d, id), POLICES_EMBARQUEES[d.fonts[txt(d, id).fontId]!.family]!).deborde),
    fondCouvre: img(d, 'fond').x <= 0 && img(d, 'fond').y <= 0 && img(d, 'fond').x + img(d, 'fond').width >= d.width && img(d, 'fond').y + img(d, 'fond').height >= d.height,
  };
  return constats;
}

describe('IMG-10 · déclinaisons 1:1 → 4:5 → 9:16 par recomposition', () => {
  const source = gele(pub11());
  const instantane = JSON.stringify(source);

  const r45 = declinerDocument(source, 'meta-reels', '4:5');
  if (!r45.ok) throw new Error(JSON.stringify(r45.violations));
  const r916 = declinerDocument(gele(r45.document), 'meta-reels', '9:16');
  if (!r916.ok) throw new Error(JSON.stringify(r916.violations));

  it.each([['4:5', r45.document], ['9:16', r916.document]] as const)('%s · produit non étiré, textes lisibles dans la zone sûre, hors du produit, fond couvrant', (format, d) => {
    const c = invariants(d, format);
    const f = PROFILS_CANAL['meta-reels']!.formats[format];
    expect(c.dimensions).toEqual([f.largeur, f.hauteur]);
    expect(c.etirementProduit).toBeLessThanOrEqual(1);
    expect(c.etirementFond).toBeLessThanOrEqual(1);
    expect(c.textesDansZone).toBe(true);
    expect(c.taillesLisibles).toBe(true);
    expect(c.textesSurProduit).toEqual([]);
    expect(c.debordements).toEqual([]);
    expect(c.fondCouvre).toBe(true);
  });

  it('9:16 Reels : la zone sûre exclut 14 % en haut et 35 % en bas · l’appel à l’action finit avant 1248 px', () => {
    expect(zoneSurePx(PROFILS_CANAL['meta-reels']!.formats['9:16'])).toEqual({ x: 65, y: 269, width: 950, height: 979 });
    const cta = txt(r916.document, 'cta');
    expect(cta.y + cta.height).toBeLessThanOrEqual(1920 - 672);
    expect(txt(r916.document, 'titre').y).toBeGreaterThanOrEqual(269);
  });

  it('sources intactes : document d’origine inchangé, mêmes calques, mêmes médias, mêmes textes, mêmes masques', () => {
    expect(JSON.stringify(source)).toBe(instantane);
    for (const d of [r45.document, r916.document]) {
      expect(Object.keys(d.layers).sort()).toEqual(Object.keys(source.layers).sort());
      for (const id of ['fond', 'produit']) {
        expect([img(d, id).assetId, img(d, id).sourceWidth, img(d, id).sourceHeight, img(d, id).mask]).toEqual([img(source, id).assetId, img(source, id).sourceWidth, img(source, id).sourceHeight, img(source, id).mask]);
      }
      expect(txt(d, 'titre').text).toBe('La crème qui tient 24 h');
      expect(d.fonts).toEqual(source.fonts);
    }
  });

  it('recompose AVANT de proposer une génération : le fond agrandi au-delà de sa source donne une PROPOSITION, rien de lancé', () => {
    expect(r916.rapport.generationsProposees).toEqual([expect.objectContaining({ operation: 'extension_decor', calqueId: 'fond' })]);
    expect(r916.rapport.profil).toBe('meta-reels');
    expect(r916.rapport.version).toBe('2026-08');
  });

  it('un texte qui ne peut pas tenir lisiblement est REFUSÉ (pas rétréci sous le minimum), source intacte', () => {
    const d = pub11();
    txt(d, 'cta').text = 'Mot '.repeat(400);
    const avant = JSON.stringify(d);
    const r = declinerDocument(d, 'meta-reels', '9:16');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.map((v) => v.raison).join()).toMatch(/déborde|zone sûre|recouvre/);
    expect(JSON.stringify(d)).toBe(avant);
  });

  it('la vérification relit le résultat : un produit étiré après coup est vu', () => {
    const d = JSON.parse(JSON.stringify(r916.document)) as DocumentStudio;
    img(d, 'produit').height += 40;
    expect(verifierDeclinaison(source, d, 'meta-reels', '9:16', { produitIds: ['produit'] }).map((v) => v.raison).join()).toMatch(/étirée/);
    const t = JSON.parse(JSON.stringify(r916.document)) as DocumentStudio;
    txt(t, 'cta').y = 1800;
    expect(verifierDeclinaison(source, t, 'meta-reels', '9:16', { produitIds: ['produit'] }).map((v) => v.raison).join()).toMatch(/zone sûre/);
  });

  it('un texte posé SUR le produit dans la source est écarté du produit dans la déclinaison', () => {
    const d = pub11();
    Object.assign(txt(d, 'cta'), { y: 820, x: 340, width: 400 });
    const r = declinerDocument(d, 'meta-reels', '9:16');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(intersection(txt(r.document, 'cta'), img(r.document, 'produit'))).toBeNull();
    expect(r.rapport.ajustements.join()).toMatch(/cta · écarté du produit/);
  });

  it('un texte trop petit à la source est porté à la taille lisible minimale (24 px sur 1080)', () => {
    const d = pub11();
    txt(d, 'cta').fontSizePx = 16;
    const r = declinerDocument(d, 'meta-reels', '4:5');
    expect(r.ok && txt(r.document, 'cta').fontSizePx).toBe(24);
  });

  it('profil inconnu refusé', () => {
    expect(declinerDocument(pub11(), 'tiktok-inconnu', '9:16').ok).toBe(false);
  });
});
