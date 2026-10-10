import { describe, it, expect } from 'vitest';
import { planRenduFinal, timelineDesPlans, PLANS_RENDU_MAX, type ContenuVersion, type PlanStudio } from '../src';

/**
 * Vidéo finale · plan pur. Chaque plan apporte son clip VALIDE, tenu à sa
 * durée ; la musique s'ajoute ; ce qui n'est pas inclus (voix, texte écran,
 * sous-titres) est dit, jamais simulé ; un manque est nommé plan par plan.
 */

const U = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const plan = (shotId: string, o: Partial<PlanStudio> = {}): PlanStudio => ({
  shotId, purpose: 'Accroche', subject: 'Léa', action: 'sourit', framing: 'plan rapproché', camera: 'fixe', lighting: 'matin', environment: 'salle de bain',
  referenceIds: [], narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 3000, ...o,
});
function contenu(plans: PlanStudio[], o: { musique?: { assetId: string; gainDb: number } | null; sousTitres?: boolean } = {}): ContenuVersion {
  const c = { brief: null, productRef: null, styleRef: null, characterRefs: {}, shots: { order: plans.map((p) => p.shotId), byId: Object.fromEntries(plans.map((p) => [p.shotId, p])) }, document: null, timeline: null } as unknown as ContenuVersion;
  const t = timelineDesPlans(c, null);
  return { ...c, timeline: { ...t, music: o.musique ?? null, subtitles: { enabled: o.sousTitres ?? false } } };
}

describe('vidéo finale · plan d’assemblage', () => {
  it('tous les clips valides ⇒ segments dans l’ordre, durée des plans, format du projet, silence dit', () => {
    const c = contenu([plan('s1'), plan('s2', { estimatedDurationMs: 4000 })]);
    const r = planRenduFinal({ contenu: c, clips: { s1: U(1), s2: U(2) }, musique: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.segments).toEqual([{ shotId: 's1', rang: 1, assetId: U(1), dureeMs: 3000 }, { shotId: 's2', rang: 2, assetId: U(2), dureeMs: 4000 }]);
    expect([r.plan.largeur, r.plan.hauteur, r.plan.dureeMs]).toEqual([1080, 1920, 7000]);
    expect(r.plan.nonInclus).toEqual(['Musique · aucune choisie, bande son silencieuse.']);
  });

  it('un plan sans clip valide ⇒ refus nommé, plan par plan', () => {
    const r = planRenduFinal({ contenu: contenu([plan('s1'), plan('s2'), plan('s3')]), clips: { s1: U(1), s3: 'pas-un-uuid' }, musique: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.violations.map((x) => x.cible)).toEqual(['s2', 's3']);
    expect(r.violations[0]!.raison).toBe('Le plan 2 n’a pas de clip animé valide pour cette version · anime-le avant d’assembler.');
  });

  it('voix, texte écran, sous-titres ⇒ dits « non inclus », jamais simulés ; musique à son gain borné', () => {
    const c = contenu([plan('s1', { speechMode: 'voiceover', narration: 'Marre des boutons ?', onScreenText: ['-30 %'] }), plan('s2')], { musique: { assetId: U(9), gainDb: 40 }, sousTitres: true });
    const r = planRenduFinal({ contenu: c, clips: { s1: U(1), s2: U(2) }, musique: { assetId: U(9), gainDb: 40 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.musique).toEqual({ assetId: U(9), gainDb: 12 });
    expect(r.plan.nonInclus).toEqual([
      'Voix · aucun fournisseur de voix n’est branché, la narration n’est pas dite (plan 1).',
      'Texte écran · non incrusté (plan 1).',
      'Sous-titres · non incrustés.',
    ]);
  });

  it('musique choisie mais introuvable, montage absent, trop de plans ⇒ refus', () => {
    expect(planRenduFinal({ contenu: contenu([plan('s1')]), clips: { s1: U(1) }, musique: 'introuvable' })).toMatchObject({ ok: false, violations: [{ cible: 'musique' }] });
    const sans = { ...contenu([plan('s1')]), timeline: null };
    expect(planRenduFinal({ contenu: sans, clips: { s1: U(1) }, musique: null })).toMatchObject({ ok: false, violations: [{ cible: 'timeline' }] });
    const n = PLANS_RENDU_MAX + 1;
    const beaucoup = Array.from({ length: n }, (_, i) => plan(`s${i + 1}`, { estimatedDurationMs: 1000 }));
    const r = planRenduFinal({ contenu: contenu(beaucoup), clips: Object.fromEntries(beaucoup.map((p, i) => [p.shotId, U(i + 1)])), musique: null });
    expect(r.ok).toBe(false);
  });
});
