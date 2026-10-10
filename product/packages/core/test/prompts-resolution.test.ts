import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { POLITIQUE_SERVEUR } from '../src/prompts/compilation';
import { empreinteContenu } from '../src/prompts/empreinte';
import { empreinteRelease, type Octroi, type Release } from '../src/prompts/release';
import { controlerOverride, couchesResolution, ORDRE_RESOLUTION, resoudreTemplate, type Override } from '../src/prompts/resolution';
import type { ContexteTache, PackPrompts, TemplatePrompt } from '../src/prompts/types';

const DOSSIER = join(__dirname, '../../../../docs/studios-v2');
const pack = JSON.parse(readFileSync(join(DOSSIER, '02-PROMPTS.json'), 'utf8')) as PackPrompts;
const contenus = new Map<string, TemplatePrompt>(pack.templates.map((t) => [`${t.key}@${t.version}`, t]));
const brief = pack.templates.find((t) => t.key === 'brief.build')!;

const release: Release = {
  id: 'rel-G', portee: { niveau: 'plateforme' }, statut: 'active',
  hash: empreinteRelease({ commonSystemInstructions: pack.commonSystemInstructions, rendering: pack.rendering, templates: pack.templates, styleRecipes: pack.styleRecipes }),
  templates: pack.templates.map((t) => ({ cle: t.key, version: t.version, contentHash: t.contentHash })),
  recettes: [], socle: { cle: 'commonSystemInstructions', version: '1.0.0', contentHash: pack.commonSystemHash }, rendu: { cle: 'rendering', version: '1.0.0', contentHash: '' },
};

/** Le propriétaire ouvre `taskInstructions` de brief.build aux personnalisations · le pack n'ouvre rien. */
const OUVERTS = { 'brief.build': ['taskInstructions'] };

const override = (sur: Partial<Override>): Override => ({
  id: 'ov', portee: { niveau: 'espace', espaceId: 'esp-1' }, templateKey: 'brief.build', baseVersion: brief.version, baseContentHash: brief.contentHash,
  champs: { taskInstructions: `${brief.taskInstructions} Ton tutoiement.` }, statut: 'approuve', origine: 'admin', ...sur,
});

const resoudre = (overrides: Override[], champsExtensibles: Record<string, string[]> = OUVERTS, marqueId = 'm-1', espaceId = 'esp-1') =>
  resoudreTemplate({ templateKey: 'brief.build', espaceId, marqueId, release, contenus, overrides, champsExtensibles });

describe('résolution de portée · marque, sinon espace, sinon global', () => {
  const espace = override({ id: 'ov-espace' });
  const marque = override({ id: 'ov-marque', portee: { niveau: 'marque', espaceId: 'esp-1', marqueId: 'm-1' }, champs: { taskInstructions: `${brief.taskInstructions} Ton vouvoiement.` } });

  it('sans override : le template global, identique à la release', () => {
    const r = resoudre([]);
    expect(r).toMatchObject({ ok: true, template: brief, trace: { niveau: 'plateforme', overrideId: null, contentHash: brief.contentHash, releaseId: 'rel-G' } });
  });
  it('override marque approuvé : il gagne sur l’espace', () => {
    const r = resoudre([espace, marque]);
    expect(r).toMatchObject({ ok: true, trace: { niveau: 'marque', overrideId: 'ov-marque' } });
    if (r.ok) {
      expect(r.template.taskInstructions.endsWith('Ton vouvoiement.')).toBe(true);
      expect(r.template.contentHash).toBe(empreinteContenu(r.template as unknown as Record<string, unknown>));
      expect(r.template.contentHash).not.toBe(brief.contentHash);
    }
  });
  it('autre marque du même espace : l’override d’espace', () => {
    expect(resoudre([espace, marque], OUVERTS, 'm-2')).toMatchObject({ ok: true, trace: { niveau: 'espace', overrideId: 'ov-espace' } });
  });
  it('autre espace : jamais l’override d’un autre espace, même avec la même marque', () => {
    expect(resoudre([espace, marque], OUVERTS, 'm-1', 'esp-2')).toMatchObject({ ok: true, trace: { niveau: 'plateforme', overrideId: null } });
  });
  it('un override issu d’une source ou d’une conversation est écarté, et la trace le dit', () => {
    const r = resoudre([override({ id: 'ov-source', origine: 'source' })]);
    expect(r).toMatchObject({ ok: true, trace: { niveau: 'plateforme', overrideId: null, ecartes: [expect.objectContaining({ code: 'OVERRIDE_ORIGINE_INTERDITE' })] } });
  });
  it('un champ non déclaré extensible n’est jamais surchargé · le pack n’en déclare aucun', () => {
    expect(resoudre([espace], {})).toMatchObject({ ok: true, trace: { niveau: 'plateforme', ecartes: [expect.objectContaining({ code: 'CHAMP_NON_EXTENSIBLE' })] } });
    const contrat = override({ id: 'ov-contrat', champs: { outputSchemaRef: '03-CONTRATS.schema.json#/$defs/text_write_output' } });
    expect(resoudre([contrat], { 'brief.build': ['outputSchemaRef'] })).toMatchObject({ ok: true, trace: { niveau: 'plateforme', ecartes: [expect.objectContaining({ code: 'CHAMP_NON_EXTENSIBLE' })] } });
  });
  it('un override conçu pour une autre version est périmé, donc écarté', () => {
    expect(resoudre([override({ baseVersion: '0.9.0' })])).toMatchObject({ ok: true, trace: { niveau: 'plateforme', ecartes: [expect.objectContaining({ code: 'OVERRIDE_PERIME' })] } });
  });
  it('deux overrides approuvés au même niveau : ambigu, refusé', () => {
    expect(resoudre([espace, override({ id: 'ov-2' })])).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'OVERRIDE_AMBIGU' })] });
  });
  it('sans release active ou hors release : aucun prompt de repli', () => {
    expect(resoudreTemplate({ templateKey: 'brief.build', espaceId: 'esp-1', marqueId: 'm-1', release: undefined, contenus, overrides: [], champsExtensibles: {} })).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'RELEASE_ACTIVE_ABSENTE' })] });
    expect(resoudreTemplate({ templateKey: 'inconnu', espaceId: 'esp-1', marqueId: 'm-1', release, contenus, overrides: [], champsExtensibles: {} })).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'OPERATION_HORS_RELEASE' })] });
    expect(resoudreTemplate({ templateKey: 'brief.build', espaceId: 'esp-1', marqueId: 'm-1', release: { ...release, statut: 'staged' }, contenus, overrides: [], champsExtensibles: {} })).toMatchObject({ ok: false });
  });
});

