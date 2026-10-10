import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * SEC-10 / E5 · au niveau de la GARDE STUDIO (`lib/studios/garde.ts`), pas
 * seulement du noyau.
 *
 * Un e-mail inscrit dans `platform_staff` AVANT que son compte existe peut être
 * capté par quiconque s'inscrit avec lui. On compose la vraie chaîne : base
 * pglite → `equipeDeSession` (lit l'antériorité) → session → `gardeStudio`
 * (permissions effectives du studio). Le compte capté ne reçoit AUCUNE
 * permission de portée plateforme ; le compte légitime garde les huit.
 */

const etat = vi.hoisted(() => ({ session: null as unknown }));
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), capte: randomUUID(), legitime: randomUUID() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));

import { db, schema } from '@tiktrends/db';
import { PERMISSIONS_PLATEFORME } from '@tiktrends/core';
import { equipeDeSession } from '../lib/equipe-plateforme';
import { gardeStudio } from '../lib/studios/garde';

const JANVIER = new Date('2026-01-01T00:00:00Z');
const FEVRIER = new Date('2026-02-01T00:00:00Z');
const CAPTE = 'capte@sec.test';
const LEGITIME = 'legitime@sec.test';

async function sessionDe(id: string, email: string) {
  return {
    user: { id, email, name: null }, workspaceId: ids.ws, workspaceName: 'Plateforme',
    role: 'owner', plan: 'business', equipe: await equipeDeSession(email),
  };
}

async function portee(id: string, email: string): Promise<string[]> {
  etat.session = await sessionDe(id, email);
  const g = await gardeStudio('studio.read');
  if (!('ctx' in g)) throw new Error('la garde a refusé la lecture');
  return [...g.ctx.permissions.plateforme].sort();
}

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Plateforme', plan: 'business' });
  // Capté · entrée staff en JANVIER, compte créé en FÉVRIER.
  await db!.insert(schema.platformStaff).values({ email: CAPTE, role: 'adminplus', createdAt: JANVIER });
  await db!.insert(schema.users).values({ id: ids.capte, email: CAPTE, createdAt: FEVRIER });
  // Légitime · compte en JANVIER, inscrit à l'équipe en FÉVRIER.
  await db!.insert(schema.users).values({ id: ids.legitime, email: LEGITIME, createdAt: JANVIER });
  await db!.insert(schema.platformStaff).values({ email: LEGITIME, role: 'adminplus', createdAt: FEVRIER });
  await db!.insert(schema.workspaceMembers).values([
    { workspaceId: ids.ws, userId: ids.capte, role: 'owner' },
    { workspaceId: ids.ws, userId: ids.legitime, role: 'owner' },
  ]);
});

describe('SEC-10 · gardeStudio · portée plateforme selon l’antériorité', () => {
  it('compte capté (créé après son entrée staff) · aucune permission plateforme', async () => {
    expect(await portee(ids.capte, CAPTE), 'le compte capté reçoit des permissions plateforme par la garde studio').toEqual([]);
  });

  it('compte légitime (antérieur à son entrée staff) · les huit permissions, inchangé', async () => {
    expect(await portee(ids.legitime, LEGITIME)).toEqual([...PERMISSIONS_PLATEFORME].sort());
  });

  it('la portée espace du compte capté reste celle de son rôle d’espace (rien d’autre n’est retiré)', async () => {
    etat.session = await sessionDe(ids.capte, CAPTE);
    const g = await gardeStudio('studio.generate');
    expect('ctx' in g).toBe(true);
  });
});
