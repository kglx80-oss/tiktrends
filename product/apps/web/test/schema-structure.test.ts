import { mesurerRequete, borneJetonsEntree, octetsUtf8 } from '@tiktrends/core';
import { creerValidateurContrats } from '../lib/studios/prompts/noyau';
import { chargerSource } from '../lib/studios/prompts/source';
import { describe, it, expect } from 'vitest';
import { schemaStructure } from '../lib/studios/prompts/schema-structure';

describe('projection API, contrat local intact', () => {
  it('résout seulement les refs utiles, conserve null et ferme chaque objet, sans bornes API non supportées', () => {
    const original = {
      type: 'object', properties: { result: { anyOf: [{ $ref: '#/$defs/Result' }, { type: 'null' }] } }, required: ['result'],
      $defs: { Result: { type: 'object', properties: { texte: { type: 'string', maxLength: 12000 }, items: { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 1, maxItems: 3 } }, required: ['texte', 'items'] }, SecretInutile: { type: 'string', const: 'hors contrat' } },
      allOf: [{ if: { properties: { result: { type: 'null' } } }, then: { required: ['questions'] } }],
    };
    const copie = structuredClone(original);
    const projection = schemaStructure(original);
    expect(original).toEqual(copie);
    expect(projection).toMatchObject({ additionalProperties: false, properties: { result: { anyOf: [
      { type: 'object', additionalProperties: false, properties: { texte: { type: 'string' }, items: { minItems: 1, type: 'array' } } }, { type: 'null' },
    ] } } });
    const champs = (v: unknown): string[] => Array.isArray(v) ? v.flatMap(champs) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...champs(x)]) : [];
    for (const interdit of ['$ref', '$defs', 'maxLength', 'maxItems', 'minimum', 'if', 'then']) expect(champs(projection)).not.toContain(interdit);
    expect(JSON.stringify(projection)).toContain('maxLength');
    expect(JSON.stringify(projection)).not.toContain('hors contrat');
  });
  it('contrat image réel : exemples ready/blocked valides et validation locale des bornes préservée', () => {
    const source = chargerSource();
    const original = source.validateur.schemaPourReference('03-CONTRATS.schema.json#/$defs/image_compile_output')!;
    const projected = schemaStructure(original);
    const validateur = creerValidateurContrats({ $id: 'urn:test:projection-image', $defs: { image: projected } }, []);
    const valider = (x: unknown) => validateur.validerDefinition('image', x).ok;
    const ready = { status: 'ready', questions: [], warnings: [], evidenceIds: [], result: { generationInstruction: 'Photo produit sur une table', negativeConstraints: [], protectedComponents: ['produit'], referenceBindings: [{ referenceId: 'pph_photo', role: 'product', scope: 'product' }], needsDeterministicOverlay: false } };
    const blocked = { status: 'blocked', questions: ['Quel produit ?'], warnings: [], evidenceIds: [], result: null };
    for (const exemple of [ready, blocked]) {
      expect(valider(exemple)).toBe(true);
      expect(source.validateur.validerSortie('image.compile', exemple).ok).toBe(true);
    }
    const tropLong = { ...ready, result: { ...ready.result, generationInstruction: 'x'.repeat(12001) } };
    expect(valider(tropLong)).toBe(true);
    expect(source.validateur.validerSortie('image.compile', tropLong).ok).toBe(false);
    expect(source.validateur.validerSortie('image.compile', { ...blocked, questions: [] }).ok).toBe(false);
    let optionnels = 0; let unions = 0;
    const parcourir = (v: unknown): void => {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) { v.forEach(parcourir); return; }
      const n = v as Record<string, unknown>;
      if (n.properties && typeof n.properties === 'object') optionnels += Object.keys(n.properties).filter(k => !Array.isArray(n.required) || !n.required.includes(k)).length;
      if (Array.isArray(n.anyOf) || Array.isArray(n.type)) unions += 1;
      Object.values(n).forEach(parcourir);
    };
    parcourir(projected);
    expect(optionnels).toBeLessThanOrEqual(24);
    expect(unions).toBeLessThanOrEqual(16);
    const config = { format: { type: 'json_schema', schema: projected } };
    const reserveFormat = borneJetonsEntree(mesurerRequete({ output_config: config })) - borneJetonsEntree(mesurerRequete({}));
    console.log('[image.compile projection]', JSON.stringify({ octets: octetsUtf8(JSON.stringify(projected)), reserveFormat, optionnels, unions }));
    expect(7303 + reserveFormat).toBeLessThan(24000);
  });
  it('refuse refs externes, absentes et récursives avant appel', () => {
    for (const schema of [{ $ref: 'https://example.com/schema' }, { $ref: '#/$defs/missing' }, { $ref: '#/$defs/r', $defs: { r: { $ref: '#/$defs/r' } } }]) {
      expect(() => schemaStructure(schema)).toThrow('Contrat structuré');
    }
  });
});
