import { describe, it, expect } from 'vitest';
import {
  CATALOGUE_VIDEO, RAPPORT_CREDITS_VIDEO, MODELE_VIDEO_STUDIO_DEFAUT, FIXED_COSTS, CREDIT_COSTS, SCHEMA_PARAMETRES_CLIP_V1,
  entreeCatalogueVideo, modeleAnimationStudio, dureeClipPour, decisionAudioNatif, tarifClip, corpsFalVideo,
  parametresDuClip, lireParametresClip, requeteFalAnimation, coutSoumissionStudio, lignesAvecTarifClip, refusTarifClipChange,
  prixClipDuPlan, tarifDuClip, vueLignesDevis, lignesDuDevis,
  type ContenuVersion, type PlanStudio, type MediaResolu, type ParametresClipSnapshot, type ResolutionVideo, type LigneDevis,
} from '../src';

/**
 * Catalogue vidéo des Studios · le corps fal exact par famille, la réserve
 * EXACTE (prix à la seconde × durée, voix comprise), le devis égal à la
 * réserve, la voix refusée quand le modèle ne parle pas la langue du projet.
 * Pur, 0 $, aucun appel.
 */

const KLING = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
const VEO_FAST = 'fal-ai/veo3.1/fast/image-to-video';
const VEO_LITE = 'fal-ai/veo3.1/lite/image-to-video';
const KF = '22222222-2222-4222-8222-222222222222';
const SHA = 'a'.repeat(64);
const URL_KF = 'https://cdn.tiktrends.test/studio/kf.png';
const ops = [{ operation: 'clip:s1', profil: 'animation' as const }];

const plan = (o: Partial<PlanStudio> = {}): PlanStudio => ({
  shotId: 's1', purpose: 'Accroche', subject: 'Léa', action: 'sourit', framing: 'plan rapproché', camera: 'fixe',
  lighting: 'matin', environment: 'salle de bain', referenceIds: [], narration: 'Tu en as marre ?', onScreenText: [],
  speechMode: 'voiceover', estimatedDurationMs: 3000, ...o,
});
const contenu = (p: PlanStudio = plan(), brief: Record<string, unknown> | null = null): ContenuVersion => ({
  brief, productRef: null, styleRef: null, characterRefs: {}, shots: { order: [p.shotId], byId: { [p.shotId]: p } }, document: null, timeline: null,
} as unknown as ContenuVersion);
const params = (modele: string, p: Partial<PlanStudio> = {}, brief: Record<string, unknown> | null = null): ParametresClipSnapshot => {
  const r = parametresDuClip({ contenu: contenu(plan(p), brief), shotId: 's1', keyframe: { assetUuid: KF, sha256: SHA }, modele });
  if (!r.ok) throw new Error(r.motif);
  return r.parametres;
};
const source = (): MediaResolu => ({ assetId: `sta_${KF}`, etat: 'autorise', url: URL_KF, sha256: SHA });
const corps = (p: ParametresClipSnapshot, modeleWorker = KLING) => {
  const r = requeteFalAnimation({ operations: ops, parametres: p, source: source(), modele: modeleWorker });
  if (!r.ok) throw new Error(r.motif);
  return r;
};
const NEGATIF = 'texte incrusté, sous-titres, logo déformé, filigrane, mains ou visages déformés, changement de produit';

describe('catalogue · endpoints, durées et prix relevés le 16/11', () => {
  it('trois entrées, endpoints exacts, familles, durées, prix à la seconde (micro-dollars)', () => {
    expect(CATALOGUE_VIDEO.map((e) => [e.endpoint, e.famille, e.dureesS, e.resolutionDefaut])).toEqual([
      [KLING, 'kling', [5, 10], '1080p'],
      [VEO_FAST, 'veo', [4, 6, 8], '1080p'],
      [VEO_LITE, 'veo', [4, 6, 8], '720p'],
    ]);
    expect(entreeCatalogueVideo(KLING)!.prix).toEqual({ '1080p': { muetUsdMicros: 70_000, audioUsdMicros: null } });
    expect(entreeCatalogueVideo(VEO_FAST)!.prix).toEqual({ '720p': { muetUsdMicros: 100_000, audioUsdMicros: 150_000 }, '1080p': { muetUsdMicros: 100_000, audioUsdMicros: 150_000 } });
    expect(entreeCatalogueVideo(VEO_LITE)!.prix).toEqual({ '720p': { muetUsdMicros: 30_000, audioUsdMicros: 50_000 }, '1080p': { muetUsdMicros: 50_000, audioUsdMicros: 80_000 } });
    expect(entreeCatalogueVideo('fal-ai/autre')).toBeNull();
  });
  it('voix · Kling sans voix française, Veo à valider à l’écoute, jamais présentée comme acquise', () => {
    expect(entreeCatalogueVideo(KLING)!.voix).toMatchObject({ native: false, langues: ['zh', 'en'], statut: 'confirmee' });
    for (const m of [VEO_FAST, VEO_LITE]) expect(entreeCatalogueVideo(m)!.voix).toMatchObject({ native: true, langues: null, statut: 'a_valider_ecoute' });
  });
  it('rapport crédits d’aujourd’hui · 200 crédits ↔ 0,35 $ (Kling 5 s)', () => {
    expect(RAPPORT_CREDITS_VIDEO).toEqual({ credits: CREDIT_COSTS.video, usdMicros: 350_000 });
    expect(RAPPORT_CREDITS_VIDEO.credits).toBe(200);
  });
});

