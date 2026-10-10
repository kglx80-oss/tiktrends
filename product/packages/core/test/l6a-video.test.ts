import { describe, it, expect } from 'vitest';
import {
  plansDepuisStoryboard, lirePlanSaisi, dureeNarrationMs, idsPlansAlloues, MOTS_PAR_SECONDE_NARRATION,
  timelineDesPlans, segmentsPlans, surimpressions, TIMEBASE_VIDEO, PISTES_VIDEO,
  appliquerOperationVideo, lireOperationVideo, changementsVideo, CHEMINS_VIDEO, estSansTexte,
  impactVideo, empreintesKeyframes, sortiesValides,
  construireConsignePlan, lireConsignePlan, consigneDuPlan, changementsConsignePlan, verdictConsignePlan, entreesConsignePlan,
  exigencePlansDuDevis, parametresDesPlans, empreinteConsignesDevis, preparerShotImage, planDeKeyframe, formatVideo, INTERDIT_TEXTE_IMAGE_CLE,
  disponibiliteVideo, entreeStoryboard, LIBELLE_ANIMATION_INDISPONIBLE,
  type ConsignePlanPersistee, type OperationVideo,
} from '../src/studios/video';
import { calculerPlanImpact, generationsDuPlan, grapheImpact } from '../src/studios/impact';
import { appliquerPatch } from '../src/studios/patch';
import { validerContenuVersion, type ContenuVersion, type PlanStudio } from '../src/studios/document';
import { lireParametresImage } from '../src/studios/fournisseurs/fal-image';
import { copie } from './studios-fixtures';

/**
 * L6-A · noyau vidéo · chaque exigence lue sur un RÉSULTAT : plans et champs,
 * ticks de la timeline, empreintes des images clés, plan d'impact, patch
 * rejoué par `appliquerPatch`.
 */

const SHA = 'a'.repeat(64);

function plan(shotId: string, o: Partial<PlanStudio> = {}): PlanStudio {
  return {
    shotId, purpose: 'Accroche', subject: 'Léa dans sa salle de bain', action: 'regarde son reflet', framing: 'plan rapproché', camera: 'fixe',
    lighting: 'lumière du matin', environment: 'salle de bain claire', referenceIds: ['c_lea'], narration: '', onScreenText: [], speechMode: 'none',
    estimatedDurationMs: 3000, ...o,
  };
}

/** Trois plans · Léa sur 1 et 2, le produit sur 3 ; voix off sur 1 et 2, texte écran sur 1. */
function video(): ContenuVersion {
  const c: ContenuVersion = {
    brief: { formats: ['9:16'] },
    productRef: { productId: 'p_serum', assetId: 'a_serum' },
    styleRef: { palette: ['#ffffff'] },
    characterRefs: { c_lea: { tenue: 'veste jaune', cheveux: 'carré brun' } },
    shots: {
      order: ['s1', 's2', 's3'],
      byId: {
        s1: plan('s1', { narration: 'Tu en as marre des boutons ?', speechMode: 'voiceover', onScreenText: ['Marre des boutons ?'] }),
        s2: plan('s2', { purpose: 'Problème', action: 'touche sa joue', narration: 'Chaque matin, la même déception.', speechMode: 'voiceover' }),
        s3: plan('s3', { purpose: 'Appel à l’action', subject: 'le flacon de sérum', action: 'tourne lentement', referenceIds: ['p_serum'] }),
      },
    },
    document: null,
    timeline: null,
  };
  return { ...c, timeline: { ...timelineDesPlans(c, null), voice: { voiceId: 'v_claire' }, music: { assetId: 'a_musique', gainDb: -12 } } };
}

const appliquer = (c: ContenuVersion, op: OperationVideo, o = {}) => {
  const r = appliquerOperationVideo(c, op, o);
  if (!r.ok) throw new Error(`${r.code} ${r.message} ${JSON.stringify(r.violations)}`);
  return r;
};
const ids = (p: ReturnType<typeof calculerPlanImpact>) => p.aRefaire.map((n) => n.id);

