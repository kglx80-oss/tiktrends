import { randomUUID } from 'node:crypto';
import type { Session } from '../lib/auth';

/**
 * Semis commun des tests studios · deux espaces, trois marques, cinq personnes.
 *
 *   espace A : marques A1, A2 · membre `ua` (toutes marques), lecteur `uv`,
 *              membre restreint `ur` (A1 seulement)
 *   espace B : marque B1 · membre `ub`
 *
 * Les identifiants sont tirés au moment de l'import · `vi.hoisted` les rend
 * visibles des mocks.
 */
export function idsStudios() {
  return {
    wsA: randomUUID(), wsB: randomUUID(),
    brandA1: randomUUID(), brandA2: randomUUID(), brandB1: randomUUID(),
    ua: randomUUID(), uv: randomUUID(), ur: randomUUID(), ub: randomUUID(),
  };
}
export type IdsStudios = ReturnType<typeof idsStudios>;

export type SessionTest = Pick<Session, 'user' | 'workspaceId' | 'workspaceName' | 'role' | 'plan' | 'equipe'>;

export function session(ids: IdsStudios, qui: 'ua' | 'uv' | 'ur' | 'ub', surcharge: Partial<SessionTest> = {}): SessionTest {
  const ws = qui === 'ub' ? ids.wsB : ids.wsA;
  const role = qui === 'uv' ? 'client_viewer' : 'member';
  return {
    user: { id: ids[qui], email: `${qui}@studios.test`, name: null },
    workspaceId: ws, workspaceName: ws === ids.wsA ? 'Espace A' : 'Espace B',
    role, plan: 'core', equipe: null, ...surcharge,
  };
}

// Le type du client drizzle est volontairement lâche ici · le semis n'écrit que des colonnes simples.
export async function semer(db: any, schema: any, ids: IdsStudios): Promise<void> {
  await db.insert(schema.workspaces).values([
    { id: ids.wsA, name: 'Espace A', plan: 'core' },
    { id: ids.wsB, name: 'Espace B', plan: 'core' },
  ]);
  await db.insert(schema.users).values(['ua', 'uv', 'ur', 'ub'].map((q) => ({ id: ids[q as 'ua'], email: `${q}@studios.test` })));
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: ids.wsA, userId: ids.ua, role: 'member' },
    { workspaceId: ids.wsA, userId: ids.uv, role: 'client_viewer' },
    { workspaceId: ids.wsA, userId: ids.ur, role: 'member' },
    { workspaceId: ids.wsB, userId: ids.ub, role: 'member' },
  ]);
  await db.insert(schema.brands).values([
    { id: ids.brandA1, workspaceId: ids.wsA, name: 'Marque A1' },
    { id: ids.brandA2, workspaceId: ids.wsA, name: 'Marque A2' },
    { id: ids.brandB1, workspaceId: ids.wsB, name: 'Marque B1 secrète' },
  ]);
  // `ur` est restreint à A1 · A2 lui est fermée.
  await db.insert(schema.studioMemberBrandScopes).values({ workspaceId: ids.wsA, userId: ids.ur, brandId: ids.brandA1 });
}
