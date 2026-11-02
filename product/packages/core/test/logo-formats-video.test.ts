import { describe, expect, it } from 'vitest';
import { bilanLogosCharte, imageVignetteMarque, referencesUtiliseesParPlan, timelineDesPlans, type VerificationEmpreinte } from '../src';
import type { ContenuVersion, PlanStudio } from '../src/studios/document';

/**
 * Deux trous du logo à réimporter (après #1001) · on lit le RÉSULTAT des règles.
 *  · Veille · Formats · l'image des miniatures (photo produit, sinon logo par
 *    défaut jugé par le MÊME bilan que les autres écrans) ;
 *  · Studios vidéo · les références qu'utiliserait l'image clé d'un plan, sur
 *    lesquelles l'écran annonce un logo à réimporter avant le clic payant.
 */
const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const LOGO = 'https://cdn.exemple.test/bucket/assets/ws/1-ab-logo.png';
const PHOTO = 'https://cdn.exemple.test/bucket/assets/ws/2-cd-produit.png';
const bilan = (v: VerificationEmpreinte | null) => bilanLogosCharte({ logos: [LOGO], defaut: LOGO, empreintes: { [LOGO]: MD5 }, verifications: new Map([[LOGO, v]]) });

describe('imageVignetteMarque · la miniature de Veille · Formats', () => {
  it('une photo produit passe d’abord · même un logo à réimporter n’y change rien', () => {
    expect(imageVignetteMarque({ brandId: 'b', photoProduit: PHOTO, logo: LOGO, bilanLogo: bilan({ ok: false, raison: 'remplace' }) })).toEqual({ source: 'produit', url: PHOTO });
  });
  it('sans photo · le logo servi (intact, ou sans empreinte donc rien de vérifié)', () => {
    expect(imageVignetteMarque({ brandId: 'b', photoProduit: null, logo: LOGO, bilanLogo: bilan({ ok: true, empreinte: MD5 }) })).toEqual({ source: 'logo', url: LOGO });
    expect(imageVignetteMarque({ brandId: 'b', photoProduit: '', logo: LOGO, bilanLogo: null })).toEqual({ source: 'logo', url: LOGO });
  });
  it('logo REMPLACÉ, disparu ou non vérifiable · aucune image (le repli de la miniature), jamais une image que la route refuserait', () => {
    expect(imageVignetteMarque({ brandId: 'b', photoProduit: null, logo: LOGO, bilanLogo: bilan({ ok: false, raison: 'remplace' }) })).toBeNull();
    expect(imageVignetteMarque({ brandId: 'b', photoProduit: null, logo: LOGO, bilanLogo: bilan({ ok: false, raison: 'absent' }) })).toBeNull();
    expect(imageVignetteMarque({ brandId: 'b', photoProduit: null, logo: LOGO, bilanLogo: bilan(null) })).toBeNull();
  });
  it('ni photo ni logo · aucune image', () => {
    expect(imageVignetteMarque({ brandId: 'b', photoProduit: null, logo: null, bilanLogo: null })).toBeNull();
  });
});

const SHA = 'a'.repeat(64);
const plan = (shotId: string, o: Partial<PlanStudio> = {}): PlanStudio => ({
  shotId, purpose: 'Accroche', subject: 'Léa', action: 'regarde', framing: 'rapproché', camera: 'fixe', lighting: 'matin', environment: 'salle de bain',
  referenceIds: [], narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 3000, ...o,
});
const EPINGLE = {
  schema: 'produit_epingle/1', productId: 'p_serum', assetId: 'pph_serum', nom: 'Sérum', faits: [], manques: [], photoDisponible: true, instantaneLe: '2026-10-01T00:00:00Z',
  variante: {}, photo: { assetId: 'pph_serum', assetVersion: SHA.slice(0, 16), sha256: SHA, nature: 'contenu', position: 1, total: 1 },
  composantsObligatoires: ['bouchon'], attributsImmuables: [], transformationsAutorisees: [], provenanceFaits: { origine: 'catalogue_produits', productId: 'p_serum', releveLe: '2026-10-01T00:00:00Z' }, epingleLe: '2026-10-01T00:00:00Z',
};
function video(productRef: unknown = EPINGLE): ContenuVersion {
  const c = {
    brief: { formats: ['9:16'], references: [{ assetId: 'logo_du_brief', role: 'logo', scope: 'global' }] },
    productRef, styleRef: null, characterRefs: { c_lea: { tenue: 'veste jaune' } },
    // `s_image` · l'image du studio, présente dans les plans d'un projet image · jamais un plan vidéo.
    shots: { order: ['s1', 's2'], byId: { s1: plan('s1', { referenceIds: ['c_lea'] }), s2: plan('s2', { referenceIds: ['p_serum'] }), s_image: plan('s_image', { referenceIds: ['p_serum'] }) } },
    document: null, timeline: null,
  } as unknown as ContenuVersion;
  return { ...c, timeline: timelineDesPlans(c, null) };
}
const ref = (assetId: string) => ({ assetId, assetVersion: SHA.slice(0, 16), sha256: SHA, role: 'logo' });

describe('referencesUtiliseesParPlan · ce que l’image clé d’un plan utiliserait', () => {
  it('le plan qui cite le produit · la photo épinglée (ce que la compilation transmettrait)', () => {
    expect(referencesUtiliseesParPlan(video(), 's2', [])).toEqual(['pph_serum']);
  });
  it('les références des consignes retenue et en attente s’y ajoutent, chacune une fois', () => {
    expect(referencesUtiliseesParPlan(video(), 's2', [{ references: [ref('logo_a'), ref('pph_serum')] }, null, { references: [ref('logo_b'), ref('logo_a')] }]))
      .toEqual(['pph_serum', 'logo_a', 'logo_b']);
    expect(referencesUtiliseesParPlan(video(), 's1', [{ references: [ref('logo_a')] }])).toEqual(['logo_a']);
  });
  it('un plan qui ne cite pas le produit, ou produit sans photo épinglée · rien de transmis', () => {
    expect(referencesUtiliseesParPlan(video(), 's1', [])).toEqual([]);
    expect(referencesUtiliseesParPlan(video({ productId: 'p_serum', assetId: null }), 's2', [])).toEqual([]);
  });
  it('les références du BRIEF n’y entrent pas · aucune n’est transmise aux images clés des plans', () => {
    expect(referencesUtiliseesParPlan(video(), 's2', [])).not.toContain('logo_du_brief');
  });
  it('plan inconnu ou plan de l’image du studio · rien', () => {
    expect(referencesUtiliseesParPlan(video(), 's9', [{ references: [ref('logo_a')] }])).toEqual([]);
    expect(referencesUtiliseesParPlan(video(), 's_image', [{ references: [ref('logo_a')] }])).toEqual([]);
  });
});