describe('choix du modèle · FAL_VIDEO_MODEL_STUDIO, distinct de FAL_VIDEO_MODEL_I2V', () => {
  it('défaut = Kling 2.5 turbo pro ; I2V ne change rien ; la variable Studios décide', () => {
    expect(modeleAnimationStudio({})).toBe(KLING);
    expect(MODELE_VIDEO_STUDIO_DEFAUT).toBe(KLING);
    expect(modeleAnimationStudio({ FAL_VIDEO_MODEL_I2V: 'fal-ai/kling-video/v2/master/image-to-video' })).toBe(KLING);
    expect(modeleAnimationStudio({ FAL_VIDEO_MODEL_STUDIO: ` ${VEO_FAST} ` })).toBe(VEO_FAST);
  });
});

describe('durée · la plus proche durée permise ≥ durée du plan, bornée', () => {
  it.each([
    [KLING, 3000, 5, false], [KLING, 5000, 5, false], [KLING, 5001, 10, false], [KLING, 14_000, 10, true],
    [VEO_FAST, 0, 4, false], [VEO_FAST, 4500, 6, false], [VEO_FAST, 7500, 8, false], [VEO_FAST, 12_000, 8, true],
  ])('%s · plan de %i ms ⇒ %i s (bornée %s)', (m, ms, d, b) => {
    expect(dureeClipPour(entreeCatalogueVideo(m)!, ms)).toEqual({ dureeS: d, bornee: b });
  });
});

describe('corps fal exact par famille', () => {
  it('Kling 5 s · le corps de main, à l’identique (clés et ordre)', () => {
    const r = corps(params(KLING));
    expect(r.modele).toBe(KLING);
    expect(r.corps).toEqual({ prompt: params(KLING).consigne, image_url: URL_KF, duration: '5', negative_prompt: NEGATIF });
    expect(Object.keys(r.corps)).toEqual(['prompt', 'image_url', 'duration', 'negative_prompt']);
  });
  it('Kling 5 s · un instantané studio_clip/1 (d’avant le catalogue) produit EXACTEMENT le même corps', () => {
    const { modele: _m, audio: _a, resolution: _r, ratio: _q, ...v1 } = params(KLING);
    const ancien = corps({ ...v1, schema: SCHEMA_PARAMETRES_CLIP_V1 } as unknown as ParametresClipSnapshot);
    expect(ancien.corps).toEqual(corps(params(KLING)).corps);
    expect(JSON.stringify(ancien.corps)).toBe(JSON.stringify(corps(params(KLING)).corps));
  });
  it('Kling 10 s · plan de 7 s', () => {
    expect(corps(params(KLING, { estimatedDurationMs: 7000 })).corps).toEqual({ prompt: expect.any(String), image_url: URL_KF, duration: '10', negative_prompt: NEGATIF });
  });
  it('Veo 3.1 Fast · 8 s, 9:16 depuis le format du projet, 1080p, voix native (prise parlée)', () => {
    const p = params(VEO_FAST, { estimatedDurationMs: 7500, speechMode: 'lipsync' });
    const r = corps(p);
    expect(r.modele).toBe(VEO_FAST);
    expect(r.corps).toEqual({ prompt: p.consigne, image_url: URL_KF, duration: '8s', aspect_ratio: '9:16', resolution: '1080p', generate_audio: true, negative_prompt: NEGATIF });
    expect(r.limites).toContain('voix native · à valider à l’écoute');
  });
  it('Veo 3.1 Lite · 720p, 4 s, muet (voix off posée au montage) · generate_audio toujours explicite', () => {
    const r = corps(params(VEO_LITE));
    expect(r.corps).toEqual({ prompt: expect.any(String), image_url: URL_KF, duration: '4s', aspect_ratio: '9:16', resolution: '720p', generate_audio: false, negative_prompt: NEGATIF });
    expect(corpsFalVideo({ famille: 'veo', prompt: 'p', imageUrl: URL_KF, dureeS: 6, negatif: 'n' })).toMatchObject({ generate_audio: false });
  });
  it('le modèle DEVISÉ part, pas celui du worker · un instantané v1 n’est jamais envoyé à Veo', () => {
    expect(corps(params(VEO_LITE), KLING).modele).toBe(VEO_LITE);
    const { modele: _m, audio: _a, resolution: _r, ratio: _q, ...v1 } = params(KLING);
    const r = requeteFalAnimation({ operations: ops, parametres: { ...v1, schema: SCHEMA_PARAMETRES_CLIP_V1 }, source: source(), modele: VEO_FAST });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SCHEMA', motif: expect.stringMatching(/incompatible avec Veo 3\.1 Fast/) });
  });
  it('relecture · durée, voix, résolution, ratio hors du modèle ⇒ refus', () => {
    expect(lireParametresClip({ ...params(VEO_FAST), dureeS: 5 }).ok).toBe(false);
    expect(lireParametresClip({ ...params(KLING), audio: true }).ok).toBe(false);
    expect(lireParametresClip({ ...params(VEO_FAST), resolution: '4k' }).ok).toBe(false);
    expect(lireParametresClip({ ...params(VEO_FAST), ratio: '1:1' }).ok).toBe(false);
    expect(lireParametresClip({ ...params(KLING), ratio: '9:16' }).ok).toBe(false);
    expect(lireParametresClip({ ...params(KLING), modele: 'fal-ai/autre', dureeS: 10 }).ok).toBe(false);
  });
});

