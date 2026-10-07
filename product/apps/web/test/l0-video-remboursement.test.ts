import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Chantier L0 · ouvrir /studio/video reprend le suivi des vidéos en cours.
 * Ce suivi peut basculer une génération en échec et REMBOURSER · il doit le
 * faire une seule fois, quoi qu'il arrive.
 *
 * ── Le défaut reproduit ──────────────────────────────────────────────────────
 *
 * `failAndRefund` lisait le statut, écrivait `failed` sans condition, puis
 * remboursait si le statut LU n'était pas terminal. Deux suivis concurrents
 * (deux onglets) lisaient « en cours » tous les deux · deux remboursements.
 *
 * On appelle la VRAIE action `pollVideoAction` deux fois en parallèle contre
 * une vraie base (pglite) et on compte ce qui SORT · lignes du registre de
 * crédits et solde de l'espace.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), user: randomUUID(), brand: randomUUID(), echec: randomUUID(), perimee: randomUUID(), terminee: randomUUID(), livree: randomUUID() };
});
const h = vi.hoisted(() => ({ reponse: { status: 'failed', error: 'échec simulé' } as Record<string, unknown>, porte: Promise.resolve() as Promise<void> }));
const espion = vi.hoisted(() => ({ actif: false, ecritures: [] as string[] }));
const ECRITURE = /\binsert\s+into\b|\bupdate\s+"?[a-z_]+"?\s+set\b|\bdelete\s+from\b/i;

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { PGlite } = await import('@electric-sql/pglite');
  const proto = PGlite.prototype as unknown as { query: (sql: string, ...rest: unknown[]) => Promise<unknown> };
  const query = proto.query;
  proto.query = function (this: unknown, sql: string, ...rest: unknown[]) {
    if (espion.actif && ECRITURE.test(sql)) espion.ecritures.push(sql.replace(/\s+/g, ' ').slice(0, 160));
    return query.call(this, sql, ...rest);
  };
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({
  getSession: async () => ({ user: { id: ids.user, email: 'owner@l0.test', name: null }, workspaceId: ids.ws, workspaceName: 'L0', role: 'owner', plan: 'plus' }),
}));
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  return {
    ...actual,
    isFalJob: () => true,
    falFromEnv: () => ({}),
    // Le fournisseur répond aux deux suivis AU MÊME INSTANT (une porte commune) ·
    // leurs requêtes en base s'entrelacent alors comme celles de deux onglets.
    falGetVideo: async () => { await h.porte; return { ...h.reponse }; },
  };
});

import { db, schema, eq } from '@tiktrends/db';
import { pollVideoAction } from '../app/actions/video';

async function solde() {
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ids.ws));
  return w!.c;
}
async function registre() {
  return db.select().from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, ids.ws));
}
async function statut(id: string) {
  const [g] = await db.select({ s: schema.generations.status, u: schema.generations.assetUrls }).from(schema.generations).where(eq(schema.generations.id, id));
  return g!;
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.ws, name: 'L0', creditsBalance: 100 });
  await db.insert(schema.users).values({ id: ids.user, email: 'owner@l0.test' });
  await db.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Neva' });
  const vieux = new Date(Date.now() - 25 * 60_000);
  await db.insert(schema.generations).values([
    { id: ids.echec, brandId: ids.brand, kind: 'video', status: 'processing', creditsCost: 10, jobId: 'fal-ai/x::1' },
    { id: ids.perimee, brandId: ids.brand, kind: 'video', status: 'processing', creditsCost: 7, jobId: 'fal-ai/x::2', createdAt: vieux },
    { id: ids.terminee, brandId: ids.brand, kind: 'video', status: 'completed', creditsCost: 10, jobId: 'fal-ai/x::3', assetUrls: ['https://cdn.test/v.mp4'] },
    { id: ids.livree, brandId: ids.brand, kind: 'video', status: 'processing', creditsCost: 10, jobId: 'fal-ai/x::4' },
  ]);
});
beforeEach(() => { h.reponse = { status: 'failed', error: 'échec simulé' }; h.porte = Promise.resolve(); });

/** Deux suivis lancés ensemble, libérés ensemble. */
async function deuxOnglets(jobId: string, id: string) {
  let ouvrir!: () => void;
  h.porte = new Promise<void>((ok) => { ouvrir = ok; });
  const suivis = Promise.all([pollVideoAction(jobId, id), pollVideoAction(jobId, id)]);
  await new Promise((ok) => setTimeout(ok, 10));
  ouvrir();
  return suivis;
}

describe('suivi vidéo · remboursement atomique et unique', () => {
  it('deux suivis concurrents d’un échec fournisseur · UN remboursement, pas deux', async () => {
    const avant = await solde();
    const [a, b] = await deuxOnglets('fal-ai/x::1', ids.echec);
    expect(a.status).toBe('failed'); expect(b.status).toBe('failed');
    const lignes = (await registre()).filter((l) => l.delta === 10);
    expect(lignes.length, `remboursé ${lignes.length} fois pour un seul échec`).toBe(1);
    expect(await solde(), 'le solde a été crédité plus d’une fois').toBe(avant + 10);
    expect((await statut(ids.echec)).s).toBe('failed');
  });

  it('un job périmé (plus de 15 min, toujours « en cours ») ouvert dans deux onglets · un seul remboursement', async () => {
    h.reponse = { status: 'processing' };
    const avant = await solde();
    await deuxOnglets('fal-ai/x::2', ids.perimee);
    expect((await registre()).filter((l) => l.delta === 7).length, 'job périmé remboursé plus d’une fois').toBe(1);
    expect(await solde()).toBe(avant + 7);
  });

  it('rouvrir l’écran après coup ne rembourse plus rien et n’écrit plus rien', async () => {
    const avant = await solde();
    espion.ecritures = []; espion.actif = true;
    await pollVideoAction('fal-ai/x::1', ids.echec);
    espion.actif = false;
    expect(await solde()).toBe(avant);
    expect(espion.ecritures, `écriture au second suivi :\n${espion.ecritures.join('\n')}`).toEqual([]);
  });

  it('une vidéo déjà terminée n’est jamais repassée en échec ni remboursée', async () => {
    const avant = await solde();
    await pollVideoAction('fal-ai/x::3', ids.terminee);
    expect((await statut(ids.terminee)).s, 'une vidéo livrée a été réécrite en échec').toBe('completed');
    expect(await solde()).toBe(avant);
  });

  it('la réconciliation « terminée » reste (sinon on perdrait la vidéo), une seule fois', async () => {
    h.reponse = { status: 'completed', videoUrl: 'https://cdn.test/livree.mp4' };
    await pollVideoAction('fal-ai/x::4', ids.livree);
    expect(await statut(ids.livree)).toEqual({ s: 'completed', u: ['https://cdn.test/livree.mp4'] });
    espion.ecritures = []; espion.actif = true;
    await pollVideoAction('fal-ai/x::4', ids.livree);
    espion.actif = false;
    expect(espion.ecritures, 'un second onglet réécrit une vidéo déjà livrée').toEqual([]);
  });
});