describe('VIDEO-01 · du brief aux plans · champs distincts', () => {
  const sortie = {
    status: 'ready', questions: [], warnings: [], evidenceIds: [],
    result: {
      shots: [
        { shotId: 's1', purpose: 'Accroche', subject: 'Léa face au miroir', action: 'soupire', framing: 'plan rapproché', camera: 'travelling avant lent', lighting: 'matin', environment: 'salle de bain', referenceIds: ['c_lea'], narration: 'Encore un bouton ?', onScreenText: ['Marre des boutons ?'], speechMode: 'voiceover', estimatedDurationMs: 2500 },
        { shotId: 's2', purpose: 'Appel à l’action', subject: 'le flacon', action: 'est posé sur le lavabo', framing: 'gros plan', camera: 'fixe', lighting: 'matin', environment: 'lavabo', referenceIds: ['p_serum'], narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 2000 },
      ],
      estimatedTotalMs: 4500, durationCaveat: 'Durées estimées tant que la voix réelle manque.',
    },
  };
  const permis = new Set(['c_lea', 'p_serum']);

  it('deux plans, chaque dimension dans son champ, durée totale cohérente', () => {
    const r = plansDepuisStoryboard(sortie, { idsAlloues: ['s1', 's2'], referencesPermises: permis, sansTexte: false });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.plans.map((p) => p.shotId)).toEqual(['s1', 's2']);
    expect(r.plans[0]).toMatchObject({ subject: 'Léa face au miroir', action: 'soupire', camera: 'travelling avant lent', narration: 'Encore un bouton ?', onScreenText: ['Marre des boutons ?'], estimatedDurationMs: 2500 });
    // Distincts : la narration n'est ni dans le sujet, ni dans le texte écran, ni dans l'action.
    expect(r.plans[0]!.subject).not.toContain(r.plans[0]!.narration);
    expect(r.plans[0]!.onScreenText).not.toContain(r.plans[0]!.narration);
    expect(r.totalMs).toBe(4500);
    const c = appliquer({ ...video(), shots: { order: [], byId: {} }, timeline: null }, { type: 'scenario', plans: r.plans });
    expect(validerContenuVersion(c.contenu)).toEqual([]);
    expect(Object.keys(c.contenu.shots.byId)).toEqual(['s1', 's2']);
    expect(c.contenu.timeline!.durationTicks).toBe(4500 * 1000);
  });

  it('identifiant non alloué, sujet vide, texte en mode sans texte, narration sans voix · refusés', () => {
    const mauvais = copie(sortie);
    mauvais.result.shots[0]!.shotId = 's_invente';
    expect(plansDepuisStoryboard(mauvais, { idsAlloues: ['s1', 's2'], referencesPermises: permis, sansTexte: false })).toMatchObject({ ok: false, cause: 'invalide', violations: [{ chemin: '/result/shots/0/shotId' }] });
    const vide = copie(sortie);
    vide.result.shots[1]!.subject = ' ';
    expect(plansDepuisStoryboard(vide, { idsAlloues: ['s1', 's2'], referencesPermises: permis, sansTexte: false })).toMatchObject({ ok: false, violations: [{ chemin: '/result/shots/1/subject' }] });
    expect(plansDepuisStoryboard(sortie, { idsAlloues: ['s1', 's2'], referencesPermises: permis, sansTexte: true })).toMatchObject({ ok: false, violations: [{ chemin: '/result/shots/0/onScreenText' }] });
    const muet = copie(sortie);
    muet.result.shots[0]!.speechMode = 'none';
    expect(plansDepuisStoryboard(muet, { idsAlloues: ['s1', 's2'], referencesPermises: permis, sansTexte: false })).toMatchObject({ ok: false, violations: [{ chemin: '/result/shots/0/narration' }] });
    const intrus = copie(sortie);
    intrus.result.shots[0]!.referenceIds = ['c_inconnu'];
    expect(plansDepuisStoryboard(intrus, { idsAlloues: ['s1', 's2'], referencesPermises: permis, sansTexte: false })).toMatchObject({ ok: false, violations: [{ chemin: '/result/shots/0/referenceIds' }] });
  });

  it('sortie bloquée · les questions, aucun plan', () => {
    expect(plansDepuisStoryboard({ status: 'blocked', questions: ['Quelle durée ?'], result: null }, { idsAlloues: ['s1'], referencesPermises: permis, sansTexte: false })).toEqual({ ok: false, cause: 'questions', questions: ['Quelle durée ?'] });
  });

  it('saisie manuelle · même règle, identifiants jamais réutilisés', () => {
    expect(lirePlanSaisi({ subject: 'x', action: 'y', camera: 'z', estimatedDurationMs: 500 }, 's1', permis)).toMatchObject({ ok: false, violations: [{ chemin: '/shots/byId/s1/estimatedDurationMs' }] });
    expect(idsPlansAlloues(['s1', 's3'], 3)).toEqual(['s2', 's4', 's5']);
  });

  it('entrée de storyboard.plan · brief résolu, identifiants alloués par le serveur', () => {
    const brief = { objective: 'Faire acheter', audience: 'peaux mixtes', hypothesisId: null, testedVariable: 'hook', facts: [], invariants: ['flacon visible'], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: ['9:16'], exclusions: [] };
    const e = entreeStoryboard({ brief, versionId: 'v1', contenu: video(), nbPlans: 2, dureeCibleMs: 8000, speechMode: 'voiceover' });
    expect(e.taskInputs).toEqual({ briefId: 'brief_v1', targetDurationMs: 8000, shotCount: 2, speechMode: 'voiceover' });
    expect(e.idsAlloues).toEqual(['s4', 's5']);
    expect(e.allocatedIds).toEqual([{ id: 's4', entityType: 'shot', ordinal: 0 }, { id: 's5', entityType: 'shot', ordinal: 1 }]);
    expect(e.resolvedDocuments.map((d) => d.id)).toEqual(['brief_v1', 'c_lea', 'p_serum']);
  });
});

