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

describe('réserve du worker = max(prix catalogue × durée (× voix), plancher), pour chaque entrée', () => {
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
    expect(r.usdMicros, 'une entrée du catalogue réserve moins que son prix × durée, ou sous le plancher sans facture rapprochée').toBe(Math.max(c.prix * c.d, 600_000));
    expect(r.usdMicros).toBeGreaterThanOrEqual(c.prix * c.d);
    expect(r.poste).toBe('fal_video');
    expect(r.modele).toBe(c.m);
  });
  it('les cas lisibles · réserve Kling 5 s 0,60 $ (plancher) · Kling 10 s 0,70 $ · Veo Fast 8 s voix 1,20 $ · Veo Lite 4 s 0,60 $ (plancher)', () => {
    expect(coutSoumissionStudio(ops, { parametres: params(KLING), modele: null })).toMatchObject({ usdMicros: 600_000 });
    expect(coutSoumissionStudio(ops, { parametres: params(KLING, { estimatedDurationMs: 7000 }), modele: null })).toMatchObject({ usdMicros: 700_000 });
    expect(coutSoumissionStudio(ops, { parametres: params(VEO_FAST, { estimatedDurationMs: 7500, speechMode: 'lipsync' }), modele: null })).toMatchObject({ usdMicros: 1_200_000 });
    expect(coutSoumissionStudio(ops, { parametres: params(VEO_LITE), modele: null })).toMatchObject({ usdMicros: 600_000 });
  });
  it('FIXED_COSTS.fal_video n’est plus que le plancher de réserve · un modèle hors catalogue ne réserve rien', () => {
    const hors = { ...params(KLING), modele: 'fal-ai/autre/i2v' };
    expect(coutSoumissionStudio(ops, { parametres: hors, modele: null })).toMatchObject({ ok: false });
    for (const c of cas) expect(tarifDuClip(paramsDe(c))).toMatchObject({ ok: true, tarif: { usdMicros: c.prix * c.d } });
  });
  it('instantané v1 · le modèle du worker décide ; prix inconnu ⇒ rien réservé', () => {
    const { modele: _m, audio: _a, resolution: _r, ratio: _q, ...v1 } = params(KLING);
    const ancien = { ...v1, schema: SCHEMA_PARAMETRES_CLIP_V1 };
    expect(coutSoumissionStudio(ops, { parametres: ancien, modele: KLING })).toMatchObject({ ok: true, usdMicros: 600_000, modele: KLING });
    expect(coutSoumissionStudio(ops, { parametres: ancien, modele: VEO_FAST })).toMatchObject({ ok: false, motif: expect.stringMatching(/n’accepte que 4, 6, 8 s/) });
    expect(tarifClip({ modele: VEO_LITE, dureeS: 8, audio: false, resolution: '480p' as ResolutionVideo })).toMatchObject({ ok: false });
  });
});