describe('overrides · création et approbation', () => {
  const ESPACE: Octroi[] = [{ permission: 'prompt.draft', portee: { niveau: 'espace', espaceId: 'esp-1' } }, { permission: 'prompt.publish', portee: { niveau: 'espace', espaceId: 'esp-1' } }];
  it('un admin d’espace propose sur SA portée, pas sur un autre espace ni la plateforme', () => {
    expect(controlerOverride({ override: override({}), action: 'proposer', champsExtensibles: OUVERTS, octrois: ESPACE, template: brief })).toEqual([]);
    expect(controlerOverride({ override: override({ portee: { niveau: 'espace', espaceId: 'esp-2' } }), action: 'proposer', champsExtensibles: OUVERTS, octrois: ESPACE, template: brief }).map((c) => c.code)).toEqual(['FORBIDDEN']);
    expect(controlerOverride({ override: override({ portee: { niveau: 'plateforme' } }), action: 'approuver', champsExtensibles: OUVERTS, octrois: ESPACE, template: brief }).map((c) => c.code)).toEqual(['OVERRIDE_PORTEE', 'FORBIDDEN']);
  });
  it('une conversation ou une source ne crée jamais d’override', () => {
    expect(controlerOverride({ override: override({ origine: 'conversation' }), action: 'proposer', champsExtensibles: OUVERTS, octrois: ESPACE, template: brief }).map((c) => c.code)).toEqual(['OVERRIDE_ORIGINE_INTERDITE']);
  });
  it('champ hors liste, variable glissée dans le texte', () => {
    expect(controlerOverride({ override: override({ champs: { title: 'Brief maison' } }), action: 'proposer', champsExtensibles: OUVERTS, octrois: ESPACE, template: brief }).map((c) => c.code)).toEqual(['CHAMP_NON_EXTENSIBLE']);
    expect(controlerOverride({ override: override({ champs: { taskInstructions: 'Utilise {{secret}}' } }), action: 'proposer', champsExtensibles: OUVERTS, octrois: ESPACE, template: brief }).map((c) => c.code)).toEqual(['VARIABLE_HORS_GABARIT']);
  });
});

describe('trace · couches dans l’ordre du cahier', () => {
  it('politique fixe → release → contraintes → connaissances → faits → références → demande', () => {
    const ctx: ContexteTache = {
      tenantId: 't', brandId: 'b', projectVersionId: 'pv', language: 'fr', authorizedSourceIds: [], facts: [{ id: 'f1', claim: 'c', sourceIds: [], kind: 'declared', confidence: 'low' }],
      invariants: ['i'], references: [], selectionIds: [], allowedPaths: [], knowledgeVersionIds: ['k1'], historySummary: '', sourceExcerpts: [], knowledgeExcerpts: [], resolvedDocuments: [], allocatedIds: [], mediaBindings: [],
    };
    const r = resoudre([]);
    if (!r.ok) throw new Error('résolution');
    const couches = couchesResolution({ politique: POLITIQUE_SERVEUR, trace: r.trace, entree: { context: ctx, taskInputs: { request: 'x' } } });
    expect(couches.map((c) => c.couche)).toEqual([...ORDRE_RESOLUTION]);
    expect(couches[1]!.ids).toEqual(['rel-G', 'brief.build@1.0.0']);
    expect(couches[3]!.ids).toEqual(['k1']);
    expect(couches[4]!.ids).toEqual(['f1']);
  });
});