describe('timeline · unités entières, recalée sur l’ordre et les durées', () => {
  it('segments en microsecondes, pistes posées, musique hors pistes', () => {
    const c = video();
    const t = c.timeline!;
    expect(t.timebase).toBe(TIMEBASE_VIDEO);
    expect(t.durationTicks).toBe(9_000_000);
    expect(Object.values(t.tracks[PISTES_VIDEO.video]!.items).map((i) => [i.source.shotId, i.startTicks, i.outTicks])).toEqual([['s1', 0, 3_000_000], ['s2', 3_000_000, 3_000_000], ['s3', 6_000_000, 3_000_000]]);
    expect(Object.keys(t.tracks[PISTES_VIDEO.voix]!.items)).toEqual(['a_s1', 'a_s2']);
    expect(Object.keys(t.tracks[PISTES_VIDEO.texte]!.items)).toEqual(['x_s1']);
    expect(Object.values(t.tracks).some((p) => JSON.stringify(p).includes('a_musique'))).toBe(false);
    expect(validerContenuVersion(c)).toEqual([]);
  });
});

describe('VIDEO-08 · permuter les plans 2 et 1 · montage recalé, aucune image ni animation', () => {
  it('rien de généré, empreintes des images clés identiques, positions recalées', () => {
    const a = video();
    const r = appliquer(a, { type: 'ordre', ordre: ['s2', 's1', 's3'] });
    const p = calculerPlanImpact(a, r.contenu);
    expect(generationsDuPlan(p), 'réordonner a déclenché une génération').toEqual([]);
    expect(ids(p)).toEqual(['montage', 'mix', 'sous_titres', 'export']);
    expect(empreintesKeyframes(r.contenu)).toEqual(empreintesKeyframes(a));
    expect(segmentsPlans(r.contenu).map((s) => [s.shotId, s.debutMs])).toEqual([['s2', 0], ['s1', 3000], ['s3', 6000]]);
    expect(r.changes.map((x) => x.path)).toEqual(['/shots/order', '/timeline']);
    const i = impactVideo(a, r.contenu);
    expect(i.aucuneGeneration).toBe(true);
    expect(i.resume).toBe('Aucune image, animation ni voix à refaire · seuls montage, mix audio, sous-titres, export sont recalculés, sans fournisseur payant.');
  });

  it('un ordre qui oublie ou invente un plan est refusé', () => {
    expect(appliquerOperationVideo(video(), { type: 'ordre', ordre: ['s2', 's1'] })).toMatchObject({ ok: false, code: 'VALEUR_INVALIDE' });
    expect(appliquerOperationVideo(video(), { type: 'ordre', ordre: ['s2', 's1', 's9'] })).toMatchObject({ ok: false, code: 'VALEUR_INVALIDE' });
  });
});

