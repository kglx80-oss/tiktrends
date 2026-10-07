import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { creerValidateurContrats } from '../src/prompts/contrats';
import { LONGUEUR_MAX_TEXTE } from '../src/prompts/contexte';
import type { ContexteTache, PackPrompts, SortieTache } from '../src/prompts/types';

const DOSSIER = join(__dirname, '../../../../docs/studios-v2');
const lire = (f: string) => JSON.parse(readFileSync(join(DOSSIER, f), 'utf8')) as unknown;
const schema = lire('03-CONTRATS.schema.json') as Record<string, unknown> & { $defs: Record<string, any> };
const pack = lire('02-PROMPTS.json') as PackPrompts;
const exemples = lire('08-EXEMPLES-CONTRATS.json') as { cases: Array<Record<string, any> & { templateKey: string }> };

const validateur = creerValidateurContrats(schema, pack.templates);

describe('contrats · compilation unique du schéma 2020-12', () => {
  it('compile le schéma et résout les 44 références des 22 templates', () => {
    expect(validateur.schemaId).toBe('urn:tiktrends:studios:contracts:1.0.0');
    expect(validateur.defs.size).toBe(54);
    for (const t of pack.templates) {
      expect(validateur.validerEntree(t.key, null).ok, t.key).toBe(false);
      expect(validateur.validerSortie(t.key, null).ok, t.key).toBe(false);
    }
  });

  it('refuse un template inconnu au lieu de valider à vide', () => {
    expect(validateur.validerSortie('inconnu.tache', {})).toMatchObject({ ok: false, code: 'TEMPLATE_INCONNU' });
  });

  it('applique les formats (date-time du devis)', () => {
    const devis = { id: 'q', tenantId: 't', inputHash: 'h', impactPlanHash: 'i', projectVersionId: 'p', promptReleaseId: 'r', pricingVersion: 'v', expiresAt: '2026-10-07T12:00:00Z', maximumCredits: 1, lines: [] };
    expect(validateur.validerDefinition('Quote', devis).ok).toBe(true);
    expect(validateur.validerDefinition('Quote', { ...devis, expiresAt: 'demain' })).toMatchObject({ ok: false, erreurs: [expect.objectContaining({ chemin: '/expiresAt', motCle: 'format' })] });
  });
});

describe('contrats · tous les exemples de 08-EXEMPLES-CONTRATS.json (PROMPT-02)', () => {
  it('couvre les 22 templates, dans l’ordre du pack', () => {
    expect(exemples.cases.map((c) => c.templateKey)).toEqual(pack.templates.map((t) => t.key));
  });

  for (const c of exemples.cases) {
    describe(c.templateKey, () => {
      it('accepte l’entrée, la sortie ready et la sortie blocked', () => {
        expect(validateur.validerEntree(c.templateKey, c.inputExample)).toEqual({ ok: true });
        expect(validateur.validerSortie(c.templateKey, c.readyOutputShapeExample)).toEqual({ ok: true });
        expect(validateur.validerSortie(c.templateKey, c.blockedOutputExample)).toEqual({ ok: true });
      });

      it('rejette la sortie invalide pour le champ inconnu, et seulement pour lui', () => {
        const r = validateur.validerSortie(c.templateKey, c.invalidOutputExample);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.erreurs).toEqual([expect.objectContaining({ chemin: '', motCle: 'additionalProperties', propriete: 'unexpectedField' })]);
      });

      it('rejette l’entrée invalide pour taskInputs manquant, et seulement pour lui', () => {
        const r = validateur.validerEntree(c.templateKey, c.invalidInputExample);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.erreurs).toEqual([expect.objectContaining({ chemin: '', motCle: 'required', propriete: 'taskInputs' })]);
      });

      it('rejette ready avec result null, et blocked avec un résultat ou sans question', () => {
        const ready = c.readyOutputShapeExample as SortieTache;
        const nul = validateur.validerSortie(c.templateKey, { ...ready, result: null });
        expect(nul.ok).toBe(false);
        if (!nul.ok) expect(nul.erreurs.some((e) => e.chemin === '/result')).toBe(true);
        expect(validateur.validerSortie(c.templateKey, { ...ready, questions: ['Pourquoi ?'] }).ok).toBe(false);
        expect(validateur.validerSortie(c.templateKey, { ...c.blockedOutputExample, result: ready.result }).ok).toBe(false);
        expect(validateur.validerSortie(c.templateKey, { ...c.blockedOutputExample, questions: [] }).ok).toBe(false);
      });

      it('rejette un champ requis absent du résultat', () => {
        const ready = c.readyOutputShapeExample as SortieTache;
        const premier = Object.keys(ready.result!)[0]!;
        const { [premier]: _retire, ...reste } = ready.result!;
        expect(validateur.validerSortie(c.templateKey, { ...ready, result: reste }).ok).toBe(false);
      });
    });
  }
});

describe('contrats · les types écrits à la main suivent le schéma', () => {
  it('ContexteTache a exactement les champs requis de $defs/Context', () => {
    const champs: Array<keyof ContexteTache> = [
      'tenantId', 'brandId', 'projectVersionId', 'language', 'authorizedSourceIds', 'facts', 'invariants', 'references', 'selectionIds',
      'allowedPaths', 'knowledgeVersionIds', 'historySummary', 'sourceExcerpts', 'knowledgeExcerpts', 'resolvedDocuments', 'allocatedIds', 'mediaBindings',
    ];
    expect([...schema.$defs.Context.required].sort()).toEqual([...champs].sort());
  });

  it('SortieTache a exactement l’enveloppe des 22 sorties', () => {
    const champs: Array<keyof SortieTache> = ['status', 'questions', 'warnings', 'evidenceIds', 'result'];
    for (const t of pack.templates) {
      const nom = t.outputSchemaRef.split('/').pop()!;
      expect([...schema.$defs[nom].required].sort(), nom).toEqual([...champs].sort());
    }
  });

  it('LONGUEUR_MAX_TEXTE est le maxLength du schéma pour l’historique et les extraits', () => {
    const p = schema.$defs.Context.properties;
    expect(p.historySummary.maxLength).toBe(LONGUEUR_MAX_TEXTE);
    expect(p.sourceExcerpts.items.properties.text.maxLength).toBe(LONGUEUR_MAX_TEXTE);
    expect(p.knowledgeExcerpts.items.properties.text.maxLength).toBe(LONGUEUR_MAX_TEXTE);
  });
});
