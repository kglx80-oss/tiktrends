import { describe, it, expect } from 'vitest';
import {
  validatePreset, normalizePreset, presetPerformance, composePrompt,
  rankScenes, sceneAdvice,
  MIN_N_PRESET, PROMPT_MIN, PROMPT_MAX, NAME_MAX,
  type PresetUsageRow, type ScenePerf,
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

/* -------------------------------------------------------------------------- */

describe('les scènes qui gagnent remontent d’elles-mêmes', () => {
  /** Fabrique une scène à partir de verdicts bruts · le bilan est calculé. */
  const scene = (id: string, name: string, verdicts: Array<string | null>): ScenePerf => ({
    id, name,
    performance: verdicts.length ? presetPerformance(id, verdicts.map((v) => ({ presetId: id, verdict: v }))) : null,
  });

  const gagnante = scene('g', 'Sombre cinéma', ['winner', 'winner', 'winner', 'loser']);
  const moyenne = scene('m', 'Studio blanc', ['winner', 'loser', 'loser', 'loser']);
  const neuve = scene('n', 'Terrasse été', []);
  const perdante = scene('p', 'Néon saturé', ['loser', 'loser', 'loser']);

  it('le gagnant passe devant l’inconnu, qui passe devant le perdant avéré', () => {
    const ordre = rankScenes([perdante, neuve, moyenne, gagnante]).map((s) => s.id);
    expect(ordre).toEqual(['g', 'm', 'n', 'p']);
  });

  it('à taux égal, celui qui a le plus de tests derrière lui passe devant', () => {
    const peu = scene('a', 'Peu testée', ['winner', 'winner', 'loser']);
    const beaucoup = scene('b', 'Bien testée', ['winner', 'winner', 'winner', 'winner', 'loser', 'loser']);
    expect(peu.performance!.hitRate).toBeCloseTo(beaucoup.performance!.hitRate!, 5);
    expect(rankScenes([peu, beaucoup])[0]!.id).toBe('b');
  });

  it('le perdant reste dans la liste · le retirer priverait de ce qu’il apprend', () => {
    expect(rankScenes([gagnante, perdante]).map((s) => s.id)).toContain('p');
  });

  it('l’ordre d’entrée ne change pas le résultat · le tri ne mute pas la source', () => {
    const source = [neuve, gagnante, perdante];
    const copie = [...source];
    rankScenes(source);
    expect(source).toEqual(copie);
  });

  it('les inconnues restent entre elles par ordre alphabétique', () => {
    const a = scene('x', 'Zeste', []);
    const b = scene('y', 'Atelier', []);
    expect(rankScenes([a, b]).map((s) => s.name)).toEqual(['Atelier', 'Zeste']);
  });
});

describe('la phrase ne sort que si on a mieux à proposer', () => {
  const scene = (id: string, name: string, verdicts: Array<string | null>): ScenePerf => ({
    id, name,
    performance: verdicts.length ? presetPerformance(id, verdicts.map((v) => ({ presetId: id, verdict: v }))) : null,
  });

  const gagnante = scene('g', 'Sombre cinéma', ['winner', 'winner', 'winner', 'loser']);
  const neuve = scene('n', 'Terrasse été', []);
  const perdante = scene('p', 'Néon saturé', ['loser', 'loser', 'loser']);

  it('sur la meilleure, elle se tait · féliciter n’apprend rien', () => {
    expect(sceneAdvice('g', [gagnante, neuve, perdante])).toBeNull();
  });

  it('sur une perdante avérée, elle le dit franchement', () => {
    const t = sceneAdvice('p', [gagnante, perdante]);
    expect(t).toContain('Néon saturé');
    expect(t).toContain('3 tests tranchés');
  });

  it('sur une inconnue, elle informe sans interdire', () => {
    const t = sceneAdvice('n', [gagnante, neuve])!;
    expect(t).toContain('Sombre cinéma');
    expect(t).toContain('3 gagnantes sur 4 tests tranchés');
    expect(t).toContain('ce n’est pas une raison de renoncer');
  });

  it('sans aucune scène gagnante, rien à dire', () => {
    expect(sceneAdvice('n', [neuve, scene('a', 'Autre', [])])).toBeNull();
  });

  it('hors scène enregistrée, elle se tait · on n’a rien à comparer', () => {
    expect(sceneAdvice(null, [gagnante])).toBeNull();
  });

  it('une scène absente de la liste ne fabrique pas de conseil', () => {
    expect(sceneAdvice('fantome', [gagnante])).toBeNull();
  });
});
