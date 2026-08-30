import { describe, it, expect } from 'vitest';
import {
  validatePreset, normalizePreset, presetPerformance, composePrompt,
  MIN_N_PRESET, PROMPT_MIN, PROMPT_MAX, NAME_MAX,
  type PresetUsageRow,
} from '../src/creative-presets';

const bon = {
  name: 'Sombre cinématique maison',
  prompt: 'Scène nocturne, lumière rasante bleutée, contre-jour marqué sur le produit, grain argentique léger.',
};

describe('un preset qui ne dirige rien est refusé', () => {
  it('accepte un prompt qui décrit vraiment', () => {
    expect(validatePreset(bon)).toEqual([]);
  });

  it('refuse un nom vide', () => {
    expect(validatePreset({ ...bon, name: '  ' }).map((v) => v.field)).toContain('name');
  });

  it('refuse un prompt vide', () => {
    expect(validatePreset({ ...bon, prompt: '' }).map((v) => v.field)).toContain('prompt');
  });

  it('refuse un prompt trop court · « beau » ne change pas une image', () => {
    const v = validatePreset({ ...bon, prompt: 'beau et pro' });
    expect(v).toHaveLength(1);
    expect(v[0]!.message).toContain('ne change rien à l’image');
  });

  it('le seuil de longueur est celui annoncé', () => {
    expect(validatePreset({ ...bon, prompt: 'x'.repeat(PROMPT_MIN) })).toEqual([]);
    expect(validatePreset({ ...bon, prompt: 'x'.repeat(PROMPT_MIN - 1) })).toHaveLength(1);
  });

  it('refuse un prompt démesuré · le modèle en perdrait la moitié', () => {
    expect(validatePreset({ ...bon, prompt: 'x'.repeat(PROMPT_MAX + 1) })).toHaveLength(1);
  });

  it('signale plusieurs problèmes à la fois plutôt qu’un seul', () => {
    expect(validatePreset({ name: '', prompt: '' })).toHaveLength(2);
  });
});

describe('la normalisation est unique et faite au même endroit', () => {
  it('coupe les blancs et borne les longueurs', () => {
    const n = normalizePreset({ name: `  ${'a'.repeat(200)}  `, prompt: `  ${bon.prompt}  ` });
    expect(n.name.length).toBe(NAME_MAX);
    expect(n.prompt).toBe(bon.prompt);
  });

  it('une exclusion vide devient null, pas une chaîne vide', () => {
    expect(normalizePreset({ ...bon, negative: '   ' }).negative).toBeNull();
  });

  it('le type par défaut couvre image et vidéo', () => {
    expect(normalizePreset(bon).kind).toBe('both');
  });
});

describe('ton prompt devient une hypothèse mesurée', () => {
  const rows = (verdicts: Array<string | null>, id = 'p1'): PresetUsageRow[] =>
    verdicts.map((v) => ({ presetId: id, verdict: v }));

  it('jamais utilisé se dit franchement', () => {
    const p = presetPerformance('p1', []);
    expect(p.used).toBe(0);
    expect(p.summary).toBe('Jamais utilisé.');
  });

  it('utilisé sans verdict ne produit pas de taux', () => {
    const p = presetPerformance('p1', rows([null, null]));
    expect(p.hitRate).toBeNull();
    expect(p.conclusive).toBe(0);
    expect(p.summary).toContain('aucun verdict encore');
  });

  it('les non concluants ne comptent nulle part', () => {
    const p = presetPerformance('p1', rows(['inconclusive', 'insufficient_delivery', 'winner']));
    expect(p.conclusive).toBe(1);
    expect(p.used).toBe(3);
  });

  it('sous le seuil, on montre l’usage et jamais un taux', () => {
    const p = presetPerformance('p1', rows(['winner', 'loser']));
    expect(p.hitRate).toBeNull();
    expect(p.summary).toContain(`il en faut ${MIN_N_PRESET}`);
  });

  it('au seuil, le taux apparaît', () => {
    const p = presetPerformance('p1', rows(['winner', 'winner', 'loser']));
    expect(p.conclusive).toBe(3);
    expect(p.hitRate).toBeCloseTo(2 / 3, 5);
    expect(p.summary).toContain('67 %');
    expect(p.summary).toContain('2 gagnante(s) sur 3');
  });

  it('les gagnantes naissantes et relatives comptent', () => {
    const p = presetPerformance('p1', rows(['baby_winner', 'relative_winner', 'winner']));
    expect(p.winners).toBe(3);
    expect(p.hitRate).toBe(1);
  });

  it('un prompt qui n’a rien donné le dit sans détour', () => {
    const p = presetPerformance('p1', rows(['loser', 'loser', 'loser']));
    expect(p.winners).toBe(0);
    expect(p.summary).toContain('n’a rien donné');
  });

  it('ne compte que ses propres créas', () => {
    const melange = [...rows(['winner'], 'p1'), ...rows(['winner', 'winner'], 'p2')];
    expect(presetPerformance('p1', melange).used).toBe(1);
    expect(presetPerformance('p2', melange).used).toBe(2);
  });
});

describe('le concept dit quoi montrer, le preset dit comment', () => {
  it('sans preset, la scène passe telle quelle', () => {
    expect(composePrompt('Une femme ouvre le paquet.')).toBe('Une femme ouvre le paquet.');
    expect(composePrompt('scene', null)).toBe('scene');
    expect(composePrompt('scene', { prompt: '   ' })).toBe('scene');
  });

  it('la scène vient AVANT le style · l’inverse ferait dériver le sujet', () => {
    const p = composePrompt('SCENE_ICI', { prompt: 'STYLE_ICI' });
    expect(p.indexOf('SCENE_ICI')).toBeLessThan(p.indexOf('STYLE_ICI'));
  });

  it('les exclusions ferment le prompt', () => {
    const p = composePrompt('scene', { prompt: 'style', negative: 'texte à l’écran' });
    expect(p.trimEnd().endsWith('Avoid: texte à l’écran')).toBe(true);
  });

  it('une exclusion vide n’ajoute pas de ligne morte', () => {
    expect(composePrompt('scene', { prompt: 'style', negative: '  ' })).not.toContain('Avoid');
  });
});
