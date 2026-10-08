import { describe, it, expect } from 'vitest';
import {
  admissibiliteEvaluation, controlerBenchmarkApprouve, controlerPiecesAppel, devisAgrege, ficheVierge, lireBenchmark, planCampagne, planifierPiecesVision,
  sceller, tarifsDuProduit, verdictAvecFiches, BANNIERE_REEL, FORMAT_RAPPORT, PORTEE_BENCHMARK, RUBRIQUE_REFERENCE, VALIDITE_APPROBATION_MS,
  VISION_JETONS_IMAGE_MAX, VISION_OCTETS_PIECE_MAX, VISION_PIECES_MESUREES_MAX, VISION_PIECES_PAR_APPEL_MAX,
  verdictCampagne, sha256OctetsHex,
  type CampagneRelue, type FicheRevue, type MediaResoluVision, type PlanCas, type RapportCampagne,
} from '../src';
import type { LienMedia } from '../src/prompts/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lot F-D · règles PURES : pièces natives de la vision, devis avec images,
 * admissibilité d'une release `staged` en évaluation, fiches et geste
 * « benchmark approuvé ». Chaque garde lit un RÉSULTAT (valeur rendue).
 */

const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
// PNG 6×4 réel (sharp), repris de l3-media-complet.
const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=');
const WEBP = b64('UklGRjQAAABXRUJQVlA4ICgAAABwAQCdASoGAAQAAUAmJaACdAF1AAD+5IYsW/+5wP/9nA//2cD+JAAA');

const lien = (assetId: string, index: number, octets: Uint8Array, o: Partial<LienMedia> = {}): LienMedia => ({
  bindingId: `b_${assetId}`, assetId, assetVersion: 'v1', sha256: sha256OctetsHex(octets), role: 'sortie', modality: 'image', derivation: 'original',
  nativeAttachmentIndex: index, coverageDescription: 'image entière', ...o,
});
const lu = (assetId: string, octets: Uint8Array, assetVersion = 'v1'): [string, MediaResoluVision] => [assetId, { ok: true, assetId, assetVersion, octets }];

