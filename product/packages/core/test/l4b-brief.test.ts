import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { creerValidateurContrats } from '../src/prompts/contrats';
import type { PackPrompts } from '../src/prompts/types';
import {
  composerBrief, validerFormeBrief, validerRelationsBrief, completudeProjet, exporterBrief, hypotheseDuBrief, faitsHypothese,
  CLES_BRIEF, type BriefCanonique,
} from '../src/studios/brief';
import { annonceObservee, referenceSource, tombstoneSource } from '../src/studios/sources/reference';
import { referenceProduit } from '../src/studios/sources/produit';
import type { HypotheseTest } from '../src/studios/sources/hypotheses';

/**
 * L4-B · le brief canonique · il EST le `result` de `brief_build_output`
 * (vérifié par le validateur Ajv du vrai 03-CONTRATS), il tient ses relations,
 * il dit ce qui manque et il s'exporte sans rien acheter (FLOW-10).
 */

const DOSSIER = join(__dirname, '../../../../docs/studios-v2');
const lire = (f: string) => JSON.parse(readFileSync(join(DOSSIER, f), 'utf8')) as unknown;
const validateur = creerValidateurContrats(lire('03-CONTRATS.schema.json') as Record<string, unknown>, (lire('02-PROMPTS.json') as PackPrompts).templates);
const conforme = (result: unknown) => validateur.validerSortie('brief.build', { status: 'ready', questions: [], warnings: [], evidenceIds: [], result });

const T0 = new Date('2026-10-01T09:30:00Z');
const annonce = annonceObservee({
  id: '9001', platform: 'meta', daysRunning: 64, mediaType: 'image', thumbnailUrl: 'https://cdn.test/v.jpg',
  advertiserName: 'Lumière Botanique', body: 'Votre peau mérite mieux. Notre sérum à 12 % de vitamine C efface les taches en 14 jours.',
  callToAction: 'Acheter', landingDomain: 'lbcosmetiques.fr',
})!;
const source = referenceSource({ type: 'veille_ad', annonce, savedAdId: null, portee: { workspaceId: 'ws_a', brandId: 'b_a1' }, observeLe: T0, format: { id: 'avant_apres', libelle: 'Avant / après' }, retourVeille: null });
const produit = referenceProduit({ id: '22222222-2222-4222-8222-222222222222', name: 'Crème Douce', description: 'Crème hydratante', usp: 'Hydrate 24 h', price: 29, url: null, imageUrl: null, imageUrls: null }, T0);
const hypothese: HypotheseTest = {
  id: 'hyp_2', statement: 'Un avant/après daté augmente le taux de clic.', sourceIds: [source.sourceId], variable: 'Visuel avant/après',
  control: 'Packshot seul', treatment: 'Avant/après à J0 et J14', invariants: ['Même accroche', 'Même offre'], metric: 'Taux de clic (CTR)',
  decisionRule: 'Garder si +15 % de CTR après 3 000 impressions', limitations: ['Pas de mesure de conversion'],
};
const brief = () => composerBrief({ sources: [source], hypothese, produit, audience: 'Femmes 30-45 ans, peau sèche' });

describe('le brief composé est conforme au CONTRAT brief_build_output', () => {
  it('Ajv sur le vrai 03-CONTRATS · treize champs, ni plus ni moins', () => {
    const b = brief();
    expect(Object.keys(b).sort()).toEqual([...CLES_BRIEF].sort());
    expect(conforme(b)).toEqual({ ok: true });
    expect(validerFormeBrief(b)).toEqual([]);
  });

  it('la forme locale refuse ce que le contrat refuse (champ inconnu, nature inconnue, empreinte fausse)', () => {
    const cas: Array<[string, (b: any) => void]> = [
      ['champ en plus', (b) => { b.hypothese = {}; }],
      ['nature de fait', (b) => { b.facts[0].kind = 'rumeur'; }],
      ['référence sans empreinte', (b) => { b.references = [{ assetId: 'a', assetVersion: '1', sha256: 'zz', role: 'product', scope: 'product', allowedChanges: [], requiredComponents: [] }]; }],
      ['champ manquant', (b) => { delete b.exclusions; }],
    ];
    for (const [nom, muter] of cas) {
      const b = JSON.parse(JSON.stringify(brief()));
      muter(b);
      expect(conforme(b).ok, `contrat · ${nom}`).toBe(false);
      expect(validerFormeBrief(b).length, `forme locale · ${nom}`).toBeGreaterThan(0);
    }
  });

  it('l’exemple brief.build de 08-EXEMPLES passe aussi la forme locale', () => {
    const ex = (lire('08-EXEMPLES-CONTRATS.json') as { cases: Array<{ templateKey: string; readyOutputShapeExample: { result: unknown } }> }).cases.find((c) => c.templateKey === 'brief.build')!;
    const result = ex.readyOutputShapeExample.result;
    expect(conforme(result)).toEqual({ ok: true });
    expect(validerFormeBrief(result)).toEqual([]);
  });
});

