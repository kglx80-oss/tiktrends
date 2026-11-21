import { describe, it, expect } from 'vitest';
import {
  decisionRangementLot, RAISON_AD_DANS_UN_AUTRE_LOT, RAISON_AD_HORS_MARQUE_DU_LOT, RAISON_LOT_DEJA_LANCE,
} from '../src/adsmap/rangement-lot';

const LOT = { id: 'L1', statut: 'planned' };

describe('decisionRangementLot · une ad n’entre que dans un lot de sa marque', () => {
  it('l’ad ne remonte pas à la marque du lot (autre marque, autre espace) · introuvable, dans les deux sens', () => {
    expect(decisionRangementLot({ lot: LOT, ad: null, ranger: true })).toEqual({ ok: false, raison: RAISON_AD_HORS_MARQUE_DU_LOT });
    expect(decisionRangementLot({ lot: LOT, ad: null, ranger: false })).toEqual({ ok: false, raison: RAISON_AD_HORS_MARQUE_DU_LOT });
  });
  it('un lot lancé ou analysé est un témoin · rien n’y entre, rien n’en sort', () => {
    for (const statut of ['testing', 'analyzed']) {
      for (const ranger of [true, false]) {
        expect(decisionRangementLot({ lot: { id: 'L1', statut }, ad: { lotId: null }, ranger })).toEqual({ ok: false, raison: RAISON_LOT_DEJA_LANCE });
      }
    }
  });
  it('ranger · une ad hors lot, ou déjà dans ce lot (double clic) · le lot visé', () => {
    expect(decisionRangementLot({ lot: LOT, ad: { lotId: null }, ranger: true })).toEqual({ ok: true, lotApres: 'L1' });
    expect(decisionRangementLot({ lot: { id: 'L1', statut: 'ready' }, ad: { lotId: 'L1' }, ranger: true })).toEqual({ ok: true, lotApres: 'L1' });
  });
  it('retirer · une ad de ce lot, ou déjà hors lot · hors lot', () => {
    expect(decisionRangementLot({ lot: LOT, ad: { lotId: 'L1' }, ranger: false })).toEqual({ ok: true, lotApres: null });
    expect(decisionRangementLot({ lot: LOT, ad: { lotId: null }, ranger: false })).toEqual({ ok: true, lotApres: null });
  });
  it('une ad rangée dans un AUTRE lot · ni déplacée, ni retirée depuis ce lot-ci', () => {
    expect(decisionRangementLot({ lot: LOT, ad: { lotId: 'L2' }, ranger: true })).toEqual({ ok: false, raison: RAISON_AD_DANS_UN_AUTRE_LOT });
    expect(decisionRangementLot({ lot: LOT, ad: { lotId: 'L2' }, ranger: false })).toEqual({ ok: false, raison: RAISON_AD_DANS_UN_AUTRE_LOT });
  });
  it('les phrases · en français, sans tiret cadratin', () => {
    for (const r of [RAISON_AD_HORS_MARQUE_DU_LOT, RAISON_AD_DANS_UN_AUTRE_LOT, RAISON_LOT_DEJA_LANCE]) expect(r).not.toMatch(/—/);
  });
});
