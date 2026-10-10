import { describe, it, expect } from 'vitest';
import {
  consigneMouvementDuPlan, parametresDuClip, lireParametresClip, requeteFalAnimation, planDeClip, empreinteParametresClip,
  coutSoumissionStudio, lireResultatFal, operationsMediaDuJob, decisionFournisseurStudio, fournisseurAnimationBranche,
  DUREE_CLIP_S, CONSIGNE_MOUVEMENT_MAX, MODELE_FAL_ANIMATION_DEFAUT, SCHEMA_PARAMETRES_CLIP, GRILLE_STUDIO,
  type ContenuVersion, type PlanStudio, type MediaResolu,
} from '../src';

/**
 * Animation d'un plan · règles pures. Le clip part de l'image clé VALIDE du
 * plan, la consigne de mouvement vient du plan, le corps fal suit
 * `falGenerateVideo` (image → vidéo), le coût réservé est le forfait vidéo de
 * la grille, et une image clé absente, remplacée ou modifiée bloque tout
 * avant le moindre envoi.
 */

const KF = '22222222-2222-4222-8222-222222222222';
const SHA = 'a'.repeat(64);
const plan = (o: Partial<PlanStudio> = {}): PlanStudio => ({
  shotId: 's1', purpose: 'Accroche', subject: 'Léa en veste jaune', action: 'se tourne vers la caméra et sourit', framing: 'plan rapproché',
  camera: 'travelling avant lent', lighting: 'lumière du matin', environment: 'salle de bain claire', referenceIds: [],
  narration: 'Tu en as marre des boutons ?', onScreenText: ['MARRE DES BOUTONS ?'], speechMode: 'voiceover', estimatedDurationMs: 4000, ...o,
});
const contenu = (p: PlanStudio = plan()): ContenuVersion => ({
  brief: null, productRef: null, styleRef: null, characterRefs: {}, shots: { order: [p.shotId], byId: { [p.shotId]: p } }, document: null, timeline: null,
} as unknown as ContenuVersion);
const ops = [{ operation: 'clip:s1', profil: 'animation' as const }];
const params = () => {
  const r = parametresDuClip({ contenu: contenu(), shotId: 's1', keyframe: { assetUuid: KF, sha256: SHA } });
  if (!r.ok) throw new Error(r.motif);
  return r.parametres;
};
const source = (o: Partial<Extract<MediaResolu, { etat: 'autorise' }>> = {}): MediaResolu => ({ assetId: `sta_${KF}`, etat: 'autorise', url: 'https://cdn.tiktrends.test/studio/kf.png', sha256: SHA, ...o });

describe('consigne de mouvement · dérivée du plan, sans texte écran', () => {
  it('mouvement, caméra et ce qui reste identique · aucune narration ni texte écran', () => {
    const c = consigneMouvementDuPlan(plan());
    expect(c).toContain('Mouvement : se tourne vers la caméra et sourit.');
    expect(c).toContain('Caméra : travelling avant lent.');
    expect(c).toContain('sujet Léa en veste jaune');
    expect(c).not.toContain('MARRE DES BOUTONS');
    expect(c).not.toContain('Tu en as marre');
    expect(c).toContain('aucun texte à l’écran');
  });
  it('bornée, espaces normalisés', () => {
    const long = 'x'.repeat(5_000);
    const c = consigneMouvementDuPlan(plan({ action: long, camera: long, subject: long, environment: long, lighting: long, framing: long }));
    expect(c.length).toBeLessThanOrEqual(CONSIGNE_MOUVEMENT_MAX);
    expect(consigneMouvementDuPlan(plan({ action: '  saute \n\n haut  ' }))).toContain('Mouvement : saute haut.');
  });
});

