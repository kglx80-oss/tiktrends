import { describe, expect, it } from 'vitest';
import { TAG_TEMPLATE, estTemplateAsset, avecTemplate, tagsVisibles, templatesDabord } from '../src/templates-crea';

/**
 * Un asset devient template quand il porte le marqueur réservé · sans changer le
 * schéma (on réutilise ses tags). On vérifie le RÉSULTAT : reconnaître un
 * template, poser/retirer le marqueur proprement, ne jamais l'exposer comme un
 * tag ordinaire.
 */
describe('templates de créative · marqueur dans les tags, 0 migration', () => {
  it('reconnaît un template à son marqueur', () => {
    expect(estTemplateAsset([TAG_TEMPLATE])).toBe(true);
    expect(estTemplateAsset(['premium', TAG_TEMPLATE])).toBe(true);
    expect(estTemplateAsset(['premium'])).toBe(false);
    expect(estTemplateAsset([])).toBe(false);
    expect(estTemplateAsset(null)).toBe(false);
    expect(estTemplateAsset(undefined)).toBe(false);
  });

  it('pose le marqueur sans toucher aux autres tags', () => {
    expect(avecTemplate(['premium', 'sombre'], true)).toEqual(['premium', 'sombre', TAG_TEMPLATE]);
  });

  it('poser deux fois ne duplique pas le marqueur (idempotent)', () => {
    const une = avecTemplate(['premium'], true);
    const deux = avecTemplate(une, true);
    expect(deux.filter((t) => t === TAG_TEMPLATE).length, 'le marqueur est dupliqué').toBe(1);
    expect(deux).toEqual(['premium', TAG_TEMPLATE]);
  });

  it('retire le marqueur, garde les autres tags', () => {
    expect(avecTemplate(['premium', TAG_TEMPLATE, 'sombre'], false)).toEqual(['premium', 'sombre']);
    // Démarquer un asset qui ne l'était pas ne casse rien.
    expect(avecTemplate(['premium'], false)).toEqual(['premium']);
    expect(avecTemplate(null, false)).toEqual([]);
  });

  it('les tags visibles n’exposent jamais le marqueur au client', () => {
    expect(tagsVisibles(['premium', TAG_TEMPLATE, 'sombre'])).toEqual(['premium', 'sombre']);
    expect(tagsVisibles([TAG_TEMPLATE])).toEqual([]);
    expect(tagsVisibles(null)).toEqual([]);
  });

  it('les templates passent en premier, l’ordre relatif conservé (tri stable)', () => {
    const l = [
      { id: 'a', isTemplate: false }, { id: 'b', isTemplate: true },
      { id: 'c', isTemplate: false }, { id: 'd', isTemplate: true },
    ];
    expect(templatesDabord(l).map((x) => x.id), 'les templates ne remontent pas en tête ou l’ordre se casse')
      .toEqual(['b', 'd', 'a', 'c']);
    // Sans template, la liste est inchangée.
    expect(templatesDabord([{ id: 'x', isTemplate: false }, { id: 'y', isTemplate: false }]).map((x) => x.id)).toEqual(['x', 'y']);
    expect(templatesDabord<{ isTemplate?: boolean }>([])).toEqual([]);
  });
});