describe('VIDEO-05 · narration du plan 2 · images clés identiques, durées recalculées et dites', () => {
  it('voix du plan 2 à refaire, images clés identiques par empreinte, durée du plan et totale recalculées', () => {
    const a = video();
    const texte = 'Chaque matin, devant le miroir, la même déception, et ce bouton qui revient toujours au même endroit.';
    const r = appliquer(a, { type: 'narration', shotId: 's2', narration: texte });
    expect(empreintesKeyframes(r.contenu)).toEqual(empreintesKeyframes(a));
    const attendu = Math.ceil((17 / MOTS_PAR_SECONDE_NARRATION) * 10) * 100;
    expect(dureeNarrationMs(texte)).toBe(attendu);
    expect(r.contenu.shots.byId.s2!.estimatedDurationMs).toBe(attendu);
    expect(r.durees).toMatchObject({ avantMs: 9000, apresMs: 6000 + attendu });
    expect(r.durees.phrase).toBe(`Durée totale 9,0 s → ${((6000 + attendu) / 1000).toFixed(1).replace('.', ',')} s (plan 2 : 3,0 s → ${(attendu / 1000).toFixed(1).replace('.', ',')} s).`);
    const gen = generationsDuPlan(calculerPlanImpact(a, r.contenu));
    expect(gen).toContain('voix:s2');
    expect(gen.filter((g) => g.startsWith('keyframe:'))).toEqual([]);
    expect(gen).not.toContain('voix:s1');
  });

  it('couper la narration · plus de voix pour ce plan, durée conservée et dite', () => {
    const r = appliquer(video(), { type: 'narration', shotId: 's2', narration: '' });
    expect(r.contenu.shots.byId.s2!.estimatedDurationMs).toBe(3000);
    expect(r.signalements).toEqual(['Plan 2 : plus de narration à dire · durée du plan conservée (3,0 s).']);
    expect(Object.keys(r.contenu.timeline!.tracks[PISTES_VIDEO.voix]!.items)).toEqual(['a_s1']);
  });

  it('une prise déjà mesurée ne vaut plus pour un autre texte · durée réelle effacée', () => {
    const a = video();
    a.shots.byId.s2!.actualDurationMs = 3400;
    const r = appliquer(a, { type: 'narration', shotId: 's2', narration: 'Un autre texte.' });
    expect(r.contenu.shots.byId.s2!.actualDurationMs).toBeNull();
  });
});