describe('FLOW-01 · sources, dates, droits et hypothèse portés par le brief', () => {
  it('chaque observation cite sa source ; l’hypothèse et son protocole sont des faits ; la variable correspond', () => {
    const b = brief();
    expect(b.hypothesisId).toBe('hyp_2');
    expect(b.testedVariable).toBe('Visuel avant/après');
    expect(b.variables).toEqual(['Visuel avant/après']);
    expect(b.facts.filter((f) => f.kind === 'observed').every((f) => f.sourceIds.includes(source.sourceId))).toBe(true);
    expect(b.facts.find((f) => f.id === 'hyp_2')).toMatchObject({ kind: 'hypothesis', claim: hypothese.statement });
    expect(b.facts.find((f) => f.id === 'produit.promesse')).toMatchObject({ kind: 'declared', sourceIds: [`produit:${produit.productId}`] });
    expect(validerRelationsBrief(b, { sources: [source], productId: produit.productId })).toEqual([]);
  });

  it('aller-retour · l’hypothèse se relit à l’identique depuis le brief', () => {
    expect(hypotheseDuBrief(brief())).toEqual({ ...hypothese, invariants: [] });
    expect(faitsHypothese(hypothese).map((f) => f.id)).toEqual(['hyp_2', 'hyp_2.temoin', 'hyp_2.traitement', 'hyp_2.mesure', 'hyp_2.decision', 'hyp_2.limite.1']);
  });

  it('le concurrent n’entre que dans les exclusions', () => {
    const b = brief();
    const ecrits = JSON.stringify([b.objective, b.audience, b.testedVariable, b.composition, b.styleIntent, b.invariants, b.variables, b.texts, b.formats]);
    expect(ecrits).not.toMatch(/Lumi[eè]re|lbcosmetiques|12 %/);
    expect(b.exclusions.join(' ')).toContain('Lumière Botanique');
    expect(b.composition).toContain('Avant / après');
  });

  it('un invariant proposé qui nomme l’annonceur est rangé en exclusion', () => {
    const b = composerBrief({ sources: [source], hypothese: { ...hypothese, invariants: ['Ne jamais montrer le flacon Lumière Botanique'] }, produit, audience: '' });
    expect(b.invariants.join(' ')).not.toContain('Lumière');
    expect(b.exclusions).toContain('Ne jamais montrer le flacon Lumière Botanique');
    expect(validerRelationsBrief(b, { sources: [source], productId: produit.productId })).toEqual([]);
  });
});

describe('validation relationnelle · chaque garde dit ce qui ne tient pas', () => {
  const rel = (muter: (b: BriefCanonique) => void, productId: string | null = produit.productId) => {
    const b = JSON.parse(JSON.stringify(brief())) as BriefCanonique;
    muter(b);
    return validerRelationsBrief(b, { sources: [source], productId });
  };

  it('source inconnue du projet', () => {
    expect(rel((b) => { b.facts[0]!.sourceIds = ['src_inconnue']; })).toContainEqual({ chemin: '/brief/facts/0/sourceIds/0', raison: 'source absente du projet' });
  });
  it('fait d’un autre produit', () => {
    expect(rel(() => undefined, '33333333-3333-4333-8333-333333333333').some((v) => v.raison === 'fait d’un produit qui n’est pas celui du projet')).toBe(true);
  });
  it('hypothèse citée absente', () => {
    expect(rel((b) => { b.hypothesisId = 'hyp_fantome'; })).toContainEqual({ chemin: '/brief/hypothesisId', raison: 'hypothèse citée absente des faits' });
  });
  it('variable testée hors des variables', () => {
    expect(rel((b) => { b.variables = ['Prix']; })).toContainEqual({ chemin: '/brief/variables', raison: 'la variable testée doit figurer parmi les variables' });
  });
  it('FLOW-02 · observation de narration sur une image sans transcription', () => {
    expect(rel((b) => { b.facts.push({ id: 'obs.voix', claim: 'Une voix off présente le produit.', sourceIds: [source.sourceId], kind: 'observed', confidence: 'medium' }); }))
      .toContainEqual({ chemin: `/brief/facts/${brief().facts.length}/claim`, raison: 'narration affirmée sans transcription ni audio dans la source' });
  });
  it('fuite · le nom de l’annonceur dans la composition', () => {
    expect(rel((b) => { b.composition = 'Comme Lumière Botanique, un avant/après.'; })).toContainEqual({ chemin: '/brief/composition', raison: 'reprend le nom de l’annonceur source' });
  });
  it('identifiants de faits en double', () => {
    expect(rel((b) => { b.facts.push({ ...b.facts[0]! }); }).some((v) => v.raison === 'identifiant de fait en double')).toBe(true);
  });
});

