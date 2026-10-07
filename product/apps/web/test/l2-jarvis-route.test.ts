import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * PROMPT-05 · la VRAIE route `/api/jarvis/chat`, branchée au registre.
 *
 * Base réelle (pglite + migrations), dépôt et résolveur réels, barrière de
 * dépense réelle, SDK réel · seul le fournisseur est faux (serveur HTTP local
 * sur `ANTHROPIC_BASE_URL`, `lot19b-mock-fournisseur`), et il enregistre la
 * consigne RÉELLEMENT reçue. On vérifie :
 *  - sans release publiée · « pas encore activé », rien ne part ;
 *  - publiée · la consigne reçue est celle du registre, et chaque tour laisse
 *    une trace (release, version de la politique, empreintes, sources) ;
 *  - une modification inoffensive publiée en ADMIN · la conversation suivante
 *    reçoit le nouveau texte, sa trace porte la nouvelle release et la nouvelle
 *    empreinte ; l'ancienne trace garde l'ancienne ; le rollback restaure ;
 *  - droits (`refusJarvis`) et absence de débit inchangés.
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
import { messageServiceInactif } from '@tiktrends/core';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { POST } from '../app/api/jarvis/chat/route';
import { demarrerMockFournisseur } from './lot19b-mock-fournisseur';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';

const A = acteurPlateforme();
const T = schema.studioPromptRuns;
const PHRASE = 'Réponds court.';
const NOUVELLE = 'Réponds court, et termine par la prochaine action utile.';
const rel = { a: '', b: '', c: '' };
let mock: Awaited<ReturnType<typeof demarrerMockFournisseur>>;

