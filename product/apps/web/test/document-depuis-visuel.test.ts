import { describe, it, expect } from 'vitest';
import { validerDocument } from '@tiktrends/core';
import { documentDepuisVisuel } from '../components/studios/editeur/document-depuis-visuel';
const media = { assetId: 'asset_rendu', nom: 'Image produite', mime: 'image/png', width: 1024, height: 1024 };
describe('visuel livré vers composition éditable', () => {
  it('conserve le média, les textes exacts et des blocs distincts valides sans metadata de provenance imprimée', () => {
    const doc = documentDepuisVisuel('1:1', media, ['HYDRA THERAPY', 'Corps (fr) · Soin BTX · 300 g · sources : src_catalogue']);
    expect(validerDocument(doc)).toEqual([]);
    const layers = Object.values(doc.layers);
    expect(layers.filter(l => l.kind === 'image')).toMatchObject([{ assetId: media.assetId, sourceWidth: 1024, sourceHeight: 1024 }]);
    const texts = layers.filter(l => l.kind === 'text');
    expect(texts.map(l => l.kind === 'text' && l.text)).toEqual(['HYDRA THERAPY', 'Soin BTX · 300 g']);
    expect(texts[0]!.y + texts[0]!.height).toBeLessThanOrEqual(texts[1]!.y);
  });
  it('ne fabrique aucun texte absent et refuse les médias sans dimensions', () => {
    expect(Object.values(documentDepuisVisuel('1:1', media, []).layers)).toHaveLength(1);
    expect(() => documentDepuisVisuel('1:1', { ...media, width: 0 }, [])).toThrow();
    expect(() => documentDepuisVisuel('1:1', media, Array(11).fill('Texte'))).toThrow();
  });
});
