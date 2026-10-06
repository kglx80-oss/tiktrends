import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Message 63 · le serveur exige la confirmation quand une nouvelle version
 * DÉPLACE la portée hors de son espace (espace A → marque d'un espace B), et
 * n'écrit rien au refus. Resserrer chez soi (espace A → marque de A) passe.
 * Actions réelles, base pglite réelle · on lit la ligne stockée.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { wsA: randomUUID(), wsB: randomUUID(), bA: randomUUID(), bB: randomUUID() };
});
const h = vi.hoisted(() => ({ session: null as unknown }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import type { SaisieConnaissance } from '@tiktrends/core';
import { creerConnaissanceAction, nouvelleVersionAction } from '../app/actions/connaissances';

const adminPlus = () => ({ user: { id: 'u', email: 'equipe@agence.test', name: null }, workspaceId: ids.wsA, workspaceName: 'A', role: 'owner', plan: 'plus', equipe: { role: 'adminplus', matrice: {} } });
const saisie = (portee: SaisieConnaissance['portee'], texte = 'TEXTE_63'): SaisieConnaissance => ({ titre: 'Portée 63', type: 'savoir', texte, origine: { mode: 'saisie' }, portee });
const ligne = async (id: string) => (await db.select({ v: schema.appSettings.value, u: schema.appSettings.updatedAt }).from(schema.appSettings).where(eq(schema.appSettings.key, `connaissance:${id}`)))[0];

beforeAll(async () => {
  await db.insert(schema.workspaces).values([{ id: ids.wsA, name: 'A' }, { id: ids.wsB, name: 'B' }]);
  await db.insert(schema.brands).values([{ id: ids.bA, workspaceId: ids.wsA, name: 'Marque A' }, { id: ids.bB, workspaceId: ids.wsB, name: 'Marque B' }]);
});
beforeEach(() => { h.session = adminPlus(); });

async function enEspaceA(): Promise<string> {
  const r = await creerConnaissanceAction({ ...saisie({ niveau: 'espace', workspaceId: ids.wsA }), publier: true });
  if (!r.id) throw new Error(r.error);
  return r.id;
}

describe('nouvelle version · déplacement hors de l’espace', () => {
  it('espace A → marque de B sans confirmation · refus, ligne stockée IDENTIQUE', async () => {
    const id = await enEspaceA();
    const avant = await ligne(id);
    const r = await nouvelleVersionAction({ id, base: 1, saisie: saisie({ niveau: 'marque', workspaceId: ids.wsB, brandId: ids.bB }, 'TEXTE_DEPLACE'), publier: true });
    expect(r.error).toBe('Cette version déplace la portée · confirme-le avant d’enregistrer.');
    expect(await ligne(id)).toEqual(avant);
  });

  it('espace A → marque de B AVEC confirmation · v2 écrite à la nouvelle portée', async () => {
    const id = await enEspaceA();
    const r = await nouvelleVersionAction({ id, base: 1, saisie: saisie({ niveau: 'marque', workspaceId: ids.wsB, brandId: ids.bB }), confirmerPortee: true });
    expect(r.error).toBeUndefined();
    const v = (await ligne(id))!.v as { versions: Array<{ n: number; portee: { niveau: string; workspaceId?: string } }> };
    expect(v.versions.find((x) => x.n === 2)!.portee).toEqual({ niveau: 'marque', workspaceId: ids.wsB, brandId: ids.bB });
  });

  it('espace A → marque de A · resserrement chez soi, sans confirmation', async () => {
    const id = await enEspaceA();
    const r = await nouvelleVersionAction({ id, base: 1, saisie: saisie({ niveau: 'marque', workspaceId: ids.wsA, brandId: ids.bA }) });
    expect(r.error).toBeUndefined();
  });

  it('plateforme → espace · resserrement, sans confirmation', async () => {
    const c = await creerConnaissanceAction({ ...saisie({ niveau: 'plateforme' }), publier: true, confirmerPlateforme: true });
    const r = await nouvelleVersionAction({ id: c.id!, base: 1, saisie: saisie({ niveau: 'espace', workspaceId: ids.wsB }) });
    expect(r.error).toBeUndefined();
  });
});
