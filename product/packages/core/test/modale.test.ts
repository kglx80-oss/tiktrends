import { describe, expect, it } from 'vitest';
import { MEDIA_FEUILLE_MODALE, MODALE_SEUIL_FEUILLE_PX, presentationModale } from '../src/modale';

describe('presentationModale · centrée, feuille ou plein écran', () => {
  it('écran large ⇒ fenêtre centrée, même si le plein écran est demandé', () => {
    expect(presentationModale({ feuille: false, telephone: false, pleinEcranDemande: false })).toBe('centree');
    expect(presentationModale({ feuille: false, telephone: false, pleinEcranDemande: true })).toBe('centree');
  });
  it('sous le seuil ⇒ feuille ancrée en bas', () => {
    expect(presentationModale({ feuille: true, telephone: false, pleinEcranDemande: false })).toBe('feuille');
    expect(presentationModale({ feuille: true, telephone: false, pleinEcranDemande: true })).toBe('feuille');
    expect(presentationModale({ feuille: true, telephone: true, pleinEcranDemande: false })).toBe('feuille');
  });
  it('téléphone ET plein écran demandé ⇒ plein écran (cahier Studios §153)', () => {
    expect(presentationModale({ feuille: true, telephone: true, pleinEcranDemande: true })).toBe('plein-ecran');
  });
  it('le seuil est celui du prototype V5 (≤ 600 px)', () => {
    expect(MODALE_SEUIL_FEUILLE_PX).toBe(600);
    expect(MEDIA_FEUILLE_MODALE).toBe('(max-width: 600px)');
  });
});
