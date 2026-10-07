import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Supprimer une marque après le studio · vraie action, vraie base (pglite,
 * migrations et clés étrangères réelles), vraie page.
 *
 * Défaut reproduit : chaque tour de Jarvis écrit une trace `studio_prompt_runs`
 * liée à la marque en RESTRICT · supprimer une marque qui avait seulement
 * conversé faisait tomber l'action sur une violation de clé étrangère.
 *
 * On vérifie, en base :
 *  - marque avec traces Jarvis seulement · supprimée, ses traces aussi, celles
 *    d'une autre marque et la dépense `ai_spend` intactes ;
 *  - marque avec un projet studio · refusée, rien d'effacé, motif affiché ;
 *  - marque à laquelle un membre est limité · refusée, la restriction reste.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), user: randomUUID(), membre: randomUUID(), jarvis: randomUUID(), autre: randomUUID(), projet: randomUUID(), limitee: randomUUID() };
});
const h = vi.hoisted(() => ({ session: null as unknown }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, delete: () => {} }) }));

import { db, schema, eq } from '@tiktrends/db';
import { MESSAGES_SUPPRESSION_MARQUE } from '@tiktrends/core';
import { deleteBrandAction } from '../app/actions/brands';
import BrandsPage from '../app/(app)/brands/page';

const admin = () => ({ user: { id: ids.user, email: 'admin@client.test', name: null }, workspaceId: ids.ws, workspaceName: 'Démo', role: 'owner', plan: 'core', equipe: null });
async function supprimer(id: string): Promise<string> {
  const f = new FormData();
  f.set('id', id);
  try { await deleteBrandAction(f); return 'aucune redirection'; } catch (e) { return (e as Error).message; }
}
const run = (brandId: string) => ({
  workspaceId: ids.ws, brandId, templateKey: 'jarvis.conversation', compiledHash: 'c'.repeat(64),
  contextSnapshotHash: 'd'.repeat(64), model: 'simule', status: 'succeeded' as const,
});
const marque = async (id: string) => db.select().from(schema.brands).where(eq(schema.brands.id, id));

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.ws, name: 'Démo', plan: 'core' });
  await db.insert(schema.users).values([{ id: ids.user, email: 'admin@client.test' }, { id: ids.membre, email: 'membre@client.test' }]);
  await db.insert(schema.workspaceMembers).values({ workspaceId: ids.ws, userId: ids.membre, role: 'member' });
  await db.insert(schema.brands).values([
    { id: ids.jarvis, workspaceId: ids.ws, name: 'A conversé' },
    { id: ids.autre, workspaceId: ids.ws, name: 'Autre' },
    { id: ids.projet, workspaceId: ids.ws, name: 'A un projet' },
    { id: ids.limitee, workspaceId: ids.ws, name: 'Limitée' },
  ]);
  await db.insert(schema.studioPromptRuns).values([run(ids.jarvis), run(ids.jarvis), run(ids.autre)]);
  await db.insert(schema.aiSpend).values({ workspaceId: ids.ws, provider: 'anthropic', action: 'jarvis-chat', actualUsd: 0.01 });
  await db.insert(schema.studioProjects).values({ workspaceId: ids.ws, brandId: ids.projet, kind: 'image', title: 'Projet conservé' });
  await db.insert(schema.studioMemberBrandScopes).values({ workspaceId: ids.ws, userId: ids.membre, brandId: ids.limitee });
});
beforeEach(() => { h.session = admin(); });

describe('supprimer une marque après le studio', () => {
  it('marque qui a seulement conversé avec Jarvis · supprimée avec ses traces, le reste intact', async () => {
    expect(await supprimer(ids.jarvis)).toBe('REDIRECT /brands?ok=deleted');
    expect(await marque(ids.jarvis)).toHaveLength(0);
    const runs = await db.select().from(schema.studioPromptRuns);
    expect(runs.map((r) => r.brandId)).toEqual([ids.autre]);
    expect(await db.select().from(schema.aiSpend)).toHaveLength(1);
  });

  it('marque avec un projet studio · refusée, rien d’effacé', async () => {
    expect(await supprimer(ids.projet)).toBe('REDIRECT /brands?e=studio_historique');
    expect(await marque(ids.projet)).toHaveLength(1);
    expect(await db.select().from(schema.studioProjects)).toHaveLength(1);
  });

  it('marque à laquelle un membre est limité · refusée, la restriction reste', async () => {
    expect(await supprimer(ids.limitee)).toBe('REDIRECT /brands?e=studio_restrictions');
    expect(await marque(ids.limitee)).toHaveLength(1);
    expect(await db.select().from(schema.studioMemberBrandScopes)).toHaveLength(1);
  });

  it('le motif du refus est affiché sur la page des marques', async () => {
    for (const code of ['studio_historique', 'studio_restrictions'] as const) {
      const html = renderToStaticMarkup(await BrandsPage({ searchParams: Promise.resolve({ e: code }) }));
      expect(html).toContain(MESSAGES_SUPPRESSION_MARQUE[code]);
    }
  });
});