describe('VIDEO-10 · musique seule · voix, images clés et clips identiques, mix et export seuls', () => {
  it('piste et gain', () => {
    const a = video();
    const r = appliquer(a, { type: 'musique', musique: { assetId: 'a_musique_2', gainDb: -6 } });
    const p = calculerPlanImpact(a, r.contenu);
    expect(ids(p)).toEqual(['mix', 'export']);
    for (const n of ['keyframe:s1', 'keyframe:s2', 'keyframe:s3', 'clip:s1', 'clip:s2', 'clip:s3', 'voix:s1', 'voix:s2', 'montage']) expect(p.reutilisees, n).toContain(n);
    expect(r.changes).toEqual([{ op: 'replace', path: '/timeline', newValue: r.contenu.timeline, reason: 'Musique · gain -6 dB' }]);
  });

  it('gain hors bornes refusé', () => {
    expect(appliquerOperationVideo(video(), { type: 'musique', musique: { assetId: 'a_musique', gainDb: 12 } })).toMatchObject({ ok: false, code: 'VALEUR_INVALIDE' });
  });
});

describe('VIDEO-09 · sans texte · aucun overlay, texte incrusté éventuel signalé', () => {
  it('texte écran vidé, sous-titres coupés, aucune piste de surimpression, aucune génération', () => {
    const a = video();
    expect(surimpressions(a.timeline).length).toBeGreaterThan(0);
    const r = appliquer(a, { type: 'sans_texte' }, { sortiesExistantes: ['keyframe:s1', 'keyframe:s3'] });
    expect(Object.values(r.contenu.shots.byId).map((p) => p.onScreenText)).toEqual([[], [], []]);
    expect(r.contenu.timeline!.subtitles).toEqual({ enabled: false });
    expect(surimpressions(r.contenu.timeline)).toEqual([]);
    expect(estSansTexte(r.contenu)).toBe(true);
    expect(generationsDuPlan(calculerPlanImpact(a, r.contenu))).toEqual([]);
    expect(r.signalements).toEqual([
      'Plan 1 : l’image déjà produite peut contenir du texte incrusté · contrôle-la. Il ne sera pas retiré sans retouche ou nouvelle image.',
      'Plan 3 : l’image déjà produite peut contenir du texte incrusté · contrôle-la. Il ne sera pas retiré sans retouche ou nouvelle image.',
    ]);
    // La voix reste : la narration n'est pas du texte écran.
    expect(Object.keys(r.contenu.timeline!.tracks[PISTES_VIDEO.voix]!.items)).toEqual(['a_s1', 'a_s2']);
  });

  it('les consignes d’images clés interdisent le texte dans les pixels', () => {
    expect(INTERDIT_TEXTE_IMAGE_CLE).toMatch(/Aucun texte/);
  });
});

describe('VIDEO-03 · tenue changée sur les plans 1 et 2 · images et clips liés obsolètes, audio préservé', () => {
  it('le graphe ne touche que les plans qui citent la fiche', () => {
    const a = video();
    const b = copie(a);
    b.characterRefs.c_lea = { tenue: 'veste verte', cheveux: 'carré brun' };
    const p = calculerPlanImpact(a, b);
    expect(generationsDuPlan(p).sort()).toEqual(['clip:s1', 'clip:s2', 'identite:c_lea', 'keyframe:s1', 'keyframe:s2']);
    for (const r of ['keyframe:s3', 'clip:s3', 'voix:s1', 'voix:s2']) expect(p.reutilisees, r).toContain(r);
    const i = impactVideo(a, b, { mediasExistants: ['keyframe:s1', 'keyframe:s2', 'keyframe:s3', 'voix:s1'] });
    expect(i.mediasObsoletes.map((l) => l.libelle)).toEqual(['Image clé · plan 1', 'Image clé · plan 2']);
    expect(i.mediasConserves.map((l) => l.id)).toEqual(['keyframe:s3', 'voix:s1']);
  });
});

/* ──────────────────────────── Consignes des plans ─────────────────────────── */