const membre = () => ({ user: { id: ids.user, email: 'membre@client.test', name: null }, workspaceId: ids.ws, workspaceName: 'Démo', role: 'member', plan: 'core', equipe: null });
async function poser(q = 'Que tester ensuite ?') {
  const res = await POST(new Request('http://local/api/jarvis/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: q }) }));
  return { status: res.status, texte: await res.text() };
}
const runs = async () => db.select().from(T).orderBy(T.createdAt);
const dernierSysteme = () => mock.recues.at(-1)!.system;

/** Publie une release où la politique Jarvis est modifiée (nouvelle version validée). */
async function publierPolitique(socle: (s: string) => string, attendue: string): Promise<string> {
  const base = (await depot.listerVersions()).find((l) => l.key === 'jarvis.conversation' && l.status === 'validated')!;
  const sections = (base.content as { sections: Record<string, string> }).sections;
  const b = await depot.enregistrerBrouillon(A, { baseId: base.id, champs: { 'sections.socle': socle(sections.socle!) }, motif: 'Preuve PROMPT-05 · modification inoffensive' });
  if (!b.ok) throw new Error(JSON.stringify(b));
  expect((await depot.validerVersion(A, { id: b.id })).ok).toBe(true);
  const r = await depot.creerRelease(A, { motif: 'PROMPT-05' });
  if (!r.ok) throw new Error(JSON.stringify(r));
  expect((await depot.evaluerRelease(A, { releaseId: r.id })).ok).toBe(true);
  const p = await depot.publierRelease(A, { releaseId: r.id, attendue, environnement: 'test' });
  if (!p.ok) throw new Error(JSON.stringify(p));
  return r.id;
}

beforeAll(async () => {
  mock = await demarrerMockFournisseur(() => 'Réponse simulée.');
  process.env.ANTHROPIC_API_KEY = 'cle-factice-locale';
  process.env.ANTHROPIC_BASE_URL = mock.url;
  delete process.env.AI_SPEND_CAP_USD;
  await db.insert(schema.workspaces).values({ id: ids.ws, name: 'Démo', plan: 'core', creditsBalance: 100 });
  await db.insert(schema.users).values({ id: ids.user, email: 'membre@client.test' });
  await db.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Neva', creativeRules: 'REGLE_MAISON_NEVA' });
});
afterAll(async () => { await mock.fermer(); });
beforeEach(() => { h.session = membre(); });

describe('PROMPT-05 · Jarvis résout sa consigne dans le registre', () => {
  it('aucune release publiée · « pas encore activé », rien ne part, aucune trace', async () => {
    const r = await poser();
    expect(r.status).toBe(503);
    expect(JSON.parse(r.texte)).toEqual({ error: messageServiceInactif('jarvis') });
    expect(mock.recues).toHaveLength(0);
    expect(await runs()).toHaveLength(0);
  });

  it('release A publiée · consigne du registre reçue, trace du tour écrite', async () => {
    rel.a = await publierRegistreDeTest(depot, A);
    const r = await poser();
    expect(r.status).toBe(200);
    expect(r.texte).toContain('Réponse simulée.');
    expect(dernierSysteme()).toContain(PHRASE);
    expect(dernierSysteme().trimEnd().endsWith('REGLE_MAISON_NEVA')).toBe(true);
    const [t] = await runs();
    const politique = (await depot.listerVersions()).find((l) => l.key === 'jarvis.conversation')!;
    expect(t).toMatchObject({ templateKey: 'jarvis.conversation', promptReleaseId: rel.a, promptVersionId: politique.id, status: 'succeeded', workspaceId: ids.ws, brandId: ids.brand });
    expect((t!.config as Record<string, unknown>).conversation).toMatchObject({ version: '1.0.0', contentHash: politique.contentHash });
    expect(t!.costUsdMicros).toBeGreaterThan(0);
    // Ni la question ni la réponse en clair dans la trace.
    expect(JSON.stringify(t)).not.toContain('Que tester ensuite');
    expect(JSON.stringify(t)).not.toContain('Réponse simulée');
  });

  it('modification inoffensive publiée · la conversation suivante la reçoit, nouvelle release et empreinte dans la trace', async () => {
    const avant = await runs();
    rel.b = await publierPolitique((s) => s.replace(PHRASE, NOUVELLE), rel.a);
    await poser();
    expect(dernierSysteme()).toContain(NOUVELLE);
    const t = (await runs()).at(-1)!;
    const cfgA = avant.at(-1)!.config as Record<string, any>;
    const cfgB = t.config as Record<string, any>;
    expect(t.promptReleaseId).toBe(rel.b);
    expect(cfgB.releaseHash).not.toBe(cfgA.releaseHash);
    expect(cfgB.conversation.version).toBe('1.0.1');
    expect(t.compiledHash).not.toBe(avant.at(-1)!.compiledHash);
    // L'ancienne trace garde l'ancienne release, telle quelle.
    expect((await db.select().from(T).where(eq(T.id, avant.at(-1)!.id)))[0]).toEqual(avant.at(-1));
  });

  it('recette de style modifiée seule · nouvelle release, nouvelle empreinte jusque dans la trace Jarvis', async () => {
    const base = (await depot.listerVersions()).find((l) => l.key === 'photo_clean' && l.status === 'validated')!;
    const b = await depot.enregistrerBrouillon(A, { baseId: base.id, champs: { composition: 'fond sobre, ombre de contact très douce' }, motif: 'Recette inoffensive' });
    if (!b.ok) throw new Error(JSON.stringify(b));
    expect((await depot.validerVersion(A, { id: b.id })).ok).toBe(true);
    const r = await depot.creerRelease(A, { motif: 'recette' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    rel.c = r.id;
    expect((await depot.evaluerRelease(A, { releaseId: rel.c })).ok).toBe(true);
    expect((await depot.publierRelease(A, { releaseId: rel.c, attendue: rel.b, environnement: 'test' })).ok).toBe(true);
    const avant = (await runs()).at(-1)!;
    await poser();
    const t = (await runs()).at(-1)!;
    expect(t.promptReleaseId).toBe(rel.c);
    expect((t.config as any).releaseHash).not.toBe((avant.config as any).releaseHash);
  });

  it('rollback vers A · la conversation suivante reprend l’ancien texte et la release A', async () => {
    expect((await depot.rollbackRelease(A, { releaseId: rel.a, attendue: rel.c, environnement: 'test' })).ok).toBe(true);
    await poser();
    expect(dernierSysteme()).not.toContain(NOUVELLE);
    expect(dernierSysteme()).toContain(PHRASE);
    expect((await runs()).at(-1)!.promptReleaseId).toBe(rel.a);
  });
});

describe('droits et débit inchangés', () => {
  it('client_viewer · 403, rien lu, aucune trace', async () => {
    h.session = { ...membre(), role: 'client_viewer' };
    const n = (await runs()).length;
    const envoyees = mock.recues.length;
    const r = await poser();
    expect(r.status).toBe(403);
    expect(mock.recues.length).toBe(envoyees);
    expect((await runs()).length).toBe(n);
  });

  it('aucun crédit débité par la conversation · solde et registre de crédits inchangés', async () => {
    const solde = async () => (await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ids.ws)))[0]!.c;
    const avant = await solde();
    const lignes = (await db.select().from(schema.creditLedger)).length;
    await poser();
    expect(await solde()).toBe(avant);
    expect((await db.select().from(schema.creditLedger)).length).toBe(lignes);
  });
});
