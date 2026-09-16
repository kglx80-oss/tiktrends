import { describe, it, expect, vi, beforeAll } from 'vitest';

// Ids partagés entre les mocks (hoistés) et le semis.
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { attackerWs: randomUUID(), attackerUser: randomUUID(), victimWs: randomUUID(), victimGen: randomUUID() };
});

// Base pglite réelle.
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

// Session de l'ATTAQUANT · son espace, pas celui de la victime.
vi.mock('../lib/auth', () => ({
  getSession: async () => ({
    user: { id: ids.attackerUser, email: 'attaquant@test.local', name: null },
    workspaceId: ids.attackerWs, workspaceName: 'Attaquant', role: 'member', plan: 'core',
  }),
}));

// Le fournisseur vidéo répond « échec » · c'est ce qui déclenche failAndRefund.
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  return {
    ...actual,
    isFalJob: () => true,
    falFromEnv: () => ({}),
    falGetVideo: async () => ({ status: 'failed', error: 'échec simulé' }),
  };
});

import { db, schema, eq } from '@tiktrends/db';
import { pollVideoAction } from '../app/actions/video';

/**
 * Le pendant RÉSULTAT du garde de source `video-poll-isolation.test.ts` (#518).
 * Un attaquant appelle `pollVideoAction` avec le `generationId` d'un AUTRE
 * espace et un jobId qu'il contrôle (répondant « échec »). Avant le correctif,
 * ça marquait la génération de la victime en échec ET créditait l'espace de
 * l'attaquant. On vérifie ici, sur une vraie base, qu'il ne se passe RIEN.
 */
beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.attackerWs, name: 'Attaquant', creditsBalance: 0 });
  await db.insert(schema.users).values({ id: ids.attackerUser, email: 'attaquant@test.local' });
  await db.insert(schema.workspaceMembers).values({ workspaceId: ids.attackerWs, userId: ids.attackerUser, role: 'member' });

  await db.insert(schema.workspaces).values({ id: ids.victimWs, name: 'Victime', creditsBalance: 100 });
  const [vBrand] = await db.insert(schema.brands).values({ workspaceId: ids.victimWs, name: 'Marque victime' }).returning();
  // Génération vidéo de la victime · en cours, coût 10 crédits.
  await db.insert(schema.generations).values({ id: ids.victimGen, brandId: vBrand!.id, kind: 'video', status: 'processing', creditsCost: 10 });
});

describe('pollVideoAction · un generationId d’un autre espace ne produit aucun effet', () => {
  it('ne marque pas la génération de la victime en échec et ne crédite pas l’attaquant', async () => {
    await pollVideoAction('fal-job-attaquant', ids.victimGen);

    const [gen] = await db.select().from(schema.generations).where(eq(schema.generations.id, ids.victimGen));
    expect(gen?.status, 'la génération de la victime ne doit pas passer en échec').toBe('processing');

    const [attackerWs] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, ids.attackerWs));
    expect(attackerWs?.creditsBalance, 'l’attaquant ne doit recevoir aucun remboursement').toBe(0);

    const ledger = await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, ids.attackerWs));
    expect(ledger.length, 'aucune écriture de crédit pour l’attaquant').toBe(0);
  });
});