describe('devis affiché = estimation catalogue · lignes par seconde, crédits au rapport d’aujourd’hui · réserve jamais en dessous', () => {
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
    expect(vue.usdMicros, 'le devis affiche l’estimation catalogue prix × durée').toBe(c.prix * c.d);
    expect(reserve.ok && reserve.usdMicros >= vue.usdMicros, 'la réserve du worker ne descend jamais sous le devis').toBe(true);
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
    expect(refusTarifClipChange(lignes, { ...p, dureeS: 8 })).toBe('Le modèle, la durée, la voix ou le format du clip ont changé depuis ce devis · redemande un devis. Rien n’a été débité.');
    expect(refusTarifClipChange(lignes, { ...p, modele: VEO_LITE, resolution: '720p' })).toMatch(/ont changé depuis ce devis/);
    expect(refusTarifClipChange([], p)).toMatch(/n’a plus de tarif/);
    // Le tarif change seul (catalogue redéployé), le choix figé est intact ⇒ refus tarif.
    const autrePrix = lignes.map((l) => (l.profil === 'animation' ? { ...l, usdMicros: l.usdMicros + 1 } : l));
    expect(refusTarifClipChange(autrePrix, p)).toBe('Le modèle, la durée ou le prix du clip ont changé depuis ce devis · redemande un devis. Rien n’a été débité.');
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

/* ═══════════════ Relecture #1099 · points 1 à 6 ═══════════════ */
import { FACTURES_FAL_RAPPROCHEES, PLANCHER_RESERVE_CLIP_USD_MICROS, reserveClipUsdMicros, MOTIF_HORS_CATALOGUE, MESSAGE_DEVIS_AVANT_CATALOGUE, avertissementModeleVideoStudio, gestesPlan } from '../src';

const devisClip = (p: ParametresClipSnapshot): LigneDevis[] => {
  const l = lignesDuDevis({ aRefaire: [{ id: 'clip:s1', nature: 'generation' }] } as never);
  if (!l.ok) throw new Error(l.motif);
  const t = lignesAvecTarifClip(l.lignes, p);
  if (!t.ok) throw new Error(t.motif);
  return t.lignes;
};

describe('#1099 · 1 · ce qui partira est figé AU DEVIS, comparé à l’approbation même à tarif égal', () => {
  it('la ligne du clip porte le modèle, la durée, la voix, la résolution et le ratio devisés', () => {
    const [clip] = devisClip(params(VEO_FAST)).filter((l) => l.profil === 'animation');
    expect((clip as LigneDevis & { clip?: unknown }).clip).toEqual({ modele: VEO_FAST, dureeS: 4, audio: false, resolution: '1080p', ratio: '9:16' });
  });
  it('même tarif, autre résolution (Veo Fast 720p = 1080p) ⇒ refus', () => {
    const p = params(VEO_FAST);
    expect(refusTarifClipChange(devisClip(p), { ...p, resolution: '720p' })).toBe('Le modèle, la durée, la voix ou le format du clip ont changé depuis ce devis · redemande un devis. Rien n’a été débité.');
  });
  it('mêmes montants, autre modèle ⇒ refus', () => {
    const p = params(VEO_FAST);
    const lignes = devisClip(p).map((l) => (l.profil === 'animation' ? { ...l, clip: { ...(l as LigneDevis & { clip: Record<string, unknown> }).clip, modele: 'fal-ai/veo3.1/fast/autre' } } : l));
    expect(refusTarifClipChange(lignes, p)).toMatch(/ont changé depuis ce devis/);
  });
  it('devis d’avant le catalogue (ligne sans choix du clip) ⇒ message propre', () => {
    const p = params(KLING);
    const lignes = devisClip(p).map((l) => { const { clip: _c, ...reste } = l as LigneDevis & { clip?: unknown }; return reste as LigneDevis; });
    expect(refusTarifClipChange(lignes, p)).toBe(MESSAGE_DEVIS_AVANT_CATALOGUE);
    expect(MESSAGE_DEVIS_AVANT_CATALOGUE).toBe('Ce devis date d’avant le catalogue vidéo · redemande un devis. Rien n’a été débité.');
  });
});

describe('#1099 · 2 · un modèle Studios hors catalogue est REFUSÉ au devis, jamais au forfait', () => {
  it('devis, écran et tarif refusent, raison écrite', () => {
    const r = parametresDuClip({ contenu: contenu(), shotId: 's1', keyframe: { assetUuid: KF, sha256: SHA }, modele: 'fal-ai/autre/i2v' });
    expect(r).toEqual({ ok: false, code: 'UNSUPPORTED_CAPABILITY', motif: `${MOTIF_HORS_CATALOGUE} (fal-ai/autre/i2v).` });
    expect(MOTIF_HORS_CATALOGUE).toBe('Modèle vidéo non chiffré au catalogue · ajoute-le au catalogue avec son prix avant de l’utiliser');
    expect(prixClipDuPlan({ contenu: contenu(), shotId: 's1', modele: 'fal-ai/autre/i2v' })).toMatchObject({ ok: false, raison: expect.stringContaining('non chiffré au catalogue') });
    expect(tarifClip({ modele: 'fal-ai/autre/i2v', dureeS: 5, audio: false, resolution: null }).ok).toBe(false);
    expect(lireParametresClip({ ...params(KLING), modele: 'fal-ai/autre/i2v' }).ok).toBe(false);
  });
});

describe('#1099 · 3 · bascule I2V → STUDIO dite au démarrage ; instantanés studio_clip/1 en file', () => {
  it('avertissement seulement si I2V est posée et STUDIO absente', () => {
    expect(avertissementModeleVideoStudio({ FAL_VIDEO_MODEL_I2V: 'fal-ai/kling-video/v2/master/image-to-video' })).toBe('FAL_VIDEO_MODEL_I2V est posée mais les Studios utilisent désormais FAL_VIDEO_MODEL_STUDIO · défaut Kling 2.5 turbo (fal-ai/kling-video/v2.5-turbo/pro/image-to-video). FAL_VIDEO_MODEL_I2V ne pilote plus que l’ancien « Vidéo IA ».');
    expect(avertissementModeleVideoStudio({ FAL_VIDEO_MODEL_I2V: 'x', FAL_VIDEO_MODEL_STUDIO: VEO_LITE })).toBeNull();
    expect(avertissementModeleVideoStudio({})).toBeNull();
  });
  it('studio_clip/1 · Kling ⇒ corps Kling 5 s et réserve = prix du devis de main (0,60 $) ; Veo ou hors catalogue ⇒ refus avant envoi', () => {
    const { modele: _m, audio: _a, resolution: _r, ratio: _q, ...v1 } = params(KLING);
    const ancien = { ...v1, schema: SCHEMA_PARAMETRES_CLIP_V1 };
    expect(coutSoumissionStudio(ops, { parametres: ancien, modele: KLING })).toMatchObject({ ok: true, usdMicros: 600_000, modele: KLING });
    expect(requeteFalAnimation({ operations: ops, parametres: ancien, source: source(), modele: KLING })).toMatchObject({ ok: true, corps: { duration: '5' } });
    expect(requeteFalAnimation({ operations: ops, parametres: ancien, source: source(), modele: 'fal-ai/autre/i2v' })).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect(coutSoumissionStudio(ops, { parametres: ancien, modele: 'fal-ai/autre/i2v' }).ok).toBe(false);
  });
});

describe('#1099 · 4 · réserve jamais sous l’ancien forfait tant qu’aucune facture fal n’est rapprochée', () => {
  it('aucune facture rapprochée aujourd’hui · plancher = FIXED_COSTS.fal_video', () => {
    expect(FACTURES_FAL_RAPPROCHEES).toEqual({});
    expect(PLANCHER_RESERVE_CLIP_USD_MICROS).toBe(Math.round(FIXED_COSTS.fal_video * 1e6));
  });
  it.each([
    ['Kling 5 s', params(KLING), 350_000, 600_000],
    ['Kling 10 s', params(KLING, { estimatedDurationMs: 7000 }), 700_000, 700_000],
    ['Veo Fast 8 s voix', params(VEO_FAST, { estimatedDurationMs: 7500, speechMode: 'lipsync' }), 1_200_000, 1_200_000],
    ['Veo Lite 4 s', params(VEO_LITE), 120_000, 600_000],
  ] as const)('%s · devis %i µ$ (estimation) · réserve %i µ$', (_n, p, devis, reserve) => {
    const vue = vueLignesDevis(devisClip(p)).find((v) => v.libelle.startsWith('Animation'))!;
    expect(vue.usdMicros).toBe(devis);
    expect(coutSoumissionStudio(ops, { parametres: p, modele: null })).toMatchObject({ ok: true, usdMicros: reserve });
  });
  it('une facture rapprochée pour un modèle ⇒ sa réserve descend au prix catalogue, les autres non', () => {
    const t = tarifDuClip(params(KLING));
    if (!t.ok) throw new Error(t.motif);
    expect(reserveClipUsdMicros(entreeCatalogueVideo(KLING)!, t.tarif, { 'kling-2.5-turbo-pro': 'facture fal de test' })).toBe(350_000);
    expect(reserveClipUsdMicros(entreeCatalogueVideo(KLING)!, t.tarif, {})).toBe(600_000);
  });
});

describe('#1099 · 5 · un levier de clip fermé n’affiche aucun prix', () => {
  it('refus (Veo et format carré) ⇒ prix vide sur « Devis du clip animé » et « Animer le plan »', () => {
    const d = { disponible: true, raison: '' };
    const g = gestesPlan({
      disponibilite: { consigne: d, montage: d, devis: d, lancement: d, animation: d },
      keyframe: { etat: 'valide', consigneEnAttente: false, consigneRetenue: null, devisCredits: null },
      clip: { keyframePrete: true, devisCredits: null }, prixImageCredits: 40, coutTexte: '≈ 0,02 $',
      prixClip: { credits: 0, dureeS: 0, refus: 'Veo 3.1 Fast ne produit qu’en 9:16 ou 16:9' },
    });
    for (const cle of ['devis-clip', 'lancer-clip']) expect(g.find((x) => x.cle === cle)).toMatchObject({ actif: false, prix: '' });
  });
});

describe('voix native · API pour le son (#1101) · modeleRendLaVoix = decisionAudioNatif(…, lipsync).audio', () => {
  it('Kling ne rend aucune voix française ; Veo rend la voix (à valider à l’écoute) ; hors catalogue ⇒ non', async () => {
    const { modeleRendLaVoix } = await import('../src');
    expect(modeleRendLaVoix(entreeCatalogueVideo(KLING), 'fr')).toBe(false);
    expect(modeleRendLaVoix(entreeCatalogueVideo(KLING), 'en')).toBe(false);
    expect(modeleRendLaVoix(entreeCatalogueVideo(VEO_FAST), 'fr')).toBe(true);
    expect(modeleRendLaVoix(entreeCatalogueVideo(VEO_LITE), 'fr')).toBe(true);
    expect(modeleRendLaVoix(null, 'fr')).toBe(false);
    for (const e of CATALOGUE_VIDEO) for (const l of ['fr', 'en', 'zh']) expect(modeleRendLaVoix(e, l)).toBe(decisionAudioNatif({ entree: e, langue: l, parole: 'lipsync' }).audio);
  });
});
