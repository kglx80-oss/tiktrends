import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { allouerContexte, compterJetonsParDefaut, MARQUE_DEBUT_OMIS, MARQUE_FIN_TRONQUEE } from '../src/prompts/contexte';
import { creerValidateurContrats } from '../src/prompts/contrats';
import { jsonCanonique } from '../src/prompts/empreinte';
import type { ContexteTache, EntreeTache, PackPrompts } from '../src/prompts/types';

const DOSSIER = join(__dirname, '../../../../docs/studios-v2');
const lire = (f: string) => JSON.parse(readFileSync(join(DOSSIER, f), 'utf8')) as unknown;
const pack = lire('02-PROMPTS.json') as PackPrompts;
const validateur = creerValidateurContrats(lire('03-CONTRATS.schema.json') as Record<string, unknown>, pack.templates);

const INVARIANTS = ['Lunettes Azur bleues ET bandeau bleu présents', 'Prix 49 € inchangé', 'Aucun témoignage inventé'];
const DEBUT = 'Au début : le produit est la lunette Azur bleue, avec son bandeau. ';
const HISTORIQUE = DEBUT + 'Échange suivant sur le décor et la lumière. '.repeat(500) + 'Dernier message : passer au format 9:16.';

function entree(sur: Partial<ContexteTache> = {}): EntreeTache {
  return {
    context: {
      tenantId: 't', brandId: 'b', projectVersionId: 'pv', language: 'fr', authorizedSourceIds: ['s1', 's2'],
      facts: [{ id: 'f1', claim: 'Monture en acétate', sourceIds: ['s1'], kind: 'observed', confidence: 'high' }],
      invariants: INVARIANTS, references: [], selectionIds: [], allowedPaths: [], knowledgeVersionIds: ['k1'],
      historySummary: HISTORIQUE,
      sourceExcerpts: [
        { sourceId: 's1', version: '1', text: 'Avis A · '.repeat(300), trust: 'untrusted_data' },
        { sourceId: 's2', version: '1', text: 'Avis B · '.repeat(300), trust: 'untrusted_data' },
      ],
      knowledgeExcerpts: [{ sourceId: 'k', version: 'k1', text: 'Méthode · '.repeat(300), trust: 'untrusted_data' }],
      resolvedDocuments: [], allocatedIds: [], mediaBindings: [], ...sur,
    },
    taskInputs: { request: 'Nouveau décor', hypothesisId: null, selectedReferences: [], requestedFormats: ['9:16'] },
  };
}

const tailleObligatoire = (e: EntreeTache) => compterJetonsParDefaut(jsonCanonique({ context: { ...e.context, sourceExcerpts: [], knowledgeExcerpts: [], historySummary: '' }, taskInputs: e.taskInputs }, 'js'));

describe('contexte · PROMPT-11 · historique long, invariant important au début', () => {
  it('garde invariants et faits intacts, tronque l’historique en le disant, tient dans le budget et le schéma', () => {
    const e = entree();
    const obligatoire = tailleObligatoire(e);
    const sources = compterJetonsParDefaut(jsonCanonique(e.context.sourceExcerpts, 'js')) + compterJetonsParDefaut(jsonCanonique(e.context.knowledgeExcerpts, 'js'));
    const budget = obligatoire + 500 + sources + 400;
    const r = allouerContexte(e, { budgetJetons: budget, reserveJetons: 500 });
    if (!r.ok) throw new Error(r.code);
    expect(r.entree.context.invariants).toEqual(INVARIANTS);
    expect(r.entree.context.facts).toEqual(e.context.facts);
    expect(r.entree.context.sourceExcerpts).toEqual(e.context.sourceExcerpts);
    const h = r.entree.context.historySummary;
    expect(h.startsWith(MARQUE_DEBUT_OMIS)).toBe(true);
    expect(h.endsWith('Dernier message : passer au format 9:16.')).toBe(true);
    expect(h).not.toContain(DEBUT);
    expect(r.rapport.troncature).toBe(true);
    expect(r.rapport.decisions.find((d) => d.champ === 'historySummary')).toMatchObject({ statut: 'tronque' });
    expect(r.rapport.jetonsUtilises).toBeLessThanOrEqual(budget);
    expect(validateur.validerEntree('brief.build', r.entree)).toEqual({ ok: true });
  });

  it('budget insuffisant pour les obligatoires : blocked, postes chiffrés, proposition de simplification', () => {
    const lourd = entree({ resolvedDocuments: [{ id: 'doc', version: '1', schemaKey: 'Brief', content: { texte: 'x'.repeat(20000) }, sha256: 'a'.repeat(64) }] });
    const r = allouerContexte(lourd, { budgetJetons: 3000, reserveJetons: 500 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('CONTEXT_BUDGET_INSUFFICIENT');
    expect(r.manqueJetons).toBe(tailleObligatoire(lourd) + 500 - 3000);
    expect(r.postes[0]).toMatchObject({ champ: 'resolvedDocuments' });
    expect(r.constats[0]!.message).toContain('Simplifier');
  });

  it('priorité : sources, puis connaissances, puis historique · rien d’écarté sans décision consignée', () => {
    const e = entree();
    const budget = tailleObligatoire(e) + 500 + compterJetonsParDefaut(jsonCanonique(e.context.sourceExcerpts, 'js')) + 200;
    const r = allouerContexte(e, { budgetJetons: budget, reserveJetons: 500 });
    if (!r.ok) throw new Error(r.code);
    expect(r.rapport.decisions.map((d) => [d.champ, d.statut])).toEqual([
      ['sourceExcerpts', 'complet'], ['sourceExcerpts', 'complet'], ['knowledgeExcerpts', 'tronque'], ['historySummary', 'exclu'],
    ]);
    expect(r.entree.context.knowledgeExcerpts[0]!.text.endsWith(MARQUE_FIN_TRONQUEE)).toBe(true);
    expect(r.entree.context.historySummary).toBe('');
    expect(r.rapport.jetonsUtilises).toBeLessThanOrEqual(budget);
  });

  it('un compteur non additif ne fait jamais dépasser le budget', () => {
    const e = entree();
    const quadratique = (t: string) => Math.ceil((t.length / 60) ** 2 / 40) + 1;
    const budget = quadratique(jsonCanonique({ context: { ...e.context, sourceExcerpts: [], knowledgeExcerpts: [], historySummary: '' }, taskInputs: e.taskInputs }, 'js')) + 2000;
    const r = allouerContexte(e, { budgetJetons: budget, reserveJetons: 0, compter: quadratique });
    if (!r.ok) throw new Error(r.code);
    expect(quadratique(jsonCanonique(r.entree, 'js'))).toBeLessThanOrEqual(budget);
    expect(r.entree.context.invariants).toEqual(INVARIANTS);
  });

  it('ne modifie pas l’entrée reçue', () => {
    const e = entree();
    const avant = JSON.stringify(e);
    allouerContexte(e, { budgetJetons: tailleObligatoire(e) + 600, reserveJetons: 500 });
    expect(JSON.stringify(e)).toBe(avant);
  });
});
