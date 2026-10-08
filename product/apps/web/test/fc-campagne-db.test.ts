import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Lot F-C · campagne SIMULÉE de bout en bout sur une VRAIE base (pglite +
 * migrations) : registre réel (import, validation, release, publication en
 * « test »), `executerTache` pour chaque tâche, adaptateur simulé, oracles du
 * noyau, dossiers de preuves écrits sur disque, rapport joint à la release.
 * On lit les RÉSULTATS : fichiers écrits, lignes en base, verdict.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq } from '@tiktrends/db';
import { IDS_CAS, sceller, BANNIERE_REEL, type RapportCampagne } from '@tiktrends/core';
import { joindreCampagne, lancerCampagneSimulee, acteurScriptLocal, PORTEE_BENCHMARK } from '../lib/studios/benchmark/programme';
import { SCENARIOS } from '../lib/studios/benchmark/scenarios';
import * as depot from '../lib/studios/prompts/depot-prompts';

const ENV = { STUDIOS_PROMPTS_RECETTE_LOCALE: '1', DATABASE_URL: 'postgres://postgres@127.0.0.1:5433/fc' };
const VISION = ['F01', 'F02', 'F07', 'F12', 'F13', 'F15'];
// Lot F-D : la vision est routée (pièces natives) · les 24 cas s'exécutent.
const EXECUTABLES = IDS_CAS;
const AVEC_REVUE = ['F01', 'F02', 'F05', 'F14', 'F15', 'F18', 'F20', 'F23'];
const racine = mkdtempSync(join(tmpdir(), 'fc-campagne-'));
let r: Awaited<ReturnType<typeof lancerCampagneSimulee>>;
let evaluationAvant: unknown;

const ok = () => { if (!r.ok) throw new Error(JSON.stringify(r.refus)); return r; };
const lire = (...p: string[]) => JSON.parse(readFileSync(join(ok().resultat.dossier!, ...p), 'utf8'));

beforeAll(async () => {
  r = await lancerCampagneSimulee({ racine, env: ENV, maintenant: new Date('2026-10-08T12:00:00Z') });
  evaluationAvant = (await depot.lireReleaseParId(ok().release.id))!.evaluation;
}, 120_000);

describe('garde d’environnement', () => {
  it('hors recette locale (base distante ou drapeau absent) : refusée, rien n’est écrit', async () => {
    const avant = (await db.select().from(schema.studioPromptRuns)).length;
    for (const env of [{ DATABASE_URL: ENV.DATABASE_URL }, { STUDIOS_PROMPTS_RECETTE_LOCALE: '1', DATABASE_URL: 'postgres://u@db:5432/prod' }]) {
      const x = await lancerCampagneSimulee({ racine: null, env });
      expect(x).toMatchObject({ ok: false, refus: [{ code: 'SIMULE_HORS_RECETTE' }] });
    }
    expect((await db.select().from(schema.studioPromptRuns)).length).toBe(avant);
  });
});