describe('vision · des liaisons aux pièces natives', () => {
  it('deux images · une pièce par liaison, à SON index natif, empreinte recalculée sur les octets lus', () => {
    const p = planifierPiecesVision([lien('ref', 1, WEBP), lien('sortie', 0, PNG)], new Map([lu('sortie', PNG), lu('ref', WEBP)]));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.pieces.map((x) => [x.index, x.assetId, x.mime, x.largeur, x.hauteur])).toEqual([[0, 'sortie', 'image/png', 6, 4], [1, 'ref', 'image/webp', 6, 4]]);
    expect(p.correspondances.map((c) => [c.bindingId, c.nativeAttachmentIndex, c.sha256])).toEqual([['b_sortie', 0, sha256OctetsHex(PNG)], ['b_ref', 1, sha256OctetsHex(WEBP)]]);
    expect(p.jetonsImagesMax).toBe(2 * VISION_JETONS_IMAGE_MAX);
  });

  it('un média non lu dans la portée, ou modifié depuis la liaison : aucune pièce, aucune substitution', () => {
    expect(planifierPiecesVision([lien('x', 0, PNG)], new Map([['x', { ok: false, assetId: 'x', motif: 'hors_portee' }]]))).toMatchObject({ ok: false, code: 'MEDIA_NON_RESOLU' });
    expect(planifierPiecesVision([lien('x', 0, PNG)], new Map())).toMatchObject({ ok: false, code: 'MEDIA_NON_RESOLU' });
    expect(planifierPiecesVision([lien('x', 0, PNG)], new Map([lu('x', WEBP)]))).toMatchObject({ ok: false, code: 'MEDIA_ALTERE' });
    expect(planifierPiecesVision([lien('x', 0, PNG)], new Map([lu('x', PNG, 'v2')]))).toMatchObject({ ok: false, code: 'MEDIA_ALTERE' });
  });

  it('vidéo ou audio : bloqué avant appel (aucune dérivation inventée)', () => {
    expect(planifierPiecesVision([lien('v', 0, PNG, { modality: 'video' })], new Map([lu('v', PNG)]))).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', constats: [{ code: 'MODALITE_NON_SUPPORTEE' }] });
  });

  it('bornes : nombre, index, octets, type relu (un texte déguisé en image est refusé)', () => {
    const n = VISION_PIECES_PAR_APPEL_MAX + 1;
    const liens = Array.from({ length: n }, (_, i) => lien(`m${i}`, i, PNG));
    expect(planifierPiecesVision(liens, new Map(liens.map((l) => lu(l.assetId, PNG))))).toMatchObject({ ok: false, constats: [{ code: 'VISION_TROP_DE_PIECES' }] });
    expect(planifierPiecesVision([lien('a', 0, PNG), lien('b', 2, PNG)], new Map([lu('a', PNG), lu('b', PNG)]))).toMatchObject({ ok: false, constats: [{ code: 'VISION_INDEX_INCOHERENTS' }] });
    const texte = new TextEncoder().encode('<html>pas une image</html>');
    expect(planifierPiecesVision([lien('t', 0, texte)], new Map([lu('t', texte)]))).toMatchObject({ ok: false, constats: [{ code: 'VISION_TYPE_REFUSE' }] });
    const lourd = new Uint8Array(VISION_OCTETS_PIECE_MAX + 1);
    expect(planifierPiecesVision([lien('l', 0, lourd)], new Map([lu('l', lourd)]))).toMatchObject({ ok: false, constats: [{ code: 'VISION_PIECE_TROP_LOURDE' }] });
  });

  it('borne de nombre MESURÉE : au plus 3 images par tâche vision dans les 24 cas, borne ×2', () => {
    // Recompte depuis le vrai jeu de scénarios : F01 qualité = sortie + 2 références.
    expect(VISION_PIECES_MESUREES_MAX).toBe(3);
    expect(VISION_PIECES_PAR_APPEL_MAX).toBe(2 * VISION_PIECES_MESUREES_MAX);
  });

  it('contrat de l’adaptateur : pièces hors vision, index décalé, octets altérés · refusés', () => {
    const p = planifierPiecesVision([lien('a', 0, PNG)], new Map([lu('a', PNG)]));
    if (!p.ok) throw new Error('plan');
    expect(controlerPiecesAppel('vision_analysis', p.pieces)).toEqual([]);
    expect(controlerPiecesAppel('reasoning_structured', p.pieces).map((c) => c.code)).toEqual(['PIECES_HORS_VISION']);
    expect(controlerPiecesAppel('vision_analysis', [{ ...p.pieces[0]!, index: 1 }]).map((c) => c.code)).toEqual(['VISION_INDEX_INCOHERENTS']);
    const altere = p.pieces[0]!.octets.slice(); altere[40] ^= 1;
    expect(controlerPiecesAppel('vision_analysis', [{ ...p.pieces[0]!, octets: altere }]).map((c) => c.code)).toContain('MEDIA_ALTERE');
  });
});

/* ─────────────────────────────── devis ──────────────────────────────────── */

const PACK = JSON.parse(readFileSync(join(__dirname, '../../../../docs/studios-v2/02-PROMPTS.json'), 'utf8')) as { templates: Array<{ key: string; modelProfile: string }> };
const BENCH = lireBenchmark(readFileSync(join(__dirname, '../../../../docs/studios-v2/09-BENCHMARK.json'), 'utf8'), new Set(PACK.templates.map((t) => t.key)));
if (!BENCH.ok) throw new Error('benchmark illisible');
const PLANS = (() => { const p = planCampagne(BENCH.benchmark, null); if (!p.ok) throw new Error('plans'); return p.plans; })();
const PROFILS = Object.fromEntries(PACK.templates.map((t) => [t.key, t.modelProfile]));

describe('devis agrégé · la vision est chiffrée, images comprises', () => {
  const t = tarifsDuProduit({ profils: PROFILS, routage: { reasoning_structured: 'claude-sonnet-5', vision_analysis: 'claude-sonnet-5' } });

  it('24 cas chiffrables · total 9,925 $ · une tâche vision compte 6 images de 4 784 jetons', () => {
    const d = devisAgrege(PLANS, t);
    expect(d).toMatchObject({ ok: true, totalUsdMicros: 9_925_120 });
    if (!d.ok) return;
    const f07 = d.cas.find((c) => c.cas === 'F07')!.lignes[0]!;
    // (24 000 + 6 × 4 784) jetons × 3 $/M + 4 000 × 15 $/M = 218 112 µ$.
    expect(f07.usdMicros).toBe((24_000 + 6 * 4_784) * 3 + 4_000 * 15);
    expect(d.cas.flatMap((c) => c.lignes).filter((l) => l.nature === 'tache' && !(Number(l.usdMicros) > 0))).toEqual([]);
  });

  it('une vision sans borne de jetons par image n’est jamais chiffrée à 0 $', () => {
    const d = devisAgrege(PLANS, { ...t, jetonsParImage: 0 });
    expect(d).toMatchObject({ ok: false, nonChiffrables: ['F01', 'F02', 'F07', 'F12', 'F13', 'F15'] });
  });
});

