import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { creerValidateurContrats } from '../src/prompts/contrats';
import { controlerEntree, controlerSortie, defautChemin, evaluerSortie, validateurDocumentsParDefinitions, type OptionsSemantiques } from '../src/prompts/semantique';
import type { ContexteTache, EntreeTache, PackPrompts, SortieTache } from '../src/prompts/types';

const DOSSIER = join(__dirname, '../../../../docs/studios-v2');
const lire = (f: string) => JSON.parse(readFileSync(join(DOSSIER, f), 'utf8')) as unknown;
const pack = lire('02-PROMPTS.json') as PackPrompts;
const validateur = creerValidateurContrats(lire('03-CONTRATS.schema.json') as Record<string, unknown>, pack.templates);

const SHA = (c: string) => c.repeat(64);
const OPTIONS: OptionsSemantiques = { validerDocument: (k) => (k === 'Brief' || k === 'Concept' || k === 'Shot' ? 'ok' : 'inconnu') };

function contexte(sur: Partial<ContexteTache> = {}): ContexteTache {
  return {
    tenantId: 'tenant-1', brandId: 'marque-1', projectVersionId: 'pv-3', language: 'fr',
    authorizedSourceIds: ['src-avis'],
    facts: [{ id: 'fait-1', claim: 'Monture en acétate', sourceIds: ['src-avis'], kind: 'observed', confidence: 'high' }],
    invariants: ['Lunettes bleues et bandeau bleu présents', 'Prix 49 € inchangé'],
    references: [{ assetId: 'asset-lunettes', assetVersion: 'v2', sha256: SHA('a'), role: 'product', scope: 'product', allowedChanges: ['décor'], requiredComponents: ['lunettes', 'bandeau'] }],
    selectionIds: ['plan-2'],
    allowedPaths: ['/shots/plan-2/wardrobe'],
    knowledgeVersionIds: [], historySummary: '',
    sourceExcerpts: [{ sourceId: 'src-avis', version: '1', text: 'Très légères.', trust: 'untrusted_data' }],
    knowledgeExcerpts: [],
    resolvedDocuments: [
      { id: 'brief-1', version: '1', schemaKey: 'Brief', content: { texts: ['Hook'] }, sha256: SHA('b') },
      { id: 'brief-muet', version: '1', schemaKey: 'Brief', content: { texts: [] }, sha256: SHA('c') },
      { id: 'concept-1', version: '1', schemaKey: 'Concept', content: {}, sha256: SHA('d') },
      { id: 'plan-1', version: '1', schemaKey: 'Shot', content: {}, sha256: SHA('e') },
    ],
    allocatedIds: [
      { id: 'concept-a', entityType: 'concept', ordinal: 0 }, { id: 'concept-b', entityType: 'concept', ordinal: 1 },
      { id: 'fait-n1', entityType: 'fact', ordinal: 0 }, { id: 'plan-n1', entityType: 'shot', ordinal: 0 }, { id: 'plan-n2', entityType: 'shot', ordinal: 1 },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `lot-${i}`, entityType: 'batch_item' as const, ordinal: i })),
    ],
    mediaBindings: [],
    ...sur,
  };
}

const ready = (result: Record<string, unknown>, evidenceIds: string[] = []): SortieTache => ({ status: 'ready', questions: [], warnings: [], evidenceIds, result });

/** Codes sémantiques d'une sortie · après avoir vérifié qu'elle PASSE le schéma. */
function codes(key: string, entree: EntreeTache, sortie: SortieTache, options: OptionsSemantiques = OPTIONS): string[] {
  expect(validateur.validerEntree(key, entree), `${key} · entrée hors schéma`).toEqual({ ok: true });
  expect(validateur.validerSortie(key, sortie), `${key} · sortie hors schéma`).toEqual({ ok: true });
  return controlerSortie(key, entree, sortie, options).map((c) => c.code);
}

