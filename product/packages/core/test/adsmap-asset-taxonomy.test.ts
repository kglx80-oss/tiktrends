import { describe, it, expect } from 'vitest';
import {
  normalizeHookType, normalizeOpeningType, normalizeTalent,
  normalizeAnalysis, summarizeAnalysis,
} from '../src/adsmap/asset-taxonomy';

describe('normalisation des valeurs', () => {
  it('accepte la valeur canonique', () => {
    expect(normalizeHookType('question')).toBe('question');
    expect(normalizeOpeningType('face_talking')).toBe('face_talking');
    expect(normalizeTalent('founder')).toBe('founder');
  });

  it('ramène les variantes de casse et de séparateur', () => {
    // Sans ça, « Face Talking », « face-talking » et « face_talking » feraient
    // trois lignes dans un tableau qui ne devrait en avoir qu'une · et aucune
    // n'atteindrait l'effectif minimal pour conclure.
    expect(normalizeOpeningType('Face Talking')).toBe('face_talking');
    expect(normalizeOpeningType('face-talking')).toBe('face_talking');
  });

  it('ramène les synonymes que le modèle produit vraiment', () => {
    expect(normalizeHookType('interrogative')).toBe('question');
    expect(normalizeHookType('statistic')).toBe('number');
    expect(normalizeOpeningType('talking head')).toBe('face_talking');
    expect(normalizeTalent('influencer')).toBe('ugc_creator');
    expect(normalizeTalent('voiceover')).toBe('voice_over_only');
  });

  it('rend null sur l’inconnu plutôt que de ranger d’office', () => {
    // Une valeur par défaut fausserait toutes les statistiques en silence.
    expect(normalizeHookType('poétique')).toBeNull();
    expect(normalizeHookType('')).toBeNull();
    expect(normalizeTalent(null)).toBeNull();
  });

  it('ne fait pas déborder un synonyme d’une famille sur l’autre', () => {
    // « problem » désigne une ouverture, pas un type d'accroche.
    expect(normalizeOpeningType('problem')).toBe('problem_scene');
    expect(normalizeHookType('problem')).toBeNull();
  });
});

describe('normalizeAnalysis', () => {
  it('range une sortie propre', () => {
    const a = normalizeAnalysis({
      hookType: 'Question', openingType: 'talking head', talent: 'ugc',
      durationS: 22, claims: ['  tient 8 h  ', ''], proofElements: ['avis client'],
      hasCaptions: true, confidence: 0.8,
    });
    expect(a.hookType).toBe('question');
    expect(a.openingType).toBe('face_talking');
    expect(a.talent).toBe('ugc_creator');
    expect(a.claims).toEqual(['tient 8 h']);
    expect(a.unmapped).toEqual([]);
  });

  it('signale ce qu’il n’a pas su ranger au lieu de le jeter', () => {
    const a = normalizeAnalysis({ hookType: 'poétique', openingType: 'drone' });
    expect(a.hookType).toBeNull();
    expect(a.unmapped).toHaveLength(2);
    expect(a.unmapped[0]).toContain('poétique');
  });

  it('écarte une durée absurde au lieu de la corriger', () => {
    // 4000 s sur une story n'est pas une erreur d'unité, c'est une hallucination ·
    // la diviser reviendrait à la valider.
    expect(normalizeAnalysis({ durationS: 4000 }).durationS).toBeNull();
    expect(normalizeAnalysis({ durationS: -3 }).durationS).toBeNull();
    expect(normalizeAnalysis({ durationS: 18 }).durationS).toBe(18);
  });

  it('borne la confiance et retombe à 0,5 sans valeur', () => {
    expect(normalizeAnalysis({ confidence: 3 }).confidence).toBe(1);
    expect(normalizeAnalysis({ confidence: -1 }).confidence).toBe(0);
    expect(normalizeAnalysis({}).confidence).toBe(0.5);
  });

  it('n’invente pas un booléen absent', () => {
    expect(normalizeAnalysis({}).hasCaptions).toBeNull();
    expect(normalizeAnalysis({ hasCaptions: false }).hasCaptions).toBe(false);
  });
});

describe('summarizeAnalysis', () => {
  it('résume en une phrase lisible', () => {
    const s = summarizeAnalysis(normalizeAnalysis({ hookType: 'number', openingType: 'product', talent: 'none', durationS: 15, confidence: 0.9 }));
    expect(s).toContain('chiffre');
    expect(s).toContain('15 s');
  });

  it('dit quand l’analyse est peu sûre', () => {
    expect(summarizeAnalysis(normalizeAnalysis({ hookType: 'question', confidence: 0.2 }))).toContain('peu sûre');
  });

  it('dit clairement quand rien n’a été reconnu', () => {
    expect(summarizeAnalysis(normalizeAnalysis({}))).toContain('Rien de reconnu');
  });
});
