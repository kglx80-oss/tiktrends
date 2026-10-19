import { describe, it, expect } from 'vitest';
import {
  normaliserDroitsAsset, lireDroitsAsset, provenanceRenseignee, libelleDroitsAsset,
  LICENCES_ASSET, LICENCE_ASSET_DEFAUT, SOURCE_DROITS_MAX,
  ajouterSourcesAuProjet, SOURCES_MAX,
  type SourceReferenceStudio,
} from '../src/index';

/**
 * Lot 7 · règles PURES du noyau (ni base, ni réseau).
 *
 *  (a) Provenance et droits d'un média (`studio_assets.rights`) · énumération
 *      V5 (L14), défaut honnête, lecture d'un `{}` comme « non renseigné ».
 *  (b) Ajout de sources à un projet existant · dédoublonnage par `sourceId`,
 *      rien de retiré, borne `SOURCES_MAX` sur le total.
 */

const src = (id: string): SourceReferenceStudio => ({ sourceId: id } as unknown as SourceReferenceStudio);
const QUAND = new Date('2026-10-17T10:00:00.000Z');

describe('(a) droits d’un média · énumération V5, défaut honnête', () => {
  it('l’énumération est exactement celle de la présentation V5', () => {
    expect([...LICENCES_ASSET]).toEqual(['marque', 'ugc_accord', 'banque_images', 'a_preciser']);
    expect(LICENCE_ASSET_DEFAUT).toBe('a_preciser');
  });

  it('normalise une licence valide · source nettoyée, bornée, posePar/poseLe du serveur', () => {
    const r = normaliserDroitsAsset({ licence: 'ugc_accord', source: '  Créateur   Léa, accord écrit  ' }, { posePar: 'u-1', poseLe: QUAND });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.droits).toEqual({ licence: 'ugc_accord', source: 'Créateur Léa, accord écrit', posePar: 'u-1', poseLe: QUAND.toISOString() });
  });

  it('borne la source à SOURCE_DROITS_MAX', () => {
    const r = normaliserDroitsAsset({ licence: 'banque_images', source: 'x'.repeat(SOURCE_DROITS_MAX + 50) }, { posePar: 'u-1', poseLe: QUAND });
    expect(r.ok && r.droits.source.length).toBe(SOURCE_DROITS_MAX);
  });

  it('refuse une licence hors énumération · aucune licence déduite', () => {
    expect(normaliserDroitsAsset({ licence: 'domaine_public' }, { posePar: 'u-1', poseLe: QUAND })).toMatchObject({ ok: false });
    expect(normaliserDroitsAsset({ licence: undefined }, { posePar: 'u-1', poseLe: QUAND })).toMatchObject({ ok: false });
  });

  it('lit un rights vide comme NON renseigné (null), jamais comme une licence posée', () => {
    expect(lireDroitsAsset({})).toBeNull();
    expect(lireDroitsAsset(null)).toBeNull();
    expect(lireDroitsAsset({ licence: 'inconnue' })).toBeNull();
    expect(lireDroitsAsset({ licence: 'marque', source: 'Shoot studio', posePar: 'u-1', poseLe: QUAND.toISOString() }))
      .toEqual({ licence: 'marque', source: 'Shoot studio', posePar: 'u-1', poseLe: QUAND.toISOString() });
  });

  it('provenanceRenseignee · null et a_preciser = à préciser ; les trois autres = renseignées', () => {
    expect(provenanceRenseignee(null)).toBe(false);
    expect(provenanceRenseignee({ licence: 'a_preciser', source: '', posePar: null, poseLe: null })).toBe(false);
    expect(provenanceRenseignee({ licence: 'marque', source: '', posePar: null, poseLe: null })).toBe(true);
  });

  it('libelleDroitsAsset · « Droits à préciser » par défaut, sinon le libellé V5', () => {
    expect(libelleDroitsAsset(null)).toBe('Droits à préciser');
    expect(libelleDroitsAsset({ licence: 'a_preciser', source: '', posePar: null, poseLe: null })).toBe('Droits à préciser');
    expect(libelleDroitsAsset({ licence: 'ugc_accord', source: '', posePar: null, poseLe: null })).toBe('UGC avec accord');
    expect(libelleDroitsAsset({ licence: 'banque_images', source: '', posePar: null, poseLe: null })).toBe('Banque d’images');
  });
});

describe('(b) ajout de sources · dédoublonnage, rien retiré, borne', () => {
  it('ajoute les nouvelles, garde l’ordre existant d’abord', () => {
    const r = ajouterSourcesAuProjet([src('src_a')], [src('src_b'), src('src_c')]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ajoutees).toBe(2);
    expect(r.sources.map((s) => s.sourceId)).toEqual(['src_a', 'src_b', 'src_c']);
  });

  it('une source déjà jointe n’est pas ré-ajoutée ni remplacée', () => {
    const existante = { sourceId: 'src_a', observeLe: '2020-01-01' } as unknown as SourceReferenceStudio;
    const nouvelle = { sourceId: 'src_a', observeLe: '2026-10-17' } as unknown as SourceReferenceStudio;
    const r = ajouterSourcesAuProjet([existante], [nouvelle, src('src_b')]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ajoutees).toBe(1);
    // L'existante (sa première observation) est gardée telle quelle.
    expect(r.sources.find((s) => s.sourceId === 'src_a')).toBe(existante);
  });

  it('aucune source, ou toutes déjà présentes · refus explicite, rien n’est écrit', () => {
    expect(ajouterSourcesAuProjet([src('src_a')], [])).toMatchObject({ ok: false });
    expect(ajouterSourcesAuProjet([src('src_a')], [src('src_a')])).toMatchObject({ ok: false });
  });

  it('la borne SOURCES_MAX vaut sur le TOTAL', () => {
    const existantes = Array.from({ length: SOURCES_MAX }, (_, i) => src(`src_${i}`));
    expect(ajouterSourcesAuProjet(existantes, [src('src_new')])).toMatchObject({ ok: false });
    // Pile à la borne : accepté.
    const presque = existantes.slice(0, SOURCES_MAX - 1);
    expect(ajouterSourcesAuProjet(presque, [src('src_new')])).toMatchObject({ ok: true, ajoutees: 1 });
  });
});