function consigne(c: ContenuVersion, shotId: string, o: Partial<{ runId: string; instruction: string }> = {}): ConsignePlanPersistee {
  const r = construireConsignePlan({
    runId: o.runId ?? `run-${shotId}`, shotId, sourceVersionId: 'v1', entrees: entreesConsignePlan(c, shotId)!,
    resultat: { generationInstruction: o.instruction ?? 'Léa en veste jaune devant le miroir, lumière du matin.', referenceBindings: [], protectedComponents: [] },
    references: [], composantsProteges: [], surimpression: false, largeur: 1080, hauteur: 1920, compileeLe: new Date('2026-10-08T10:00:00Z'),
  });
  if (!r.ok) throw new Error(r.violations.join(' · '));
  return r.consigne;
}
function retenir(c: ContenuVersion, k: ConsignePlanPersistee): ContenuVersion {
  const r = appliquerPatch(c, changementsConsignePlan(c, k, 'consigne'), ['/styleRef']);
  if (!r.ok) throw new Error(JSON.stringify(r.violations));
  return r.resultat;
}

describe('consigne `shot.image` d’un plan · rangée par plan, attestée, jamais `{}`', () => {
  it('retenir la consigne du plan 1 ne touche que le plan 1', () => {
    const a = video();
    const b = retenir(a, consigne(a, 's1'));
    expect(validerContenuVersion(b)).toEqual([]);
    // Son image clé, et l'animation qui en part · rien des plans 2 et 3.
    expect(generationsDuPlan(calculerPlanImpact(a, b)).sort()).toEqual(['clip:s1', 'keyframe:s1']);
    expect(consigneDuPlan(b, 's1')?.shotId).toBe('s1');
    expect(consigneDuPlan(b, 's2')).toBeNull();
    // Retenir la consigne ne périme pas la consigne elle-même.
    expect(entreesConsignePlan(b, 's1')).toBe(entreesConsignePlan(a, 's1'));
  });

  it('forme relue · interdit de texte posé par le serveur, paramètres studio_image/1 valides', () => {
    const k = consigne(video(), 's2');
    expect(lireConsignePlan(JSON.parse(JSON.stringify(k)))).toEqual(k);
    expect(lireConsignePlan({ ...k, extra: 1 })).toBeNull();
    expect(k.consigne.negativeConstraints).toEqual([INTERDIT_TEXTE_IMAGE_CLE]);
    const p = parametresDesPlans([k]);
    expect(p.ok && lireParametresImage(p.parametres).ok).toBe(true);
    expect(p.ok && p.parametres).toMatchObject({ schema: 'studio_image/1', promptRunId: 'run-s2', format: { largeur: 1080, hauteur: 1920 } });
  });

  it('une liaison vers une référence non transmise, un composant non protégé · refusés', () => {
    const c = video();
    const base = { runId: 'r', shotId: 's3', sourceVersionId: 'v', entrees: entreesConsignePlan(c, 's3')!, surimpression: false, largeur: 1080, hauteur: 1920, compileeLe: new Date() };
    expect(construireConsignePlan({ ...base, resultat: { generationInstruction: 'x', referenceBindings: [{ referenceId: 'pph_x', role: 'product', scope: 'product' }], protectedComponents: [] }, references: [], composantsProteges: [] }))
      .toEqual({ ok: false, violations: ['liaison pph_x : référence non transmise à la compilation'] });
    expect(construireConsignePlan({ ...base, resultat: { generationInstruction: 'x', referenceBindings: [], protectedComponents: [] }, references: [], composantsProteges: ['bouchon'] }))
      .toEqual({ ok: false, violations: ['composant obligatoire « bouchon » non protégé par la consigne'] });
  });

  it('VIDEO-03 · tenue changée : consignes des plans 1 et 2 périmées, celle du plan 3 tient', () => {
    const a = video();
    let c = a;
    for (const s of ['s1', 's2', 's3']) c = retenir(c, consigne(c, s));
    const b = copie(c);
    b.characterRefs.c_lea = { tenue: 'veste verte', cheveux: 'carré brun' };
    const v = (sid: string) => verdictConsignePlan({ shotId: sid, rang: b.shots.order.indexOf(sid) + 1, consigne: consigneDuPlan(b, sid), attestee: true, entreesCourantes: entreesConsignePlan(b, sid), resolutions: new Map() });
    expect(v('s1')).toMatchObject({ ok: false, cause: 'perimee', code: 'VERSION_CONFLICT', cibles: ['keyframe:s1'] });
    expect(v('s2')).toMatchObject({ ok: false, cause: 'perimee' });
    expect(v('s3')).toEqual({ ok: true });
  });

  it('verdicts · absente, non attestée, référence retirée ou modifiée', () => {
    const c = video();
    const k = consigne(c, 's1');
    const e = entreesConsignePlan(c, 's1');
    expect(verdictConsignePlan({ shotId: 's1', rang: 1, consigne: null, attestee: false, entreesCourantes: e, resolutions: new Map() })).toMatchObject({ ok: false, cause: 'absente', code: 'MISSING_REFERENCE' });
    expect(verdictConsignePlan({ shotId: 's1', rang: 1, consigne: k, attestee: false, entreesCourantes: e, resolutions: new Map() })).toMatchObject({ ok: false, cause: 'non_attestee' });
    const avecRef = { ...k, references: [{ assetId: 'pph_1', assetVersion: 'v1', sha256: SHA, role: 'product' }] };
    expect(verdictConsignePlan({ shotId: 's1', rang: 1, consigne: avecRef, attestee: true, entreesCourantes: e, resolutions: new Map() })).toMatchObject({ ok: false, cause: 'reference_retiree', cibles: ['pph_1'] });
    expect(verdictConsignePlan({ shotId: 's1', rang: 1, consigne: avecRef, attestee: true, entreesCourantes: e, resolutions: new Map([['pph_1', { etat: 'present', assetVersion: 'v2', sha256: SHA, transmissible: true }]]) })).toMatchObject({ ok: false, cause: 'reference_modifiee' });
  });

  it('devis · images clés des plans raccordées, s_image exclue, une requête par job', () => {
    expect(planDeKeyframe('keyframe:s1')).toBe('s1');
    expect(planDeKeyframe('keyframe:s_image')).toBeNull();
    expect(exigencePlansDuDevis([{ operation: 'keyframe:s_image', profil: 'image_generation' }])).toEqual({ concerne: false });
    expect(exigencePlansDuDevis([{ operation: 'keyframe:s1', profil: 'image_generation' }, { operation: 'export', profil: 'calcul' }, { operation: 'identite:c_lea', profil: 'image_generation' }]))
      .toEqual({ concerne: true, plans: ['s1'], horsImage: ['identite:c_lea'] });
    const c = video();
    const k1 = consigne(c, 's1');
    const k2 = consigne(c, 's2', { instruction: 'Autre chose.' });
    expect(parametresDesPlans([k1, k2])).toMatchObject({ ok: false, cibles: ['keyframe:s2'] });
    // Même requête (même consigne, mêmes références, même format) · un job, N images.
    const k2bis = consigne(c, 's2');
    const p = parametresDesPlans([k2bis, k1]);
    expect(p).toMatchObject({ ok: true, parametres: { promptRunId: 'run-s1' } });
    expect(empreinteConsignesDevis([k1, k2bis])).toBe(empreinteConsignesDevis([k2bis, k1]));
  });

  it('préparation de shot.image · produit cité sans photo épinglée : bloqué avant appel', () => {
    const c = video();
    expect(preparerShotImage(c, 's3', 'v1')).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' });
    const p = preparerShotImage(c, 's1', 'v1');
    expect(p.ok && p.taskInputs.shotId).toBe('s1');
    expect(p.ok && p.resolvedDocuments.map((d) => [d.id, d.schemaKey])).toEqual([['s1', 'Shot'], ['c_lea', 'Fact']]);
    expect(p.ok && p.invariants[0]).toBe(INTERDIT_TEXTE_IMAGE_CLE);
    expect(formatVideo({ brief: null })).toMatchObject({ largeur: 1080, hauteur: 1920, depuisBrief: false });
  });
});