/* ──────────────────────── release staged en évaluation ──────────────────── */

const REL = { id: 'r1', statut: 'staged', hash: 'h1', revoquee: false };
const MAINTENANT = new Date('2026-10-08T12:00:00Z');
const CAMPAGNE: CampagneRelue = { approbationId: 'a1', releaseId: 'r1', releaseHash: 'h1', consommeeLe: '2026-10-08T11:00:00Z', close: false };
const adm = (o: Partial<Parameters<typeof admissibiliteEvaluation>[0]> = {}) => admissibiliteEvaluation({
  release: REL, demande: { releaseId: 'r1', approbationId: 'a1' }, campagne: CAMPAGNE, portee: PORTEE_BENCHMARK, maintenant: MAINTENANT, ...o,
}).map((c) => c.code);

describe('mode évaluation · une release staged seulement dans une campagne autorisée', () => {
  it('contrôle positif : staged, campagne consommée et ouverte, portée synthétique', () => {
    expect(adm()).toEqual([]);
  });
  it('chaque condition manquante est dite', () => {
    expect(adm({ release: { ...REL, statut: 'active' } })).toEqual(['RELEASE_NON_EVALUABLE']);
    expect(adm({ release: { ...REL, statut: 'retired' } })).toEqual(['RELEASE_NON_EVALUABLE']);
    expect(adm({ release: { ...REL, revoquee: true } })).toEqual(['RELEASE_REVOQUEE']);
    expect(adm({ release: null })).toEqual(['RELEASE_INTROUVABLE', 'CAMPAGNE_AUTRE_RELEASE']);
    expect(adm({ portee: { workspaceId: 'espace-client', brandId: 'marque' } })).toEqual(['PORTEE_NON_SYNTHETIQUE']);
    expect(adm({ campagne: null })).toEqual(['CAMPAGNE_ABSENTE']);
    expect(adm({ campagne: { ...CAMPAGNE, consommeeLe: null } })).toEqual(['CAMPAGNE_NON_DEMARREE']);
    expect(adm({ campagne: { ...CAMPAGNE, close: true } })).toEqual(['CAMPAGNE_CLOSE']);
    expect(adm({ campagne: { ...CAMPAGNE, releaseHash: 'autre' } })).toEqual(['CAMPAGNE_AUTRE_RELEASE']);
    expect(adm({ maintenant: new Date(Date.parse(CAMPAGNE.consommeeLe!) + VALIDITE_APPROBATION_MS + 1) })).toEqual(['CAMPAGNE_EXPIREE']);
  });
});

/* ─────────────────────── fiches et benchmark approuvé ───────────────────── */

function rapportReel(plans: readonly PlanCas[]): RapportCampagne {
  const resultats = plans.map((p) => ({ cas: p.id, statut: 'execute' as const, motif: null, invariants: p.invariants.map((id) => ({ id, description: id, passe: true, detail: '' })), fiche: ficheVierge(p, RUBRIQUE_REFERENCE, 'reel') }));
  const verdict = verdictCampagne({ mode: 'reel', rubrique: RUBRIQUE_REFERENCE, resultats });
  return sceller({
    format: FORMAT_RAPPORT, mode: 'reel', banniere: BANNIERE_REEL, horodatage: MAINTENANT.toISOString(), release: { id: 'r1', hash: 'h1' }, modele: 'claude-sonnet-5', adaptateur: 'anthropic-garde',
    devis: { chiffrable: true, totalUsdMicros: 1, empreinte: 'e', nonChiffrables: [] }, budget: { usdMicros: 10, approbationId: 'a1' }, depenseUsdMicros: 0, arrete: null,
    cas: resultats.map((r) => ({ cas: r.cas, statut: r.statut, motif: null, invariants: r.invariants, fiche: !!r.fiche, runIds: [], dossier: r.cas })), verdict,
  });
}
const remplir = (plans: readonly PlanCas[], note = 2, relecteur: string | null = 'Relectrice A'): FicheRevue[] =>
  plans.flatMap((p) => { const f = ficheVierge(p, RUBRIQUE_REFERENCE, 'reel'); return f ? [{ ...f, sorties: f.sorties.map((s) => ({ ...s, relecteur, notes: Object.fromEntries(RUBRIQUE_REFERENCE.dimensions.map((d) => [d, note])) as typeof s.notes })) }] : []; });

