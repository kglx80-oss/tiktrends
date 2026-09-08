import { describe, it, expect } from 'vitest';
import {
  normalizeHookType, normalizeOpeningType, normalizeTalent,
  normalizeHeadlinePosition, normalizeComposition, normalizeTextDensity, normalizeBackground,
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

describe('grammaire de mise en page · pubs statiques', () => {
  it('accepte les valeurs canoniques', () => {
    expect(normalizeHeadlinePosition('top')).toBe('top');
    expect(normalizeComposition('product_hero')).toBe('product_hero');
    expect(normalizeTextDensity('minimal')).toBe('minimal');
    expect(normalizeBackground('dark')).toBe('dark');
  });

  it('ramène les synonymes fréquents des sorties d’IA', () => {
    expect(normalizeHeadlinePosition('haut')).toBe('top');
    expect(normalizeHeadlinePosition('bottom third')).toBe('bottom');
    expect(normalizeComposition('label closeup')).toBe('packaging_closeup');
    expect(normalizeComposition('side by side')).toBe('comparison');
    expect(normalizeTextDensity('busy')).toBe('heavy');
    expect(normalizeBackground('colorful')).toBe('vibrant');
  });

  it('rend null sur l’inconnu plutôt que de ranger d’office', () => {
    expect(normalizeComposition('cinématique')).toBeNull();
    expect(normalizeBackground('dégradé')).toBeNull();
  });

  it('un même mot ne déborde pas d’une famille sur l’autre', () => {
    // « lifestyle » est une COMPOSITION statique, et reste une ouverture vidéo
    // (b_roll) · c'est la liste admise par dimension qui les sépare, pas le mot.
    expect(normalizeComposition('lifestyle')).toBe('lifestyle');
    expect(normalizeOpeningType('lifestyle')).toBe('b_roll');
    expect(normalizeHeadlinePosition('lifestyle')).toBeNull();
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

  it('range la grammaire de mise en page, et signale l’inconnu', () => {
    const a = normalizeAnalysis({
      headlinePosition: 'haut', composition: 'label closeup', textDensity: 'busy',
      background: 'dégradé', confidence: 0.7,
    });
    expect(a.headlinePosition).toBe('top');
    expect(a.composition).toBe('packaging_closeup');
    expect(a.textDensity).toBe('heavy');
    expect(a.background, 'un fond non reconnu ne se range pas d’office').toBeNull();
    expect(a.unmapped.some((u) => u.includes('dégradé'))).toBe(true);
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

  it('inclut la grammaire de mise en page d’une pub statique', () => {
    const s = summarizeAnalysis(normalizeAnalysis({
      composition: 'product_hero', headlinePosition: 'top', textDensity: 'minimal',
      background: 'dark', confidence: 0.9,
    }));
    expect(s).toContain('produit héros');
    expect(s).toContain('accroche en haut');
    expect(s).toContain('fond sombre');
  });

  it('ne mentionne pas la position quand il n’y a pas d’accroche', () => {
    // « pas d'accroche » n'est pas une position à annoncer · c'est l'absence.
    const s = summarizeAnalysis(normalizeAnalysis({ composition: 'text_card', headlinePosition: 'none', confidence: 0.8 }));
    expect(s).not.toContain('accroche');
  });
});