describe('campagne simulée complète', () => {
  it('24 dossiers de preuves, six fichiers attendus chacun, tous marqués SIMULÉ', () => {
    const d = ok().resultat.dossier!;
    expect(d).toMatch(/20261008T120000Z-SIMULE$/);
    expect(readdirSync(d).filter((x) => /^F\d\d$/.test(x)).sort()).toEqual([...IDS_CAS]);
    for (const c of IDS_CAS) {
      const attendus = ['config.json', 'cout.json', 'entrees.json', 'oracle.json', 'sorties.json', ...(AVEC_REVUE.includes(c) ? ['fiche-revue.json'] : [])];
      for (const f of attendus) {
        const j = lire(c, f);
        expect(j.mode, `${c}/${f}`).toBe('SIMULÉ');
        expect(j.banniere, `${c}/${f}`).toMatch(/^SIMULÉ · /);
      }
      expect(existsSync(join(d, c, 'fiche-revue.json'))).toBe(AVEC_REVUE.includes(c));
    }
    const md = readFileSync(join(d, 'RAPPORT.md'), 'utf8');
    expect(md.split('\n')[0]).toBe('# Benchmark Studios F01-F24 · campagne SIMULÉE');
    expect(md).toMatch(/> \*\*SIMULÉ · exécution sur fournisseurs simulés, aucune évaluation réelle/);
    expect(md).toMatch(/## Cas \(SIMULÉ\)/);
  });

  it('preuves exigées : entrées et empreintes, release et modèle, sorties, oracle, coût', () => {
    const e = lire('F01', 'entrees.json');
    expect(e.jeuSynthetique.map((x: { id: string }) => x.id).sort()).toEqual(['f01-bandeau-bleu', 'f01-lunettes-bleues']);
    expect(e.etapes[0].taskInputsSha256).toMatch(/^[a-f0-9]{64}$/);
    const c = lire('F04', 'config.json');
    expect(c).toMatchObject({ release: { id: ok().release.id, empreinte: ok().release.hash }, adaptateurTexte: 'simule-benchmark', simule: true, modele: 'modele-simule-benchmark', environnement: 'test' });
    expect(c.runIds).toHaveLength(2);
    expect(c.messagesEnvoyes.every((m: { sha256: string }) => /^[a-f0-9]{64}$/.test(m.sha256))).toBe(true);
    const s = lire('F05', 'sorties.json');
    expect(s.etapes.filter((x: { fichiers: unknown[] }) => x.fichiers.length).length).toBe(2);
    expect(existsSync(join(ok().resultat.dossier!, 'F05', 'sorties', 'retouche-1-1.png'))).toBe(true);
    const cout = lire('F20', 'cout.json');
    expect(cout).toMatchObject({ depenseUsdMicros: 0, totalDevisUsdMicros: 3_248_000 });
    expect(lire('F07', 'cout.json').totalDevisUsdMicros).toBe(218_112);
  });

  it('oracles déterministes : les 18 cas exécutables passent TOUS leurs invariants', () => {
    for (const c of EXECUTABLES) {
      const x = ok().resultat.resultats.find((y) => y.cas === c)!;
      expect(x.statut, c).toBe('execute');
      expect(x.invariants.map((i) => [i.id, i.passe]), c).toEqual(x.invariants.map((i) => [i.id, true]));
    }
  });

  it('vision routée (lot F-D) : les 6 cas s’exécutent, chaque image jointe est tracée dans config.json', () => {
    for (const c of VISION) {
      const x = ok().resultat.resultats.find((y) => y.cas === c)!;
      expect(x.statut, c).toBe('execute');
    }
    expect(lire('F07', 'oracle.json').invariants[0]).toMatchObject({ passe: true });
    expect(lire('F07', 'config.json').piecesNatives.map((p: { index: number; assetId: string }) => [p.index, p.assetId])).toEqual([[0, 'f07-boite'], [1, 'f01-lunettes-bleues']]);
  });

  it('fiches humaines : générées vides, jamais notées par le code', () => {
    for (const c of AVEC_REVUE) {
      const f = lire(c, 'fiche-revue.json');
      expect(f.dimensions).toEqual(['fidélité produit', 'respect brief', 'cohérence', 'texte', 'qualité technique']);
      expect(f.sorties.length).toBeGreaterThan(0);
      for (const s of f.sorties) { expect(Object.values(s.notes).every((n) => n === null)).toBe(true); expect(s.relecteur).toBeNull(); }
    }
  });

  it('rapport : SIMULÉ, jamais approuvable, 0 $ dépensé, aucune ligne de dépense', async () => {
    const rap = ok().resultat.rapport;
    expect(rap).toMatchObject({ mode: 'simule', depenseUsdMicros: 0, verdict: { statut: 'REVUE_HUMAINE_REQUISE', approuvable: false, evaluationReelle: false } });
    expect(rap.verdict.invariants).toMatchObject({ echoues: 0 });
    expect(await db.select().from(schema.aiSpend)).toEqual([]);
    expect(lire('rapport.json').empreinte).toBe(rap.empreinte);
  });

  it('chaque tâche a sa trace PromptRun, simulée, servie par la release', async () => {
    const runIds = ok().resultat.rapport.cas.flatMap((c) => c.runIds);
    const runs = await db.select().from(schema.studioPromptRuns).where(eq(schema.studioPromptRuns.workspaceId, PORTEE_BENCHMARK.workspaceId));
    expect(runs.map((x) => x.id).sort()).toEqual([...runIds].sort());
    expect(runs.every((x) => (x.config as { simule: boolean }).simule === true && x.promptReleaseId === ok().release.id)).toBe(true);
    expect(runs.filter((x) => x.status === 'blocked').map((x) => x.templateKey).sort()).toEqual(['animation.compile', 'brand.extract']);
  });
});

describe('rattachement à la release', () => {
  it('le rapport simulé est joint, refusé comme évaluation réelle, la release n’est pas touchée', async () => {
    const ev = (await db.select().from(schema.studioPromptEvaluations).where(eq(schema.studioPromptEvaluations.id, ok().evaluationId)))[0]!;
    expect(ev).toMatchObject({ releaseId: ok().release.id, kind: 'benchmark', passed: false });
    expect(ev.result).toMatchObject({ type: 'campagne_benchmark', mode: 'simule', evaluationReelle: false, refus: ['RAPPORT_SIMULE', 'VERDICT_NON_CONFORME', 'TRACES_SIMULEES'] });
    const rel = (await depot.lireReleaseParId(ok().release.id))!;
    expect(rel.evaluation).toEqual(evaluationAvant);
    expect((rel.evaluation as { benchmarkApprouve: boolean }).benchmarkApprouve).toBe(false);
    expect((await depot.lirePointeur())!.releaseId).toBe(ok().release.id);
  });

  it('un rapport simulé maquillé en RÉEL et rescellé reste refusé : ses traces sont simulées', async () => {
    const r0 = ok().resultat.rapport;
    const { empreinte: _e, ...corps } = r0;
    const faux: RapportCampagne = sceller({ ...corps, mode: 'reel', banniere: BANNIERE_REEL, verdict: { ...r0.verdict, mode: 'reel', evaluationReelle: true, approuvable: true, statut: 'CONFORME' } });
    const j = await joindreCampagne(acteurScriptLocal(), { releaseId: ok().release.id, rapport: faux });
    expect(j).toMatchObject({ ok: true, evaluationReelle: false });
    if (j.ok) expect(j.motifs.map((m) => m.split(' ')[0])).toEqual(['TRACES_SIMULEES']);
  });
});

describe('un oracle cassé fait échouer son cas', () => {
  it('F21 · le modèle (simulé) répond « revise » : invariant faux, campagne NON_CONFORME', async () => {
    const original = SCENARIOS.F21!.simule.route!;
    SCENARIOS.F21!.simule.route = () => ({ status: 'ready', questions: [], warnings: [], evidenceIds: [], result: { intent: 'revise', targetIds: [], proposedAction: 'Réviser', nextTemplateKey: '', reply: 'Je modifie.' } });
    try {
      const x = await lancerCampagneSimulee({ cas: ['F21'], racine: null, env: ENV });
      if (!x.ok) throw new Error(JSON.stringify(x.refus));
      expect(x.resultat.resultats[0]!.invariants.find((i) => i.id === 'F21.intention_informative')).toMatchObject({ passe: false });
      expect(x.resultat.rapport.verdict).toMatchObject({ statut: 'NON_CONFORME', casEchoues: ['F21'] });
    } finally { SCENARIOS.F21!.simule.route = original; }
  });

  it('F05 · une retouche qui touche un pixel hors masque fait échouer F05', async () => {
    const original = SCENARIOS.F05!.mediasSimules!.retouche!;
    SCENARIOS.F05!.mediasSimules!.retouche = (e, s) => { const [img] = original(e, s); img!.pixels[0] = 7; return [img!]; };
    try {
      const x = await lancerCampagneSimulee({ cas: ['F05'], racine: null, env: ENV });
      if (!x.ok) throw new Error(JSON.stringify(x.refus));
      expect(x.resultat.resultats[0]!.invariants.find((i) => i.id === 'F05.hors_masque_intact')).toMatchObject({ passe: false });
      expect(x.resultat.rapport.verdict.casEchoues).toEqual(['F05']);
    } finally { SCENARIOS.F05!.mediasSimules!.retouche = original; }
  });
});
