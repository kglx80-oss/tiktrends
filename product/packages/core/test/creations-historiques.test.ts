import { describe, it, expect } from 'vitest';
import {
  elementCreationHistorique, texteCreationHistorique, decisionSuiviVideo, cheminTexteHistorique, cheminPubHistorique,
  DELAI_VIDEO_HISTORIQUE_MS, MOTIF_VIDEO_TROP_LONGUE,
} from '../src';

const ID = '11111111-2222-4333-8444-555555555555';
const g = (o: Partial<Parameters<typeof elementCreationHistorique>[0]> = {}) => ({ id: ID, kind: 'image', status: 'completed', assetUrls: ['https://cdn.fal.media/a.png'], createdAt: '2026-09-12T10:00:00Z', ...o });

describe('créations historiques · ce que la bibliothèque montre', () => {
  it('pub · composition servie par sa route, ouvrir = télécharger', () => {
    expect(elementCreationHistorique(g({ kind: 'ad', assetUrls: [] }))).toEqual({
      id: ID, name: 'Pub · 12/09/2026', kind: 'image', url: cheminPubHistorique(ID), createdAt: '2026-09-12T10:00:00Z',
      historique: { libelle: 'Création historique · pub', telecharger: `/api/ad/${ID}` },
    });
  });

  it('image et vidéo · première adresse http(s) ; texte · sa route gardée', () => {
    expect(elementCreationHistorique(g())).toMatchObject({ kind: 'image', url: 'https://cdn.fal.media/a.png', historique: { libelle: 'Création historique · image' } });
    expect(elementCreationHistorique(g({ kind: 'video', assetUrls: ['', 'https://v.fal.media/c.mp4'] }))).toMatchObject({ kind: 'video', url: 'https://v.fal.media/c.mp4', name: 'Vidéo · 12/09/2026' });
    expect(elementCreationHistorique(g({ kind: 'script', assetUrls: null }))).toMatchObject({ kind: 'other', url: cheminTexteHistorique(ID), historique: { telecharger: `/api/creations-historiques/${ID}/texte` } });
  });

  it('n’entrent pas · en cours, échouée, archivée, aperçu d’univers, sans média lisible, adresse forgée', () => {
    for (const status of ['processing', 'failed', 'archived', 'universe_preview', null]) expect(elementCreationHistorique(g({ status })), String(status)).toBeNull();
    expect(elementCreationHistorique(g({ assetUrls: [] }))).toBeNull();
    expect(elementCreationHistorique(g({ assetUrls: ['data:image/png;base64,AAAA', 'javascript:alert(1)', 'https://x.test/a b'] }))).toBeNull();
    expect(elementCreationHistorique(g({ kind: 'inconnu' }))).toBeNull();
  });

  it('le texte d’un ancien script, en clair', () => {
    expect(texteCreationHistorique({ angles: ['Avant/après'], hooks: ['Tu dors mal ?', ' '], script: [{ time: '0-3s', line: 'Gros plan' }], primaryTexts: [], captions: ['Légende'] }))
      .toBe('Angles\n- Avant/après\n\nHooks\n- Tu dors mal ?\n\nScript\n- 0-3s Gros plan\n\nLégendes\n- Légende');
    expect(texteCreationHistorique(null)).toBe('');
    expect(texteCreationHistorique({ angles: 'pas une liste' })).toBe('');
  });
});

describe('vidéos historiques en cours · terminer, échouer (rembourser) ou attendre', () => {
  it('prête · adresse http(s) seulement', () => {
    expect(decisionSuiviVideo({ status: 'completed', videoUrl: 'https://v.fal.media/c.mp4' }, 1000)).toEqual({ action: 'terminer', url: 'https://v.fal.media/c.mp4' });
    expect(decisionSuiviVideo({ status: 'completed', videoUrl: 'javascript:alert(1)' }, 1000)).toEqual({ action: 'terminer', url: null });
  });
  it('échec du fournisseur · échouer avec sa raison', () => {
    expect(decisionSuiviVideo({ status: 'failed', error: 'NSFW' }, 1000)).toEqual({ action: 'echouer', motif: 'NSFW · Crédits remboursés.' });
  });
  it('en cours · attendre jusqu’à 15 min, puis échouer', () => {
    expect(decisionSuiviVideo({ status: 'processing' }, DELAI_VIDEO_HISTORIQUE_MS)).toEqual({ action: 'attendre' });
    expect(decisionSuiviVideo({ status: 'unknown' }, DELAI_VIDEO_HISTORIQUE_MS + 1)).toEqual({ action: 'echouer', motif: MOTIF_VIDEO_TROP_LONGUE });
  });
});