/* ── Réserve EXACTE · pour CHAQUE entrée, chaque durée, chaque résolution, avec et sans voix ── */
const cas: Array<{ m: string; d: number; r: ResolutionVideo; audio: boolean; prix: number }> = [];
for (const e of CATALOGUE_VIDEO) {
  for (const d of e.dureesS) {
    for (const [r, p] of Object.entries(e.prix) as Array<[ResolutionVideo, { muetUsdMicros: number; audioUsdMicros: number | null }]>) {
      cas.push({ m: e.endpoint, d, r, audio: false, prix: p.muetUsdMicros });
      if (p.audioUsdMicros !== null) cas.push({ m: e.endpoint, d, r, audio: true, prix: p.audioUsdMicros });
    }
  }
}
const paramsDe = (c: (typeof cas)[number]): ParametresClipSnapshot => {
  const veo = entreeCatalogueVideo(c.m)!.famille === 'veo';
  return { ...params(KLING), modele: c.m, dureeS: c.d, audio: c.audio, resolution: veo ? c.r : null, ratio: veo ? '9:16' : null };
};

describe('réserve du worker = prix catalogue × durée (× voix), pour chaque entrée', () => {
  it(`${cas.length} cas couverts, chaque entrée présente`, () => {
    expect(cas.length).toBe(2 + 12 + 12);
    expect(new Set(cas.map((c) => c.m))).toEqual(new Set(CATALOGUE_VIDEO.map((e) => e.endpoint)));
  });
  it.each(cas.map((c) => [`${c.m} · ${c.d} s · ${c.r} · ${c.audio ? 'voix' : 'muet'}`, c] as const))('%s', (_n, c) => {
    const p = paramsDe(c);
    expect(lireParametresClip(p).ok).toBe(true);
    const r = coutSoumissionStudio(ops, { parametres: p, modele: null });
    expect(r.ok, 'la réserve doit exister pour toute entrée du catalogue').toBe(true);
    if (!r.ok) return;
    expect(r.usdMicros, 'une entrée du catalogue réserve moins (ou plus) que son prix × durée').toBe(c.prix * c.d);
    expect(r.usdMicros).toBeGreaterThanOrEqual(c.prix * c.d);
    expect(r.poste).toBe('fal_video');
    expect(r.modele).toBe(c.m);
  });
  it('les cas lisibles · Kling 5 s 0,35 $ · Kling 10 s 0,70 $ · Veo Fast 8 s voix 1,20 $ · Veo Lite 4 s 720p muet 0,12 $', () => {
    expect(coutSoumissionStudio(ops, { parametres: params(KLING), modele: null })).toMatchObject({ usdMicros: 350_000 });
    expect(coutSoumissionStudio(ops, { parametres: params(KLING, { estimatedDurationMs: 7000 }), modele: null })).toMatchObject({ usdMicros: 700_000 });
    expect(coutSoumissionStudio(ops, { parametres: params(VEO_FAST, { estimatedDurationMs: 7500, speechMode: 'lipsync' }), modele: null })).toMatchObject({ usdMicros: 1_200_000 });
    expect(coutSoumissionStudio(ops, { parametres: params(VEO_LITE), modele: null })).toMatchObject({ usdMicros: 120_000 });
  });
  it('FIXED_COSTS.fal_video n’est plus que le repli d’un modèle hors catalogue (5 s, muet)', () => {
    const hors = { ...params(KLING), modele: 'fal-ai/autre/i2v' };
    expect(coutSoumissionStudio(ops, { parametres: hors, modele: null })).toMatchObject({ ok: true, usdMicros: Math.round(FIXED_COSTS.fal_video * 1e6), modele: 'fal-ai/autre/i2v' });
    expect(tarifDuClip(hors)).toMatchObject({ ok: true, tarif: { base: 'repli', unites: 1, credits: CREDIT_COSTS.video } });
    for (const c of cas) expect(tarifDuClip(paramsDe(c))).toMatchObject({ ok: true, tarif: { base: 'catalogue' } });
  });
  it('instantané v1 · le modèle du worker décide ; prix inconnu ⇒ rien réservé', () => {
    const { modele: _m, audio: _a, resolution: _r, ratio: _q, ...v1 } = params(KLING);
    const ancien = { ...v1, schema: SCHEMA_PARAMETRES_CLIP_V1 };
    expect(coutSoumissionStudio(ops, { parametres: ancien, modele: KLING })).toMatchObject({ ok: true, usdMicros: 350_000, modele: KLING });
    expect(coutSoumissionStudio(ops, { parametres: ancien, modele: VEO_FAST })).toMatchObject({ ok: false, motif: expect.stringMatching(/n’accepte que 4, 6, 8 s/) });
    expect(tarifClip({ modele: VEO_LITE, dureeS: 8, audio: false, resolution: '480p' as ResolutionVideo })).toMatchObject({ ok: false });
  });
});

