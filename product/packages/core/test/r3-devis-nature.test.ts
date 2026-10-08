import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  lignesDuDevis, avecControleVision, controleVisionActif, controleVisionApprouve, qualifierDevis, phraseCoutDevis, borneControleVisionParImageMicros,
  operationsDuSnapshot, exigenceImageDuDevis, devisAgrege, lireBenchmark, planCampagne, tarifsDuProduit, costOfTokens,
  OPERATION_CONTROLE_VISION, OCTETS_TEXTE_CONTROLE_VISION_MAX, VISION_JETONS_IMAGE_MAX, JETONS_CADRE_REQUETE, JETONS_CADRE_BLOC,
  type LigneDevis, type SnapshotJob,
} from '../src';

/**
 * R3 · nature des lignes de devis (borne / estimation), ligne du contrôle
 * visuel, devis du benchmark. Règles pures, résultats lus.
 */

const plan = { aRefaire: [{ id: 'keyframe:s_image', nature: 'generation' as const }, { id: 'composition', nature: 'calcul' as const }] };

describe('lignes du devis studio · nature de chaque montant', () => {
  it('image à prix fixe connu = borne ; calcul = borne ; animation (forfait) = estimation', () => {
    const l = lignesDuDevis({ aRefaire: [...plan.aRefaire, { id: 'clip:s1', nature: 'generation' }] });
    if (!l.ok) throw new Error(l.motif);
    expect(l.lignes.map((x) => [x.operation, x.natureCout, x.motifEstimation])).toEqual([
      ['clip:s1', 'estimation', 'forfait vidéo · le prix réel dépend de la durée et du modèle'],
      ['composition', 'borne', null],
      ['keyframe:s_image', 'borne', null],
    ]);
    expect(qualifierDevis(l.lignes)).toMatchObject({ nature: 'estimation', raison: 'Animation · clip:s1 · forfait vidéo · le prix réel dépend de la durée et du modèle' });
  });
});