describe('fiches humaines · le verdict se recalcule sur le rapport scellé', () => {
  const rapport = rapportReel(PLANS);
  it('fiches vides : revue humaine requise ; fiches remplies et nommées : CONFORME, approuvable', () => {
    expect(rapport.verdict).toMatchObject({ statut: 'REVUE_HUMAINE_REQUISE', approuvable: false });
    const v = verdictAvecFiches(rapport, remplir(PLANS), PLANS);
    expect(v.constats).toEqual([]);
    expect(v.verdict).toMatchObject({ statut: 'CONFORME', approuvable: true, moyenne: 10 });
  });
  it('rubrique intacte : moyenne 7/10 refusée, fiche sans relecteur refusée, fiche manquante dite', () => {
    const sept = remplir(PLANS).map((f) => ({ ...f, sorties: f.sorties.map((s) => ({ ...s, notes: { ...s.notes, texte: 1, 'qualité technique': 1, cohérence: 1 } })) }));
    expect(verdictAvecFiches(rapport, sept, PLANS).verdict).toMatchObject({ statut: 'NON_CONFORME', approuvable: false });
    expect(verdictAvecFiches(rapport, remplir(PLANS, 2, null), PLANS).verdict.statut).toBe('NON_CONFORME');
    expect(verdictAvecFiches(rapport, remplir(PLANS).slice(1), PLANS).constats.map((c) => c.code)).toEqual(['FICHE_ABSENTE']);
    expect(verdictAvecFiches({ ...rapport, mode: 'simule' }, remplir(PLANS), PLANS).constats.map((c) => c.code)).toContain('RAPPORT_SIMULE');
  });
});

describe('geste « benchmark approuvé » · évaluation réelle passée ET fiches remplies', () => {
  const release = { id: 'r1', statut: 'staged', hash: 'h1', revoquee: false, testsStructurels: true };
  const result = (o: Record<string, unknown> = {}) => ({ type: 'fiches_benchmark', mode: 'reel', releaseHash: 'h1', empreinteRapport: 'x', evaluationReelle: true, refus: [], verdict: { statut: 'CONFORME', approuvable: true, moyenne: 10 }, fiches: remplir(PLANS), ...o });
  const ev = (o: Record<string, unknown> = {}, passed = true) => ({ id: 'e1', releaseId: 'r1', kind: 'benchmark', passed, result: result(o) });
  const codes = (o: Partial<Parameters<typeof controlerBenchmarkApprouve>[0]>) => controlerBenchmarkApprouve({ release, evaluation: ev(), approbateur: 'u1', plans: PLANS, ...o }).map((c) => c.code);

  it('contrôle positif', () => { expect(codes({})).toEqual([]); });
  it('refus nommés', () => {
    expect(codes({ evaluation: null })).toEqual(['EVALUATION_ABSENTE']);
    expect(codes({ evaluation: { ...ev(), result: { type: 'campagne_benchmark' } } })).toEqual(['FICHES_ABSENTES']);
    expect(codes({ evaluation: ev({ mode: 'simule' }) })).toEqual(['EVALUATION_NON_REELLE']);
    expect(codes({ evaluation: ev({}, false) })).toEqual(['EVALUATION_NON_PASSEE']);
    expect(codes({ evaluation: ev({ releaseHash: 'h0' }) })).toEqual(['EVALUATION_AUTRE_EMPREINTE']);
    // Une ligne « passée » forgée sans fiches remplies ne suffit pas : le geste relit les fiches.
    expect(codes({ evaluation: ev({ fiches: remplir(PLANS).map((f, i) => (i === 0 ? { ...f, sorties: f.sorties.map((s) => ({ ...s, notes: { ...s.notes, texte: null } })) } : f)) }) })).toEqual(['FICHES_NON_REMPLIES']);
    expect(codes({ approbateur: null })).toEqual(['APPROBATEUR_ANONYME']);
    expect(codes({ release: { ...release, statut: 'active' } })).toEqual(['RELEASE_NON_STAGED']);
    expect(codes({ release: { ...release, testsStructurels: false } })).toEqual(['TESTS_STRUCTURELS_ABSENTS']);
  });
});