describe('paramètres d’un clip · construits par le serveur', () => {
  it('image clé valide ⇒ studio_clip/1, source sta_<uuid> et empreinte, durée de base', () => {
    const p = params();
    expect(p).toMatchObject({ schema: SCHEMA_PARAMETRES_CLIP, operation: 'clip:s1', shotId: 's1', source: { assetId: `sta_${KF}`, sha256: SHA }, dureeS: DUREE_CLIP_S });
    expect(lireParametresClip(p).ok).toBe(true);
    expect(empreinteParametresClip(p)).toMatch(/^[a-f0-9]{64}$/);
  });
  it('sans image clé ⇒ MISSING_REFERENCE nommé ; plan inconnu ⇒ NOT_FOUND', () => {
    expect(parametresDuClip({ contenu: contenu(), shotId: 's1', keyframe: null })).toMatchObject({ ok: false, code: 'MISSING_REFERENCE', motif: expect.stringMatching(/pas d’image clé valide/) });
    expect(parametresDuClip({ contenu: contenu(), shotId: 's9', keyframe: { assetUuid: KF, sha256: SHA } })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
  it('relecture défensive · durée autre que la base, source étrangère, emplacement non résolu ⇒ refus', () => {
    expect(lireParametresClip({ ...params(), dureeS: 10 }).ok).toBe(false);
    expect(lireParametresClip({ ...params(), source: { assetId: 'bib_x', sha256: SHA } }).ok).toBe(false);
    expect(lireParametresClip({ ...params(), consigne: 'Mouvement {{action}}' }).ok).toBe(false);
    expect(lireParametresClip({ ...params(), operation: 'clip:s2' }).ok).toBe(false);
  });
  it('planDeClip · clip:<plan> seulement, jamais le plan de l’image fixe', () => {
    expect(planDeClip('clip:s1')).toBe('s1');
    expect(planDeClip('keyframe:s1')).toBeNull();
    expect(planDeClip('clip:s_image')).toBeNull();
  });
});

describe('requête fal image → vidéo · rien ne part si un doute subsiste', () => {
  it('corps de falGenerateVideo · prompt, image_url, duration en texte, négatif ; expurgé sans adresse', () => {
    const r = requeteFalAnimation({ operations: ops, parametres: params(), source: source(), modele: MODELE_FAL_ANIMATION_DEFAUT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.modele).toBe('fal-ai/kling-video/v2.5-turbo/pro/image-to-video');
    expect(r.corps).toEqual({ prompt: params().consigne, image_url: 'https://cdn.tiktrends.test/studio/kf.png', duration: '5', negative_prompt: expect.stringContaining('texte incrusté') });
    expect(r.operations).toEqual(['clip:s1']);
    expect(JSON.stringify(r.expurge)).not.toContain('cdn.tiktrends.test');
  });
  it('image clé modifiée, absente, révoquée, en data URI ⇒ MISSING_REFERENCE, aucun corps', () => {
    for (const s of [source({ sha256: 'b'.repeat(64) }), null, { assetId: `sta_${KF}`, etat: 'absent' as const, motif: 'retirée' }, source({ url: 'data:image/png;base64,AAAA' })]) {
      const r = requeteFalAnimation({ operations: ops, parametres: params(), source: s, modele: MODELE_FAL_ANIMATION_DEFAUT });
      expect(r, JSON.stringify(s)).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' });
    }
  });
  it('mélange image + clip, ou deux clips ⇒ UNSUPPORTED_CAPABILITY', () => {
    expect(requeteFalAnimation({ operations: [...ops, { operation: 'keyframe:s1', profil: 'image_generation' }], parametres: params(), source: source(), modele: 'm' })).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY' });
    expect(requeteFalAnimation({ operations: [...ops, { operation: 'clip:s2', profil: 'animation' }], parametres: params(), source: source(), modele: 'm' })).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY' });
  });
});

describe('coût, résultat, fournisseur · le clip au forfait vidéo de la grille', () => {
  it('un clip ⇒ forfait animation de la grille, poste fal_video ; images ⇒ poste fal_image ; mélange refusé', () => {
    expect(coutSoumissionStudio(ops)).toEqual({ ok: true, usd: GRILLE_STUDIO.animation.usdMicros! / 1e6, usdMicros: GRILLE_STUDIO.animation.usdMicros, medias: 1, poste: 'fal_video' });
    expect(coutSoumissionStudio([{ operation: 'keyframe:s1', profil: 'image_generation' }])).toMatchObject({ ok: true, poste: 'fal_image', usdMicros: GRILLE_STUDIO.image_generation.usdMicros });
    expect(coutSoumissionStudio([...ops, { operation: 'keyframe:s1', profil: 'image_generation' }]).ok).toBe(false);
    expect(coutSoumissionStudio([...ops, { operation: 'clip:s2', profil: 'animation' }]).ok).toBe(false);
    expect(coutSoumissionStudio([{ operation: 'voix:s1', profil: 'speech' }]).ok).toBe(false);
  });
  it('sortie vidéo de fal (`video.url`) lue comme une sortie, rattachée au clip', () => {
    expect(lireResultatFal(200, { video: { url: 'https://v3.fal.media/files/x/clip.mp4', content_type: 'video/mp4' } })).toEqual({ etat: 'reussi', urls: ['https://v3.fal.media/files/x/clip.mp4'] });
    expect(lireResultatFal(200, {})).toMatchObject({ etat: 'echoue' });
    expect(operationsMediaDuJob([...ops, { operation: 'montage', profil: 'calcul' }])).toEqual(['clip:s1']);
  });
  it('branchée exactement comme le fournisseur studio · modèle d’animation lu dans FAL_VIDEO_MODEL_I2V', () => {
    const S3 = { S3_ENDPOINT: 'e', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'i', S3_SECRET_ACCESS_KEY: 's' };
    expect(fournisseurAnimationBranche({ NODE_ENV: 'production', FAL_KEY: 'cle', ...S3 })).toBe(true);
    expect(fournisseurAnimationBranche({ FAL_KEY: 'cle', ...S3 })).toBe(false);
    const d = decisionFournisseurStudio({ NODE_ENV: 'production', FAL_KEY: 'cle', FAL_VIDEO_MODEL_I2V: 'fal-ai/autre/i2v', ...S3 });
    expect(d.ok && d.modeles.animation).toBe('fal-ai/autre/i2v');
  });
});