describe('ligne du contrôle visuel · cochée par défaut, chiffrée, bornée', () => {
  const l = lignesDuDevis(plan);
  if (!l.ok) throw new Error('lignes');
  it('borne par image = cadre + 5 blocs + texte max en octets + image + sortie, au tarif du modèle', () => {
    expect(borneControleVisionParImageMicros('claude-sonnet-5')).toBe(Math.round(costOfTokens('claude-sonnet-5', JETONS_CADRE_REQUETE + 5 * JETONS_CADRE_BLOC + OCTETS_TEXTE_CONTROLE_VISION_MAX + VISION_JETONS_IMAGE_MAX, 4_000) * 1e6));
    expect(borneControleVisionParImageMicros('claude-sonnet-5')).toBe(147_024);
  });
  it('activée par défaut : une ligne, une unité par image, 0 crédit, total inclus, nature borne', () => {
    const v = avecControleVision(l.lignes, { modele: 'claude-sonnet-5' });
    expect(v.lignes.map((x) => [x.operation, x.profil, x.unites, x.credits, x.usdMicros, x.natureCout])).toEqual([
      ['composition', 'calcul', 1, 0, 0, 'borne'], ['keyframe:s_image', 'image_generation', 1, 4, 80_000, 'borne'],
      [OPERATION_CONTROLE_VISION, 'controle_visuel', 1, 0, 147_024, 'borne'],
    ]);
    expect([v.totalCredits, v.totalUsdMicros]).toEqual([l.totalCredits, 80_000 + 147_024]);
    expect(qualifierDevis(v.lignes).nature).toBe('borne');
    expect(phraseCoutDevis(v.totalUsdMicros, qualifierDevis(v.lignes))).toBe('0,23 $ au plus de coût fournisseur');
  });
  it('décochée ⇒ absente ; pas d’image ⇒ absente', () => {
    expect(avecControleVision(l.lignes, { actif: false, modele: 'claude-sonnet-5' }).lignes.map((x) => x.operation)).toEqual(['composition', 'keyframe:s_image']);
    expect(avecControleVision(l.lignes.filter((x) => x.profil === 'calcul'), { modele: 'claude-sonnet-5' }).lignes.map((x) => x.operation)).toEqual(['composition']);
  });
  it('n’est annoncée que si elle peut s’exécuter : fournisseur de vision ET parcours image ; seul `false` la retire', () => {
    expect(controleVisionActif({ demande: undefined, fournisseurVision: true, devisImage: true })).toBe(true);
    expect(controleVisionActif({ demande: false, fournisseurVision: true, devisImage: true })).toBe(false);
    expect(controleVisionActif({ demande: 'false', fournisseurVision: true, devisImage: true })).toBe(true);
    expect(controleVisionActif({ demande: true, fournisseurVision: false, devisImage: true })).toBe(false);
    expect(controleVisionActif({ demande: true, fournisseurVision: true, devisImage: false })).toBe(false);
  });
  it('la ligne n’est pas de la production : jamais envoyée au fournisseur d’images, jamais « hors image »', () => {
    const v = avecControleVision(l.lignes, { modele: 'claude-sonnet-5' });
    const snap = { lignes: v.lignes } as unknown as SnapshotJob;
    expect(operationsDuSnapshot(snap).map((o) => o.operation)).toEqual(['composition', 'keyframe:s_image']);
    expect(exigenceImageDuDevis(v.lignes)).toEqual({ concerne: true, horsImage: [] });
  });
  it('lecture de la ligne approuvée · absente, illisible ou nulle ⇒ null', () => {
    const v = avecControleVision(l.lignes, { modele: 'claude-sonnet-5' });
    expect(controleVisionApprouve(v.lignes)).toEqual({ unites: 1, usdMicros: 147_024, totalUsdMicros: 147_024 });
    expect(controleVisionApprouve(l.lignes)).toBeNull();
    expect(controleVisionApprouve(null)).toBeNull();
    expect(controleVisionApprouve([{ operation: OPERATION_CONTROLE_VISION, profil: 'controle_visuel', unites: 1, usdMicros: 0 } as LigneDevis])).toBeNull();
  });
  it('phrase : borne arrondie au centime SUPÉRIEUR ; estimation dite', () => {
    expect(phraseCoutDevis(80_001, { nature: 'borne', libelle: 'maximum', raison: null })).toBe('0,09 $ au plus de coût fournisseur');
    expect(phraseCoutDevis(80_001, { nature: 'estimation', libelle: 'estimation · maximum non garanti', raison: 'x' })).toBe('0,08 $ de coût fournisseur · estimation · maximum non garanti (x)');
  });
});

describe('devis du benchmark · nouveau total qualifié', () => {
  const DOCS = join(__dirname, '../../../../docs/studios-v2');
  const PACK = JSON.parse(readFileSync(join(DOCS, '02-PROMPTS.json'), 'utf8')) as { templates: Array<{ key: string; modelProfile: string }> };
  const BENCH = lireBenchmark(readFileSync(join(DOCS, '09-BENCHMARK.json'), 'utf8'), new Set(PACK.templates.map((t) => t.key)));
  if (!BENCH.ok) throw new Error('benchmark illisible');
  const p = planCampagne(BENCH.benchmark, null);
  if (!p.ok) throw new Error('plans');
  const profils = Object.fromEntries(PACK.templates.map((t) => [t.key, t.modelProfile]));
  it('9,925 $ inchangé en montant, mais ESTIMATION : 42 tâches texte (entrée à 3,5 car./jeton) et 2 animations (forfait)', () => {
    const d = devisAgrege(p.plans, tarifsDuProduit({ profils, routage: { reasoning_structured: 'claude-sonnet-5', vision_analysis: 'claude-sonnet-5' } }));
    expect(d).toMatchObject({ ok: true, totalUsdMicros: 9_925_120 });
    expect(d.qualification).toEqual({
      nature: 'estimation', libelle: 'estimation · maximum non garanti',
      raison: '42 tâches texte, 2 médias (animation) · entrée comptée à 3,5 caractères par jeton · pas une borne ; forfait vidéo · le prix réel dépend de la durée et du modèle',
    });
    const lignes = d.cas.flatMap((c) => c.lignes);
    expect(lignes.filter((x) => x.nature === 'calcul' || (x.nature === 'media' && x.cle === 'image_generation')).every((x) => x.natureCout === 'borne')).toBe(true);
  });
});