describe('devis affiché = réserve · lignes par seconde, crédits au rapport d’aujourd’hui', () => {
  const devisDe = (p: ParametresClipSnapshot): LigneDevis[] => {
    const l = lignesDuDevis({ aRefaire: [{ id: 'clip:s1', nature: 'generation' }] } as never);
    if (!l.ok) throw new Error(l.motif);
    const t = lignesAvecTarifClip(l.lignes, p);
    if (!t.ok) throw new Error(t.motif);
    return t.lignes;
  };
  it.each(cas.map((c) => [`${c.m} · ${c.d} s · ${c.r} · ${c.audio ? 'voix' : 'muet'}`, c] as const))('%s', (_n, c) => {
    const p = paramsDe(c);
    const lignes = devisDe(p);
    const [clip] = lignes.filter((l) => l.profil === 'animation');
    const vue = vueLignesDevis(lignes).find((v) => v.libelle.startsWith('Animation'))!;
    const reserve = coutSoumissionStudio(ops, { parametres: p, modele: null });
    expect(reserve.ok && vue.usdMicros, 'le montant affiché au devis doit être la réserve du worker').toBe(reserve.ok && reserve.usdMicros);
    expect(clip).toMatchObject({ unites: c.d, usdMicros: c.prix, natureCout: 'estimation' });
    expect(clip!.credits).toBe(Math.ceil((c.prix * 200) / 350_000));
    expect(vue.credits).toBe(clip!.credits * c.d);
    expect(vue.libelle).toBe(`Animation · clip:s1 · ${c.d} s`);
    expect(clip!.motifEstimation).toMatch(/prix catalogue fal relevé le 16\/11\/2026/);
  });
  it('Kling 5 s = 200 crédits, comme aujourd’hui · Veo Fast 8 s voix = 688 crédits · Veo Lite 4 s 720p = 72', () => {
    const total = (p: ParametresClipSnapshot) => vueLignesDevis(devisDe(p)).filter((v) => v.libelle.startsWith('Animation')).map((v) => [v.credits, v.usdMicros]);
    expect(total(params(KLING))).toEqual([[200, 350_000]]);
    expect(total(params(VEO_FAST, { estimatedDurationMs: 7500, speechMode: 'lipsync' }))).toEqual([[688, 1_200_000]]);
    expect(total(params(VEO_LITE))).toEqual([[72, 120_000]]);
  });
  it('prix annoncé avant le devis (écran) = devis', () => {
    const c = contenu(plan({ estimatedDurationMs: 7500, speechMode: 'lipsync' }));
    expect(prixClipDuPlan({ contenu: c, shotId: 's1', modele: VEO_FAST })).toEqual({
      ok: true, modele: VEO_FAST, libelleModele: 'Veo 3.1 Fast', dureeS: 8, audio: true, credits: 688, usdMicros: 1_200_000,
      limites: ['voix native en français · français non confirmé officiellement · à valider à l’écoute'],
    });
  });
  it('approbation · un tarif qui ne vaut plus la ligne du devis ⇒ refus nommé, rien débité', () => {
    const p = params(VEO_FAST);
    const lignes = devisDe(p);
    expect(refusTarifClipChange(lignes, p)).toBeNull();
    expect(refusTarifClipChange(lignes, { ...p, dureeS: 8 })).toBe('Le modèle, la durée ou le prix du clip ont changé depuis ce devis · redemande un devis. Rien n’a été débité.');
    expect(refusTarifClipChange(lignes, { ...p, modele: VEO_LITE, resolution: '720p' })).toMatch(/ont changé depuis ce devis/);
    expect(refusTarifClipChange([], p)).toMatch(/n’a plus de tarif/);
  });
});