describe('complétude · ce qui manque, sans bloquer', () => {
  it('brief complet avec produit · prêt, seuls des manques non bloquants', () => {
    const c = completudeProjet({ brief: brief(), produit, sources: [source] });
    expect(c.etape).toBe('brief_pret');
    expect(c.manques.filter((m) => m.bloquant)).toEqual([]);
    expect(c.manques.map((m) => m.cle)).toEqual(expect.arrayContaining(['photo_produit', 'reference_visuelle']));
  });

  it('sans produit ni hypothèse · à compléter, et on dit quoi', () => {
    const c = completudeProjet({ brief: composerBrief({ sources: [source], hypothese: null, produit: null, audience: '' }), produit: null, sources: [source] });
    expect(c.etape).toBe('brief_a_completer');
    expect(c.libelleEtape).toBe('Brief à compléter');
    expect(c.manques.filter((m) => m.bloquant).map((m) => m.cle)).toEqual(['hypothese', 'variable', 'objectif', 'produit']);
  });

  it('une source retirée est signalée, pas bloquante', () => {
    const c = completudeProjet({ brief: brief(), produit, sources: [tombstoneSource(source, 'supprimee', T0)] });
    expect(c.manques.find((m) => m.cle === 'source_inaccessible')).toMatchObject({ bloquant: false, libelle: '1 source n’est plus accessible · observations conservées' });
  });

  it('du contenu de production · en production', () => {
    expect(completudeProjet({ brief: brief(), produit, sources: [source], aDuContenuDeProduction: true }).etape).toBe('production');
  });
});

describe('FLOW-10 · export du brief pour produire ailleurs', () => {
  const meta = { titre: 'Avant/après Crème Douce', marque: 'Marque A1', type: 'ads', versionN: 2, versionId: 'v2', exporteLe: '2026-10-07T12:00:00Z', sources: [source], produit };

  it('Markdown lisible · hypothèse, protocole, produit, sources datées et droit, sans tiret cadratin', () => {
    const e = exporterBrief(brief(), meta, 'markdown');
    expect(e).toMatchObject({ nomFichier: 'brief-avant-apres-creme-douce-v2.md', typeMime: 'text/markdown' });
    for (const attendu of [
      '# Avant/après Crème Douce', 'Version 2', 'Un avant/après daté augmente le taux de clic.', '- Variable testée : Visuel avant/après',
      '- Témoin : Packshot seul', '- Mesure : Taux de clic (CTR)', '- Règle de décision : Garder si +15 % de CTR après 3 000 impressions',
      '**Crème Douce**', '- Photo produit : manquant', 'observée le 01/10/2026', 'droit : observation publique, structure seulement',
      'Narration non observable : Aucune transcription ni piste audio', 'ne déclenche aucune génération et ne coûte rien',
    ]) expect(e.contenu, `export sans « ${attendu} »`).toContain(attendu);
    expect(e.contenu).not.toContain('—');
  });

  it('JSON · relisible, le brief exact et les sources', () => {
    const e = exporterBrief(brief(), meta, 'json');
    const j = JSON.parse(e.contenu);
    expect(j.schema).toBe('tiktrends.studio.brief/1');
    expect(j.brief).toEqual(brief());
    expect(conforme(j.brief)).toEqual({ ok: true });
    expect(j.sources[0]).toMatchObject({ sourceId: source.sourceId, droit: 'observation_publique', observeLe: source.observeLe, empreinte: source.empreinte });
  });
});