describe('sémantique · PROMPT-03 · source inexistante (JSON valide, rejet quand même)', () => {
  const entree: EntreeTache = { context: contexte(), taskInputs: { sourceIds: ['src-avis'], declaredFacts: [] } };
  const extraction = (sourceIds: string[]) => ready({ facts: [{ id: 'fait-n1', claim: 'Légères', sourceIds, kind: 'observed', confidence: 'medium' }], tone: 'direct', audiences: [], objections: [], missingEvidence: [] });

  it('accepte un fait cité sur une source fournie', () => {
    expect(codes('brand.extract', entree, extraction(['src-avis']))).toEqual([]);
  });
  it('rejette un fait cité sur une source inventée, avec la cible exacte', () => {
    const c = controlerSortie('brand.extract', entree, extraction(['src-inventee']), OPTIONS);
    expect(validateur.validerSortie('brand.extract', extraction(['src-inventee'])).ok).toBe(true);
    expect(c).toEqual([expect.objectContaining({ code: 'SOURCE_INEXISTANTE', cible: '/result/facts/0/sourceIds/0' })]);
  });
  it('rejette une preuve inconnue et un fait observé sans source', () => {
    expect(codes('brand.extract', entree, { ...extraction([]), evidenceIds: ['preuve-fantome'] })).toEqual(['SOURCE_INEXISTANTE', 'FAIT_SANS_SOURCE']);
  });
  it('rejette un identifiant de fait inventé', () => {
    const s = extraction(['src-avis']);
    (s.result!.facts as Array<{ id: string }>)[0]!.id = 'fait-invente';
    expect(codes('brand.extract', entree, s)).toEqual(['ID_NON_ALLOUE']);
  });
});