describe('voix native · refusée (clip muet, raison écrite) quand le modèle ne parle pas la langue du projet', () => {
  it('Kling + prise parlée en français ⇒ voix native refusée, raison écrite, clip muet (corps sans voix, prix muet)', () => {
    const r = parametresDuClip({ contenu: contenu(plan({ speechMode: 'lipsync' })), shotId: 's1', keyframe: { assetUuid: KF, sha256: SHA }, modele: KLING });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parametres.audio).toBe(false);
    expect(r.limites).toEqual(['Voix native en français refusée avec Kling 2.5 turbo pro · voix Kling en chinois et en anglais seulement, et ce modèle est muet chez fal · aucune voix utilisable en français · le clip part muet, la parole se pose au montage.']);
    expect(corps(r.parametres).corps).not.toHaveProperty('generate_audio');
    expect(prixClipDuPlan({ contenu: contenu(plan({ speechMode: 'lipsync' })), shotId: 's1', modele: KLING })).toMatchObject({ ok: true, audio: false, credits: 200, limites: [expect.stringMatching(/^Voix native en français refusée avec Kling/)] });
    expect(decisionAudioNatif({ entree: entreeCatalogueVideo(KLING), langue: 'fr', parole: 'lipsync' })).toEqual({ audio: false, refus: 'Voix native en français refusée avec Kling 2.5 turbo pro · voix Kling en chinois et en anglais seulement, et ce modèle est muet chez fal · aucune voix utilisable en français · le clip part muet, la parole se pose au montage.', limite: null });
  });
  it('voix off ou plan muet ⇒ clip muet, sans voix payée, quel que soit le modèle', () => {
    for (const m of [KLING, VEO_FAST, VEO_LITE]) {
      for (const parole of ['none', 'voiceover'] as const) expect(decisionAudioNatif({ entree: entreeCatalogueVideo(m), langue: 'fr', parole })).toEqual({ audio: false, refus: null, limite: null });
    }
  });
  it('Veo + français ⇒ voix permise, marquée « à valider à l’écoute » ; modèle hors catalogue ⇒ voix refusée', () => {
    expect(decisionAudioNatif({ entree: entreeCatalogueVideo(VEO_LITE), langue: 'fr', parole: 'lipsync' })).toMatchObject({ audio: true, refus: null, limite: expect.stringMatching(/à valider à l’écoute/) });
    expect(decisionAudioNatif({ entree: null, langue: 'fr', parole: 'lipsync' })).toMatchObject({ audio: false, refus: expect.stringMatching(/hors catalogue/) });
  });
  it('format · Veo refuse un projet carré ou 4:5 (raison écrite), Kling le déduit de l’image', () => {
    const carre = contenu(plan(), { formats: ['1:1'] });
    const r = parametresDuClip({ contenu: carre, shotId: 's1', keyframe: { assetUuid: KF, sha256: SHA }, modele: VEO_FAST });
    expect(r).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', motif: expect.stringMatching(/^Veo 3\.1 Fast ne produit qu’en 9:16 ou 16:9/) });
    expect(parametresDuClip({ contenu: carre, shotId: 's1', keyframe: { assetUuid: KF, sha256: SHA }, modele: KLING }).ok).toBe(true);
  });
});
