import { describe, it, expect } from 'vitest';
import { briefDepuisTest, lireIterationDemandee, lienIterationStudio, champsManquants, type TestSource } from '../src/index';

/**
 * I2 · un test arbitré gagnant ouvre le Studio sur un brief d'itération. On
 * vérifie ce qui SORT · l'éligibilité, la provenance, les natures (mesuré /
 * consigné / suggéré) et le préremplissage limité aux champs de génération.
 */
const AD = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const base: TestSource = {
  adId: AD, variantCode: 'v2', concept: 'Concept 2', angle: 'Angle 1', persona: 'Mères actives', personaId: 'p1',
  verdictStatus: 'validated', validated: 'winner', comparable: true,
  testedVariable: 'hook', variableValue: 'Question choc',
  metrics: { cpa: 14, hookRate: 0.33, ctr: 0.012 },
  learnings: [{ statement: 'Le témoignage chiffré tient mieux que la promesse seule.', confidence: 4, scope: 'ad' }],
};

describe('briefDepuisTest · éligibilité · aucune fausse itération', () => {
  it('gagnante arbitrée, comparable, avec apprentissage → brief', () => {
    expect(briefDepuisTest(base).eligible).toBe(true);
    expect(briefDepuisTest({ ...base, validated: 'baby_winner' }).eligible).toBe(true);
  });
  it('sans verdict arbitré (calculé seulement, ou aucun) → pas de brief, motif clair', () => {
    for (const t of [{ ...base, verdictStatus: 'computed' as const }, { ...base, verdictStatus: null, validated: null }]) {
      const r = briefDepuisTest(t);
      expect(r.eligible, 'un verdict non arbitré ouvre une itération').toBe(false);
      if (!r.eligible) expect(r.motif).toContain('arbitré');
    }
  });
  it('perdante, prometteuse relative ou gagnante non comparable → pas d’itération', () => {
    for (const t of [{ ...base, validated: 'loser' as const }, { ...base, validated: 'relative_winner' as const }, { ...base, comparable: false }]) {
      expect(briefDepuisTest(t).eligible, `${t.validated}/${t.comparable} ouvre une itération`).toBe(false);
    }
  });
  it('gagnante SANS apprentissage consigné → pas d’itération (on ne part pas de rien)', () => {
    const r = briefDepuisTest({ ...base, learnings: [{ statement: '   ', confidence: 3, scope: 'ad' }] });
    expect(r.eligible, 'une gagnante sans apprentissage ouvre une itération').toBe(false);
    if (!r.eligible) expect(r.motif).toContain('apprentissage');
  });
});

describe('briefDepuisTest · provenance et natures', () => {
  const r = briefDepuisTest(base);
  if (!r.eligible) throw new Error('attendu éligible');

  it('la provenance nomme le test et son verdict arbitré, chiffres à l’appui', () => {
    expect(r.provenance.titre).toBe('Itération de v2 · Concept 2');
    expect(r.provenance.verdict).toBe('Gagnante · verdict arbitré');
    expect(r.provenance.chiffres).toEqual(['CPA 14 €', 'accroche 33.0 %', 'clic 1.2 %']);
  });
  it('l’apprentissage est repris tel quel (consigné, pas réécrit)', () => {
    expect(r.apprentissages[0]!.texte).toBe(base.learnings[0]!.statement);
  });
  it('l’hypothèse est une SUGGESTION, la variable suivante reste À CHOISIR · rien n’est inventé comme fait', () => {
    expect(r.champs.hypothese.nature).toBe('suggestion');
    expect(r.champs.variableSuivante.nature).toBe('a_choisir');
    // Historique du test source, pas un champ repris · la génération ne le reçoit pas.
    expect(r.provenance.variableTestee).toBe('Hook = « Question choc »');
    expect(r.champs).not.toHaveProperty('variableTestee');
    expect(r.brief.variable, 'une variable suivante est inventée').toBe('');
    expect(champsManquants(r.brief)).toContain('variable');
  });
  it('le préremplissage se limite aux champs de génération du Studio · angle et audience', () => {
    expect(r.prefill).toEqual({ angle: 'Angle 1', personaId: 'p1' });
  });
  it('sans angle, le concept tient lieu d’angle · sans persona, pas d’audience inventée', () => {
    const r2 = briefDepuisTest({ ...base, angle: null, persona: null, personaId: null });
    if (!r2.eligible) throw new Error('attendu éligible');
    expect(r2.prefill).toEqual({ angle: 'Concept 2', personaId: null });
    expect(r2.champs.audience).toBeNull();
  });
});

describe('lien et paramètre', () => {
  it('le lien du panneau et la lecture du Studio se répondent · identifiant mal formé ignoré', () => {
    const href = lienIterationStudio(AD);
    expect(href).toBe(`/studio/ads?iter=${AD}`);
    expect(lireIterationDemandee(Object.fromEntries(new URL(href, 'http://x').searchParams))).toBe(AD);
    expect(lireIterationDemandee({ iter: 'x; drop' })).toBeNull();
    expect(lireIterationDemandee({})).toBeNull();
  });
});