describe('sémantique · PROMPT-03 · modification protégée', () => {
  const entree: EntreeTache = { context: contexte(), taskInputs: { baseVersion: 'pv-3', request: 'Tenue verte au plan 2', allowedPaths: ['/shots/plan-2/wardrobe'], selectedIds: ['plan-2'] } };
  const patch = (path: string, op = 'replace', newValue: unknown = 'vert sapin') => ready({ baseVersion: 'pv-3', changes: [{ path, newValue, reason: 'demande', op }], preservedIds: ['plan-1'], impactSummary: 'Plan 2 seulement' });

  it('accepte un patch sur le chemin autorisé', () => {
    expect(codes('document.patch', entree, patch('/shots/plan-2/wardrobe/color'))).toEqual([]);
  });
  it('rejette un chemin hors allowedPaths, de prototype, positionnel, ou la racine', () => {
    expect(codes('document.patch', entree, patch('/shots/plan-1/wardrobe'))).toContain('CHEMIN_NON_AUTORISE');
    expect(codes('document.patch', entree, patch('/shots/plan-2/wardrobe/__proto__/polluted'))).toEqual(['CHEMIN_INTERDIT']);
    expect(codes('document.patch', entree, patch('/shots/plan-2/wardrobe/0'))).toEqual(['CHEMIN_POSITIONNEL']);
    expect(defautChemin('', ['/shots/plan-2/wardrobe'])).toBe('CHEMIN_INVALIDE');
    expect(defautChemin('/shots/plan-2/wardrobeX', ['/shots/plan-2/wardrobe'])).toBe('CHEMIN_NON_AUTORISE');
  });
  it('rejette remove avec une valeur, une valeur porteuse de script ou de clé de prototype, une version de base changée', () => {
    expect(controlerSortie('document.patch', entree, patch('/shots/plan-2/wardrobe', 'remove', 'x'), OPTIONS).map((c) => c.code)).toEqual(['SUPPRESSION_AVEC_VALEUR']);
    expect(codes('document.patch', entree, patch('/shots/plan-2/wardrobe', 'replace', '<script>x</script>'))).toEqual(['VALEUR_ACTIVE_INTERDITE']);
    expect(codes('document.patch', entree, patch('/shots/plan-2/wardrobe', 'replace', JSON.parse('{"__proto__":{"admin":true}}')))).toEqual(['VALEUR_CLE_INTERDITE']);
    expect(codes('document.patch', entree, { ...patch('/shots/plan-2/wardrobe'), result: { ...patch('/shots/plan-2/wardrobe').result!, baseVersion: 'pv-2' } })).toEqual(['VERSION_DE_BASE_ALTEREE']);
  });
  it('accepte replace avec null (valeur conservée, pas suppression)', () => {
    expect(codes('document.patch', entree, patch('/shots/plan-2/wardrobe', 'replace', null))).toEqual([]);
  });

  const brief = (sur: Record<string, unknown> = {}) => ready({
    objective: 'Vendre', audience: 'Actifs', hypothesisId: null, testedVariable: 'décor', facts: [], variables: ['décor'], composition: 'centrée', styleIntent: 'clair', texts: [], formats: ['1:1'], exclusions: [],
    invariants: ['Lunettes bleues et bandeau bleu présents', 'Prix 49 € inchangé'],
    references: [{ assetId: 'asset-lunettes', assetVersion: 'v2', sha256: SHA('a'), role: 'product', scope: 'product', allowedChanges: ['décor'], requiredComponents: ['lunettes', 'bandeau'] }],
    ...sur,
  });
  const entreeBrief: EntreeTache = { context: contexte(), taskInputs: { request: 'Nouveau décor', hypothesisId: null, selectedReferences: contexte().references, requestedFormats: ['1:1'] } };

  it('accepte un brief qui garde invariants, référence et composants', () => {
    expect(codes('brief.build', entreeBrief, brief())).toEqual([]);
  });
  it('rejette un invariant perdu, une référence ré-empreintée, un composant retiré', () => {
    expect(codes('brief.build', entreeBrief, brief({ invariants: ['Lunettes bleues et bandeau bleu présents'] }))).toEqual(['INVARIANT_PERDU']);
    const autre = { ...contexte().references[0]!, sha256: SHA('f') };
    expect(codes('brief.build', entreeBrief, brief({ references: [autre] }))).toEqual(['EMPREINTE_INVENTEE', 'REFERENCE_ALTEREE']);
    const sansBandeau = { ...contexte().references[0]!, requiredComponents: ['lunettes'] };
    expect(codes('brief.build', entreeBrief, brief({ references: [sansBandeau] }))).toEqual(['COMPOSANT_RETIRE']);
    expect(codes('brief.build', entreeBrief, brief({ references: [] }))).toEqual(['REFERENCE_PERDUE']);
  });
});

