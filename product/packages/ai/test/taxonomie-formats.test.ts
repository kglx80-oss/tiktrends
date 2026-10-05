import { describe, expect, it } from 'vitest';
import { IDS_FORMATS_CREATIFS } from '@tiktrends/core';
import { FORMAT, TagTaxonomy } from '../src/taxonomy';

/**
 * Lot 19C · une seule taxonomie des formats. Le contrat de sortie de l'IA
 * (`TagTaxonomy.format`) accepte EXACTEMENT la liste du noyau · un format du
 * noyau passe, une valeur retirée (`ai_generated`) ou de l'ancienne liste
 * (`static_product`) est refusée. On vérifie le RÉSULTAT de la validation.
 */
const base = {
  hook_type: [], hook_verbatim: '', persona: '', core_desire: [], emotion: [], angle: [], usp_claims: [], key_message: '',
  cta_type: [], visual_style: [], has_voiceover: false, has_music: false, has_captions: false, has_face: false,
  product_shown_at_s: null, language: 'fr', awareness_level: [], offer: null, confidence: {},
};

describe('taxonomy.ts · FORMAT est la liste du noyau', () => {
  it('même liste, même ordre', () => {
    expect([...FORMAT]).toEqual([...IDS_FORMATS_CREATIFS]);
  });
  it('un format du noyau passe la validation de sortie', () => {
    expect(TagTaxonomy.safeParse({ ...base, format: ['packshot', 'face_camera', 'autre'] }).success).toBe(true);
  });
  it('ai_generated et les anciennes valeurs sont refusées', () => {
    expect(TagTaxonomy.safeParse({ ...base, format: ['ai_generated'] }).success).toBe(false);
    expect(TagTaxonomy.safeParse({ ...base, format: ['static_product'] }).success).toBe(false);
  });
});