describe('patch et sorties · le serveur rejoue, les médias valides sont reconnus par empreinte', () => {
  it('appliquerPatch(avant, changes, /shots /timeline) redonne exactement le contenu de l’opération', () => {
    const a = video();
    for (const op of [{ type: 'ordre', ordre: ['s3', 's1', 's2'] }, { type: 'narration', shotId: 's1', narration: 'Ça suffit.' }, { type: 'sans_texte' }, { type: 'musique', musique: null }, { type: 'plan', shotId: 's3', champs: { camera: 'travelling latéral' } }] as OperationVideo[]) {
      const r = appliquer(a, op);
      const p = appliquerPatch(a, r.changes, CHEMINS_VIDEO);
      expect(p.ok && p.resultat, op.type).toEqual(r.contenu);
      expect(changementsVideo(a, r.contenu, 'x').length).toBe(r.changes.length);
    }
  });

  it('une sortie produite pour une version passée vaut encore si son empreinte est identique', () => {
    const a = video();
    const b = appliquer(a, { type: 'ordre', ordre: ['s2', 's1', 's3'] }).contenu;
    const c2 = copie(b);
    c2.characterRefs.c_lea = { tenue: 'veste verte' };
    const produites = [{ operation: 'keyframe:s1', source: a }, { operation: 'keyframe:s3', source: a }, { operation: 'montage', source: a }];
    expect([...sortiesValides(b, produites)].sort()).toEqual(['keyframe:s1', 'keyframe:s3']);
    expect([...sortiesValides(c2, produites)].sort()).toEqual(['keyframe:s3']);
  });

  it('opération reçue · forme lue, champ inconnu refusé', () => {
    expect(lireOperationVideo({ type: 'plan', shotId: 's1', champs: { keyframeAssetId: 'x' } })).toMatchObject({ ok: false });
    expect(lireOperationVideo({ type: 'ordre', ordre: ['s1'] })).toEqual({ ok: true, operation: { type: 'ordre', ordre: ['s1'] } });
  });

  it('graphe · le nombre de nœuds n’a pas bougé avec les consignes', () => {
    const a = video();
    const b = retenir(a, consigne(a, 's2'));
    expect([...grapheImpact(b).keys()].sort()).toEqual([...grapheImpact(a).keys()].sort());
  });
});

describe('écran · disponibilités dites, animation jamais présentée disponible', () => {
  const tout = { peutGenerer: true, peutProposer: true, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, decodeurVideo: false, briefPresent: true };
  it('sans décodeur vidéo · animation indisponible, le reste ouvert', () => {
    const d = disponibiliteVideo(tout);
    expect(d.animation.disponible).toBe(false);
    expect(d.animation.raison).toMatch(/ne sait pas encore vérifier une vidéo produite/);
    expect(LIBELLE_ANIMATION_INDISPONIBLE).toBe('Vidéo indisponible · aucun décodeur vidéo');
    expect(d.storyboard.disponible && d.consigne.disponible && d.montage.disponible).toBe(true);
  });
  it('sans release · storyboard et consigne bloqués, chemin manuel dit', () => {
    const d = disponibiliteVideo({ ...tout, releasePubliee: false });
    expect(d.storyboard).toEqual({ disponible: false, raison: 'Aucune version des consignes n’est publiée : cette tâche n’est pas encore activée. Rien n’est facturé · le chemin manuel reste ouvert.' });
    expect(d.consigne.disponible).toBe(false);
    expect(d.montage.disponible).toBe(true);
  });
});