describe('sémantique · règles de tâche', () => {
  it('voice.prepare · spokenText strictement égal à narrationText', () => {
    const ti = { narrationText: 'Les lunettes Azur, 49 €.', voiceId: 'voix-1', language: 'fr', pronunciations: [] };
    const entree: EntreeTache = { context: contexte(), taskInputs: ti };
    const voix = (spokenText: string) => ready({ spokenText, voiceId: 'voix-1', language: 'fr', deliveryNotes: 'posé', pronunciations: [] });
    expect(codes('voice.prepare', entree, voix('Les lunettes Azur, 49 €.'))).toEqual([]);
    expect(codes('voice.prepare', entree, voix('Les lunettes Azur, 49 € !'))).toEqual(['NARRATION_REECRITE']);
    expect(codes('voice.prepare', entree, voix('Les lunettes Azur, 49 €. '))).toEqual(['NARRATION_REECRITE']);
  });

  it('batch.plan · plafond, compte exact, pas de doublon, IDs alloués', () => {
    const entree: EntreeTache = { context: contexte(), taskInputs: { conceptIds: ['concept-1'], formats: ['1:1', '9:16'], maxOutputs: 3, testedVariable: 'hook' } };
    const ligne = (i: number, variation = `v${i}`, format = '1:1') => ({ itemId: `lot-${i}`, conceptId: 'concept-1', format, variation, preserve: ['produit'] });
    expect(codes('batch.plan', entree, ready({ items: [ligne(0), ligne(1), ligne(2, 'v2', '9:16')], count: 3 }))).toEqual([]);
    expect(codes('batch.plan', entree, ready({ items: [ligne(0), ligne(1), ligne(2), ligne(3)], count: 4 }))).toEqual(['LOT_DEPASSE']);
    expect(codes('batch.plan', entree, ready({ items: [ligne(0), ligne(1)], count: 3 }))).toEqual(['LOT_COMPTE_FAUX']);
    expect(codes('batch.plan', entree, ready({ items: [ligne(0, 'Rouge'), ligne(1, ' rouge ')], count: 2 }))).toEqual(['LOT_DOUBLON']);
    expect(codes('batch.plan', entree, ready({ items: [{ ...ligne(0), itemId: 'lot-invente' }], count: 1 }))).toEqual(['ID_NON_ALLOUE']);
  });

  it('storyboard.plan · mode sans texte ⇒ onScreenText vide ; pas de lipsync en voix off', () => {
    const plan = (onScreenText: string[], speechMode = 'voiceover') => ({ shotId: 'plan-n1', purpose: 'accroche', subject: 'lunettes', action: 'posées', framing: 'serré', camera: 'fixe', lighting: 'douce', environment: 'bureau', referenceIds: ['asset-lunettes'], narration: 'Voici Azur.', onScreenText, speechMode, estimatedDurationMs: 3000 });
    const entree = (briefId: string): EntreeTache => ({ context: contexte(), taskInputs: { briefId, targetDurationMs: 6000, shotCount: 2, speechMode: 'voiceover' } });
    expect(codes('storyboard.plan', entree('brief-muet'), ready({ shots: [plan([])], estimatedTotalMs: 3000, durationCaveat: 'estimée' }))).toEqual([]);
    expect(codes('storyboard.plan', entree('brief-muet'), ready({ shots: [plan(['-20 %'])], estimatedTotalMs: 3000, durationCaveat: 'estimée' }))).toEqual(['TEXTE_EN_MODE_SANS_TEXTE']);
    expect(codes('storyboard.plan', entree('brief-1'), ready({ shots: [plan(['-20 %'])], estimatedTotalMs: 3000, durationCaveat: 'estimée' }))).toEqual([]);
    expect(codes('storyboard.plan', entree('brief-1'), ready({ shots: [plan([], 'lipsync')], estimatedTotalMs: 3000, durationCaveat: 'estimée' }))).toEqual(['LIPSYNC_NON_DEMANDE']);
    expect(codes('storyboard.plan', entree('brief-1'), ready({ shots: [plan([])], estimatedTotalMs: 8000, durationCaveat: 'estimée' }))).toEqual(['DUREE_TOTALE_INCOHERENTE']);
  });

  it('animation.compile · lipsync sans capacité attestée ⇒ bloqué avant et après appel', () => {
    const ctx = contexte({ mediaBindings: [{ bindingId: 'b0', assetId: 'cle-1', assetVersion: '1', sha256: SHA('1'), role: 'keyframe', modality: 'image', derivation: 'original', nativeAttachmentIndex: 0, coverageDescription: 'image entière' }, { bindingId: 'b1', assetId: 'audio-1', assetVersion: '1', sha256: SHA('2'), role: 'voix', modality: 'audio', derivation: 'original', nativeAttachmentIndex: 1, coverageDescription: 'piste entière' }] });
    const entree: EntreeTache = { context: ctx, taskInputs: { shotId: 'plan-1', keyframeAssetId: 'cle-1', durationMs: 4000, speechMode: 'lipsync', audioAssetId: 'audio-1' } };
    expect(controlerEntree('animation.compile', entree, OPTIONS).map((c) => c.code)).toEqual(['LIPSYNC_SANS_CAPACITE']);
    expect(controlerEntree('animation.compile', entree, { ...OPTIONS, capacites: { lipsync: true } })).toEqual([]);
    const anime = ready({ generationInstruction: 'Parle face caméra', cameraConstraints: ['fixe'], identityConstraints: ['même tenue'], audioRequired: true });
    expect(codes('animation.compile', entree, anime)).toEqual(['LIPSYNC_SANS_CAPACITE']);
    expect(codes('animation.compile', entree, anime, { ...OPTIONS, capacites: { lipsync: true } })).toEqual([]);
    expect(codes('animation.compile', entree, { status: 'blocked', questions: ['Proposer la voix off ?'], warnings: [], evidenceIds: [], result: null })).toEqual([]);
  });

  it('image.compile · chaque composant requis est protégé (F01 lunettes ET bandeau)', () => {
    const entree: EntreeTache = { context: contexte(), taskInputs: { briefId: 'brief-1', conceptId: 'concept-1', mode: 'generative_scene', referenceIds: ['asset-lunettes'], width: 1080, height: 1080 } };
    const image = (protectedComponents: string[]) => ready({ generationInstruction: 'Décor bureau', negativeConstraints: [], referenceBindings: [{ referenceId: 'asset-lunettes', role: 'product', scope: 'product' }], protectedComponents, needsDeterministicOverlay: true });
    expect(codes('image.compile', entree, image(['lunettes', 'bandeau']))).toEqual([]);
    expect(codes('image.compile', entree, image(['lunettes']))).toEqual(['COMPOSANT_NON_PROTEGE']);
  });

  it('jarvis.route · action indisponible et cible ancienne sans sélection (F21)', () => {
    const entree: EntreeTache = { context: contexte({ selectionIds: [] }), taskInputs: { message: 'Que fait Adsmap ?', availableActions: ['brief.build'], selectionId: null } };
    const route = (sur: Record<string, unknown>) => ready({ intent: 'help', targetIds: [], proposedAction: '', nextTemplateKey: '', reply: 'Adsmap suit vos tests.', ...sur });
    expect(codes('jarvis.route', entree, route({}))).toEqual([]);
    expect(codes('jarvis.route', entree, route({ nextTemplateKey: 'export.render' }))).toEqual(['ACTION_INDISPONIBLE']);
    expect(codes('jarvis.route', entree, route({ targetIds: ['projet-ancien'] }))).toEqual(['CIBLE_NON_SELECTIONNEE']);
  });

  it('concept.plan · identifiant non alloué et angles en trop', () => {
    const entree: EntreeTache = { context: contexte(), taskInputs: { briefId: 'brief-1', angleCount: 1, formats: ['1:1'] } };
    const concept = (conceptId: string, angle = 'légèreté') => ({ conceptId, angle, format: '1:1', hook: 'Oubliez-les', body: 'Monture acétate', cta: 'Voir', visualDirection: 'gros plan', claimSourceIds: ['fait-1'], changedVariable: 'angle', preservedInvariants: [] });
    expect(codes('concept.plan', entree, ready({ concepts: [concept('concept-a')] }))).toEqual([]);
    expect(codes('concept.plan', entree, ready({ concepts: [concept('concept-z')] }))).toEqual(['ID_NON_ALLOUE']);
    expect(codes('concept.plan', entree, ready({ concepts: [concept('concept-a'), concept('concept-b', 'prix')] }))).toEqual(['ANGLES_EXCEDENTAIRES']);
  });

  it('quality.visual · passed avec défaut bloquant est incohérent (F07)', () => {
    const ctx = contexte({ mediaBindings: [{ bindingId: 'b0', assetId: 'sortie-1', assetVersion: '1', sha256: SHA('3'), role: 'sortie', modality: 'image', derivation: 'original', nativeAttachmentIndex: 0, coverageDescription: 'image entière' }] });
    const entree: EntreeTache = { context: ctx, taskInputs: { outputAssetIds: ['sortie-1'], referenceIds: ['asset-lunettes'], criteria: ['produit'] } };
    const qa = (verdict: string) => ready({ verdict, issues: [{ code: 'PRODUIT_REMPLACE', severity: 'blocking', targetId: 'sortie-1', observation: 'boîte', expected: 'lunettes', evidenceIds: ['b0'] }], unverifiable: [], summary: 'Produit absent' });
    expect(codes('quality.visual', entree, qa('rejected'))).toEqual([]);
    expect(codes('quality.visual', entree, qa('passed'))).toEqual(['VERDICT_INCOHERENT']);
  });

  it('enveloppe · blocked avec une question vide ne cible rien', () => {
    const entree: EntreeTache = { context: contexte(), taskInputs: { sourceIds: [], declaredFacts: [] } };
    expect(codes('brand.extract', entree, { status: 'blocked', questions: ['  '], warnings: [], evidenceIds: [], result: null })).toEqual(['QUESTION_VIDE']);
  });
});

