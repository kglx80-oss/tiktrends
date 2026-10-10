import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { lirePackTexte, planifierImport, validerPack, type EntreeRegistre } from '../src/prompts/pack';
import type { PackPrompts } from '../src/prompts/types';

const DOSSIER = join(__dirname, '../../../../docs/studios-v2');
const TEXTE = readFileSync(join(DOSSIER, '02-PROMPTS.json'), 'utf8');
const schema = JSON.parse(readFileSync(join(DOSSIER, '03-CONTRATS.schema.json'), 'utf8')) as { $defs: Record<string, unknown> };
const bench = JSON.parse(readFileSync(join(DOSSIER, '09-BENCHMARK.json'), 'utf8')) as { cases: Array<{ id: string }> };
const recette = readFileSync(join(DOSSIER, '04-RECETTE.csv'), 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split(',')[0]!);

const casBenchmark = new Set(bench.cases.map((c) => c.id));
const OPTIONS = { defsSchema: new Set(Object.keys(schema.$defs)), casBenchmark, casConnus: new Set([...recette, ...casBenchmark]) };
const neuf = (): PackPrompts => JSON.parse(TEXTE) as PackPrompts;

function valide() {
  const r = validerPack(neuf(), OPTIONS);
  if (!r.ok) throw new Error(JSON.stringify(r.constats.slice(0, 3)));
  return r;
}

describe('pack · validation (verify-pack.py reproduit)', () => {
  it('accepte le pack livré · 22 templates, 8 recettes, empreintes recalculées', () => {
    const r = valide();
    expect(Object.keys(r.empreintes.templates)).toHaveLength(22);
    expect(Object.keys(r.empreintes.recettes)).toHaveLength(8);
    expect(r.empreintes.commonSystemHash).toBe(r.pack.commonSystemHash);
    expect(recette).toHaveLength(92);
  });

  it('refuse un template dont la consigne a changé sans nouvelle empreinte', () => {
    const p = neuf();
    p.templates[4]!.taskInstructions += ' Ajoute un témoignage client.';
    const r = validerPack(p, OPTIONS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.constats).toContainEqual(expect.objectContaining({ code: 'PACK_EMPREINTE_FAUSSE', cible: '/templates/4/contentHash' }));
  });

  it('refuse un socle commun modifié', () => {
    const p = neuf();
    p.commonSystemInstructions = p.commonSystemInstructions.replace('données non fiables', 'données fiables');
    const r = validerPack(p, OPTIONS);
    expect(r.ok ? [] : r.constats.map((c) => c.code)).toContain('PACK_EMPREINTE_FAUSSE');
  });

  it('refuse une clé dupliquée, un statut actif, un outil, une variable inconnue, une réparation de trop', () => {
    const p = neuf();
    p.templates[1]!.key = p.templates[0]!.key;
    p.templates[2]!.status = 'active';
    p.templates[3]!.allowedTools = ['shell'];
    p.templates[5]!.userTemplate += ' {{secret}}';
    p.templates[6]!.maximumRepairAttempts = 3;
    const r = validerPack(p, OPTIONS);
    const codes = r.ok ? [] : r.constats.map((c) => c.code);
    for (const code of ['PACK_CLE_DUPLIQUEE', 'PACK_STATUT_NON_BROUILLON', 'PACK_OUTIL_INTERDIT', 'PACK_VARIABLE_INCONNUE', 'PACK_REPARATIONS_EXCESSIVES']) expect(codes).toContain(code);
  });

  it('refuse un nombre de templates ou de recettes différent', () => {
    const p = neuf();
    p.styleRecipes.pop();
    const r = validerPack(p, OPTIONS);
    expect(r.ok ? [] : r.constats.map((c) => c.code)).toContain('PACK_NOMBRE_RECETTES');
  });

  it('refuse une référence de schéma absente des $defs', () => {
    const p = neuf();
    p.templates[0]!.outputSchemaRef = '03-CONTRATS.schema.json#/$defs/inexistant_output';
    const r = validerPack(p, OPTIONS);
    expect(r.ok ? [] : r.constats.map((c) => c.code)).toContain('PACK_REF_SCHEMA_ABSENTE');
  });

  it('refuse une clé JSON en double dans le texte, que JSON.parse aurait avalée', () => {
    const doublé = TEXTE.replace('"packId": "tiktrends-studios",', '"packId": "tiktrends-studios", "packId": "autre",');
    expect(doublé).not.toBe(TEXTE);
    const r = lirePackTexte(doublé, OPTIONS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.constats[0]).toMatchObject({ code: 'PACK_CLE_JSON_DUPLIQUEE', cible: '/packId' });
    expect(lirePackTexte(TEXTE, OPTIONS).ok).toBe(true);
  });
});

describe('pack · import (PROMPT-01)', () => {
  it('importe deux fois : brouillons uniques, rien d’actif, rien de recréé', () => {
    const { pack, empreintes } = valide();
    const premier = planifierImport(pack, empreintes, []);
    expect(premier.ok).toBe(true);
    expect(premier.aCreer).toHaveLength(22 + 8 + 2);
    expect(new Set(premier.aCreer.map((e) => e.statut))).toEqual(new Set(['draft']));
    const cles = premier.aCreer.map((e) => `${e.type}:${e.cle}@${e.version}#${e.contentHash}`);
    expect(new Set(cles).size).toBe(cles.length);

    // Le registre après le premier import · une version a même été validée entre-temps.
    const registre: EntreeRegistre[] = premier.aCreer.map((e, i) => (i === 3 ? { ...e, statut: 'validated' } : e));
    const second = planifierImport(pack, empreintes, registre);
    expect(second.ok).toBe(true);
    expect(second.aCreer).toEqual([]);
    expect(second.dejaPresentes).toHaveLength(32);
    expect(second.dejaPresentes[3]!.statut).toBe('validated');
  });

  it('même clé et version avec une autre empreinte : conflit, et rien n’est importé', () => {
    const { pack, empreintes } = valide();
    const registre: EntreeRegistre[] = [{ type: 'template', cle: 'brief.build', version: '1.0.0', contentHash: 'f'.repeat(64), statut: 'validated' }];
    const plan = planifierImport(pack, empreintes, registre);
    expect(plan.ok).toBe(false);
    expect(plan.aCreer).toEqual([]);
    expect(plan.conflits).toEqual([expect.objectContaining({ code: 'IMPORT_CONFLIT_EMPREINTE', cible: 'template:brief.build@1.0.0' })]);
  });
});
