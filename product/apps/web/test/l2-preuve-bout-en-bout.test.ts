import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';

/**
 * Preuve locale de bout en bout (cahier §8.3, PROMPT-05 à 08 et 10) · une
 * seule histoire, du registre vide aux traces, sur une vraie base (pglite),
 * avec la VRAIE route Jarvis (fournisseur HTTP simulé) et le VRAI résolveur
 * studio (adaptateur simulé). Aucun appel réseau sortant, aucune dépense.
 *
 *  1. import → validation → release A évaluée → publiée (recette locale) ;
 *  2. Jarvis et un brief studio résolvent A ; un devis s'épingle sur A ;
 *  3. ADMIN publie B (recette de style et phrase de Jarvis modifiées) :
 *     Jarvis et le brief suivants portent B jusqu'au fournisseur, le job
 *     épinglé garde A ;
 *  4. rollback vers A : les suivants reprennent A ;
 *  5. une connaissance publiée entre dans le snapshot, retirée elle en sort.
 *
 * Si `L2_JOURNAL` désigne un fichier, le journal JSON des traces et de l'audit
 * y est écrit (preuve jointe au rapport).
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), brand: randomUUID(), user: randomUUID() };
});
const h = vi.hoisted(() => ({ session: null as unknown }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: ids.brand, name: 'Neva', logoUrl: null, url: null, category: null }) }));

import { db, schema, eq } from '@tiktrends/db';
import { creerConnaissance, publierVersion, retirerConnaissance, validerSaisie } from '@tiktrends/core';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { executerTache, epinglerDevis } from '../lib/studios/prompts/resolveur';
import { expurgerRun, nomsSourcesUtiles, type LigneRun } from '../lib/studios/prompts/traces';
import { ecrireConnaissance, lireUneConnaissance } from '../lib/jarvis-connaissances';
import { POST } from '../app/api/jarvis/chat/route';
import { demarrerMockFournisseur } from './lot19b-mock-fournisseur';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';

const A = acteurPlateforme();
const journal: Array<Record<string, unknown>> = [];
let mock: Awaited<ReturnType<typeof demarrerMockFournisseur>>;
const studio = adaptateurSimule((a) => {
  const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { requestedFormats: string[] };
  return {
    status: 'ready', questions: [], warnings: [], evidenceIds: [],
    result: { objective: 'Montrer le produit', audience: 'Peaux sèches', hypothesisId: null, testedVariable: 'décor', facts: [], invariants: [], variables: [], references: [], composition: 'Produit centré', styleIntent: 'Photo épurée', texts: [], formats: ti.requestedFormats, exclusions: [] },
  };
});

async function jarvis(etape: string) {
  const res = await POST(new Request('http://local/api/jarvis/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: `Question ${etape}` }) }));
  expect(res.status).toBe(200);
  await res.text();
  const t = (await db.select().from(schema.studioPromptRuns)).sort((x, y) => +new Date(x.createdAt) - +new Date(y.createdAt)).at(-1)!;
  return consigner(etape, 'jarvis', t as unknown as LigneRun, { systemeContientNouvellePhrase: mock.recues.at(-1)!.system.includes(NOUVELLE) });
}
async function brief(etape: string, epinglage?: { promptReleaseId: string }) {
  const r = await executerTache({
    templateKey: 'brief.build', portee: { workspaceId: ids.ws, brandId: ids.brand }, acteur: { userId: ids.user, traceId: `st_${etape}` },
    taskInputs: { request: 'Une image produit pour tester le décor', hypothesisId: null, selectedReferences: [], requestedFormats: ['1:1'] },
    contexte: {}, adaptateur: studio, environnement: 'test', ...(epinglage ? { epinglage } : {}),
  });
  if (!r.ok) throw new Error(`${etape} : ${JSON.stringify(r.constats)}`);
  const [t] = await db.select().from(schema.studioPromptRuns).where(eq(schema.studioPromptRuns.id, r.runId));
  return consigner(etape, epinglage ? 'job épinglé' : 'studio', t as unknown as LigneRun, { sourcesUtilisateur: r.sources });
}
function consigner(etape: string, canal: string, l: LigneRun, extra: Record<string, unknown>) {
  const x = expurgerRun(l);
  const ligne = { etape, canal, run: x.id, template: x.templateKey, statut: x.statut, release: x.releaseId, releaseHash: x.config.releaseHash, compiledHash: x.compiledHash, contextSnapshotHash: x.contextSnapshotHash, sources: nomsSourcesUtiles(x.sources), modele: x.modele, coutUsd: x.coutUsd, ...extra };
  journal.push(ligne);
  return ligne;
}

const NOUVELLE = 'Réponds court, et termine par la prochaine action utile.';
const K = '8b8b8b8b-0000-4000-8000-000000000001';

beforeAll(async () => {
  mock = await demarrerMockFournisseur(() => 'Réponse simulée.');
  process.env.ANTHROPIC_API_KEY = 'cle-factice-locale';
  process.env.ANTHROPIC_BASE_URL = mock.url;
  delete process.env.AI_SPEND_CAP_USD;
  await db.insert(schema.workspaces).values({ id: ids.ws, name: 'Démo', plan: 'core' });
  await db.insert(schema.users).values({ id: ids.user, email: 'membre@client.test' });
  await db.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Neva' });
  h.session = { user: { id: ids.user, email: 'membre@client.test', name: null }, workspaceId: ids.ws, workspaceName: 'Démo', role: 'member', plan: 'core', equipe: null };
});
afterAll(async () => {
  await mock.fermer();
  if (process.env.L2_JOURNAL) {
    const audit = (await db.select().from(schema.studioAuditEvents)).map((a) => ({ action: a.action, cible: a.targetId, avant: a.versionBefore, apres: a.versionAfter, role: a.effectiveRole, motif: a.reason }));
    writeFileSync(process.env.L2_JOURNAL, JSON.stringify({ genereLe: new Date().toISOString(), fournisseurs: 'simulés (aucun réseau, aucune dépense)', traces: journal, audit }, null, 2));
  }
});

describe('preuve locale de bout en bout', () => {
  it('release A · Jarvis et studio la portent jusqu’au fournisseur, un devis s’épingle', async () => {
    const relA = await publierRegistreDeTest(depot, A);
    const j1 = await jarvis('1 · Jarvis sur A');
    const s1 = await brief('1 · brief studio sur A');
    expect([j1.release, s1.release]).toEqual([relA, relA]);
    const devis = await epinglerDevis();
    expect(devis).toMatchObject({ ok: true, promptReleaseId: relA });
  });

  it('B publiée · Jarvis et brief suivants sur B, nouvelle phrase reçue, job épinglé garde A', async () => {
    const relA = (await depot.lirePointeur())!.releaseId;
    const v = await depot.listerVersions();
    const recette = v.find((l) => l.key === 'photo_clean')!;
    const politique = v.find((l) => l.key === 'jarvis.conversation')!;
    const socle = (politique.content as { sections: { socle: string } }).sections.socle.replace('Réponds court.', NOUVELLE);
    for (const [base, champs] of [[recette.id, { lighting: 'lumière studio diffuse, nuance chaude' }], [politique.id, { 'sections.socle': socle }]] as const) {
      const b = await depot.enregistrerBrouillon(A, { baseId: base, champs, motif: 'Preuve de bout en bout · modification inoffensive' });
      if (!b.ok) throw new Error(JSON.stringify(b));
      expect((await depot.validerVersion(A, { id: b.id })).ok).toBe(true);
    }
    const r = await depot.creerRelease(A, { motif: 'B' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect((await depot.evaluerRelease(A, { releaseId: r.id })).ok).toBe(true);
    expect((await depot.publierRelease(A, { releaseId: r.id, attendue: relA, environnement: 'test' })).ok).toBe(true);
    const j2 = await jarvis('2 · Jarvis sur B');
    const s2 = await brief('2 · brief studio sur B');
    const s3 = await brief('2 · job épinglé au devis A', { promptReleaseId: relA });
    expect(j2).toMatchObject({ release: r.id, systemeContientNouvellePhrase: true });
    expect(s2.release).toBe(r.id);
    expect(s3.release).toBe(relA);
    expect(s2.releaseHash).not.toBe(s3.releaseHash);
  });

  it('rollback vers A · les suivants reprennent A', async () => {
    const releases = await depot.listerReleases();
    const relA = releases.at(-1)!.id;
    const relB = (await depot.lirePointeur())!.releaseId;
    expect((await depot.rollbackRelease(A, { releaseId: relA, attendue: relB, environnement: 'test' })).ok).toBe(true);
    const j3 = await jarvis('3 · Jarvis après rollback');
    const s4 = await brief('3 · brief après rollback');
    expect(j3).toMatchObject({ release: relA, systemeContientNouvellePhrase: false });
    expect(s4.release).toBe(relA);
  });

  it('connaissance publiée puis retirée · entre puis sort du snapshot', async () => {
    const v = validerSaisie({ titre: 'Ton maison', type: 'instruction', texte: 'Toujours tutoyer.', origine: { mode: 'saisie' }, portee: { niveau: 'plateforme' } });
    if (!v.ok) throw new Error(v.erreur);
    const p = publierVersion(creerConnaissance(K, v.valeur, 'equipe@test', '2026-10-07T08:00:00Z'), 1, 'equipe@test', '2026-10-07T08:00:00Z');
    if (!p.ok) throw new Error(p.erreur);
    await ecrireConnaissance(p.valeur, null);
    const s5 = await brief('4 · brief avec connaissance publiée');
    const c = (await lireUneConnaissance(K))!;
    const r = retirerConnaissance(c, 'equipe@test', '2026-10-07T09:00:00Z');
    if (!r.ok) throw new Error(r.erreur);
    await ecrireConnaissance(r.valeur, c.rev);
    const s6 = await brief('4 · brief après retrait');
    expect(s5.sources).toEqual(['Ton maison']);
    expect(s6.sources).toEqual([]);
    expect(s5.contextSnapshotHash).not.toBe(s6.contextSnapshotHash);
  });
});