describe('sémantique · contrôles d’entrée (avant tout appel)', () => {
  it('source non autorisée, document sans schéma connu, ID sans document', () => {
    const ctx = contexte({
      sourceExcerpts: [{ sourceId: 'src-concurrent', version: '1', text: 'Avis marque A', trust: 'untrusted_data' }],
      resolvedDocuments: [...contexte().resolvedDocuments, { id: 'doc-x', version: '1', schemaKey: 'Inconnu', content: {}, sha256: SHA('9') }],
    });
    const c = controlerEntree('concept.plan', { context: ctx, taskInputs: { briefId: 'brief-absent', angleCount: 1, formats: [] } }, OPTIONS);
    expect(c).toEqual([
      expect.objectContaining({ code: 'SOURCE_NON_AUTORISEE', cible: '/context/sourceExcerpts/0' }),
      expect.objectContaining({ code: 'DOCUMENT_SCHEMA_INCONNU', cible: '/context/resolvedDocuments/4/schemaKey' }),
      expect.objectContaining({ code: 'REFERENCE_NON_RESOLUE', cible: '/taskInputs/briefId' }),
    ]);
  });

  it('valide les documents selon les $defs du schéma (Shot)', () => {
    const valider = validateurDocumentsParDefinitions(validateur);
    expect(valider('Shot', { shotId: 'x' })).toBe('invalide');
    expect(valider('Brief', {})).toBe('inconnu');
    expect(valider('constructor', {})).toBe('inconnu');
  });

  it('média annoncé sans pièce jointe : la tâche vision ne part pas', () => {
    const c = controlerEntree('source.analyze', { context: contexte(), taskInputs: { sourceIds: ['src-avis'], transcription: '', availableModalities: ['image', 'text'] } }, OPTIONS);
    expect(c.map((x) => x.code)).toEqual(['MODALITE_ABSENTE']);
  });
});

