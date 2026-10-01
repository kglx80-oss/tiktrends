import { describe, expect, it } from 'vitest';
import { filtrerEchantillonVeille, normaliserRecherche } from '../src';

/**
 * Recette #106 · constat Codex · en démonstration, la Veille ignorait le
 * mot-clé et les filtres (`?q=zzzzzzzz` montrait encore l'échantillon). On
 * vérifie le RÉSULTAT du filtre sur un échantillon de forme réelle.
 */
const ECH = [
  { id: 'a', platform: 'meta', status: 'active', mediaType: 'video', advertiserName: 'Old Spice.', body: 'POV: Deine Freundin klaut dir alles · Coconut Vanilla', landingDomain: undefined, mainCountry: 'DE' },
  { id: 'b', platform: 'meta', status: 'active', mediaType: 'video', advertiserName: 'Neutrogena', body: 'Hydro Boost Aqua Gel · strahlend frische Haut', landingDomain: 'amazon.de', mainCountry: 'DE' },
  { id: 'c', platform: 'meta', status: 'inactive', mediaType: 'image', advertiserName: 'Crème Beauté', body: 'Sérum éclat', landingDomain: 'beaute.fr', mainCountry: 'FR' },
];
const ids = (c: Parameters<typeof filtrerEchantillonVeille>[1]) => filtrerEchantillonVeille(ECH, c).map((a) => a.id);

describe('Veille démo · le mot-clé filtre vraiment l’échantillon', () => {
  it('un mot-clé sans correspondance vide l’échantillon (état « aucun résultat » atteignable)', () => {
    expect(ids({ q: 'zzzzzzzz' }), 'le mot-clé est ignoré en démonstration').toEqual([]);
  });
  it('sans critère, tout l’échantillon reste', () => {
    expect(ids({})).toEqual(['a', 'b', 'c']);
    expect(ids({ q: '   ' })).toEqual(['a', 'b', 'c']);
  });
  // Recette #106b · sans « Dans : », le périmètre est celui de la source réelle
  // (texte de l'annonce), jamais « partout » · lien et formulaire ont le même sens.
  it('sans « Dans : », on cherche dans le texte de l’annonce · insensible à la casse et aux accents', () => {
    expect(ids({ q: 'COCONUT' })).toEqual(['a']);
    expect(ids({ q: 'serum eclat' })).toEqual(['c']);
    expect(ids({ q: 'neutrogena' }), 'un lien sans périmètre cherche partout').toEqual([]);
    expect(ids({ q: 'amazon.de' })).toEqual([]);
    expect(ids({ q: 'neutrogena' })).toEqual(ids({ q: 'neutrogena', searchIn: 'ad_copy' }));
    expect(normaliserRecherche(' Crème  Beauté ')).toBe('creme beaute');
  });
  it('« Dans : » restreint le champ cherché', () => {
    expect(ids({ q: 'neutrogena', searchIn: 'ad_copy' })).toEqual([]);
    expect(ids({ q: 'neutrogena', searchIn: 'brand' })).toEqual(['b']);
    expect(ids({ q: 'amazon', searchIn: 'domain' })).toEqual(['b']);
    expect(ids({ q: 'beaute', searchIn: 'brand' })).toEqual(['c']);
  });
});

describe('Veille démo · chaque filtre proposé s’applique', () => {
  it('plateforme', () => { expect(ids({ p: 'tiktok' })).toEqual([]); expect(ids({ p: 'meta' })).toEqual(['a', 'b', 'c']); });
  it('média', () => { expect(ids({ media: 'image' })).toEqual(['c']); expect(ids({ media: 'video' })).toEqual(['a', 'b']); });
  it('statut actif', () => { expect(ids({ status: 'active' })).toEqual(['a', 'b']); expect(ids({ status: 'all' })).toEqual(['a', 'b', 'c']); });
  it('pays', () => { expect(ids({ country: 'fr' })).toEqual(['c']); expect(ids({ country: 'US' })).toEqual([]); });
  it('les critères se cumulent', () => { expect(ids({ q: 'aqua', status: 'active', country: 'DE' })).toEqual(['b']); expect(ids({ q: 'aqua', country: 'FR' })).toEqual([]); });
});