describe('sémantique · chaîne complète d’une sortie', () => {
  const entree: EntreeTache = { context: contexte(), taskInputs: { sourceIds: ['src-avis'], declaredFacts: [] } };
  it('JSON illisible, puis réparation dans la limite d’une tentative', () => {
    const r = evaluerSortie('brand.extract', entree, '{ pas du json', validateur, OPTIONS, { faites: 0, maximum: 1 });
    expect(r).toMatchObject({ ok: false, code: 'SORTIE_JSON_INVALIDE', reparationPossible: true });
    const r2 = evaluerSortie('brand.extract', entree, '{ pas du json', validateur, OPTIONS, { faites: 1, maximum: 1 });
    expect(r2).toMatchObject({ ok: false, reparationPossible: false });
  });
  it('schéma d’abord, sémantique ensuite', () => {
    expect(evaluerSortie('brand.extract', entree, { status: 'ready' }, validateur, OPTIONS, { faites: 0, maximum: 1 })).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    const sortie = ready({ facts: [{ id: 'fait-n1', claim: 'x', sourceIds: ['src-x'], kind: 'observed', confidence: 'low' }], tone: '', audiences: [], objections: [], missingEvidence: [] });
    expect(evaluerSortie('brand.extract', entree, JSON.stringify(sortie), validateur, OPTIONS, { faites: 0, maximum: 1 })).toMatchObject({ ok: false, code: 'SEMANTIQUE' });
  });
});
